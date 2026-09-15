import crypto from "crypto";
import { Request, Response } from "express";
import { User, IUser } from "../models/User";
import { env } from "../config/env";
import { signRefreshToken } from "../services/token.service";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

const REFRESH_COOKIE = "typeflow_refresh";
const STATE_COOKIE = "typeflow_oauth_state";

type Provider = "google" | "github";

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
  },
};

export function isEnabled(p: Provider): boolean {
  const c = PROVIDERS[p];
  return !!(c.clientId && c.clientSecret);
}

/**
 * Must match a redirect URI registered with the provider *byte for byte* -
 * including the trailing slash, which is why it's built from one place.
 */
function callbackUrl(p: Provider): string {
  return `${env.SERVER_URL.replace(/\/$/, "")}/api/auth/${p}/callback`;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

/** Which providers the frontend should show buttons for. */
export const listProviders = (_req: Request, res: Response): void => {
  res.json({ providers: { google: isEnabled("google"), github: isEnabled("github") } });
};

export function startOAuth(provider: Provider) {
  return (req: Request, res: Response): void => {
    if (!isEnabled(provider)) throw new ApiError(404, `${provider} login is not configured`);
    const cfg = PROVIDERS[provider];

    // CSRF guard: random state echoed back by the provider and compared against
    // a short-lived cookie.
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, `${provider}:${state}`, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/api/auth",
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId!,
      redirect_uri: callbackUrl(provider),
      response_type: "code",
      scope: cfg.scope,
      state,
    });
    if (provider === "google") {
      params.set("access_type", "online");
      params.set("prompt", "select_account");
    }

    res.redirect(`${cfg.authUrl}?${params.toString()}`);
  };
}

interface OAuthProfile {
  providerId: string;
  email: string;
  name: string;
}

async function exchangeAndFetchProfile(provider: Provider, code: string): Promise<OAuthProfile> {
  const cfg = PROVIDERS[provider];

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      code,
      redirect_uri: callbackUrl(provider),
      grant_type: "authorization_code",
    }).toString(),
  });

  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenJson.access_token) {
    throw new ApiError(401, tokenJson.error_description || tokenJson.error || "Token exchange failed");
  }

  const auth = { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json" };

  if (provider === "google") {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: auth });
    const p = (await r.json()) as { sub?: string; email?: string; name?: string };
    if (!p.sub || !p.email) throw new ApiError(401, "Google did not return an email");
    return { providerId: p.sub, email: p.email.toLowerCase(), name: p.name || p.email.split("@")[0] };
  }

  const r = await fetch("https://api.github.com/user", { headers: auth });
  const p = (await r.json()) as { id?: number; login?: string; name?: string; email?: string };
  if (!p.id) throw new ApiError(401, "GitHub did not return a profile");

  // GitHub hides the email unless it's public, so fall back to the verified
  // primary address from the emails endpoint.
  let email = p.email;
  if (!email) {
    const er = await fetch("https://api.github.com/user/emails", { headers: auth });
    const emails = (await er.json()) as { email: string; primary: boolean; verified: boolean }[];
    email = emails?.find((e) => e.primary && e.verified)?.email ?? emails?.find((e) => e.verified)?.email;
  }
  if (!email) throw new ApiError(401, "No verified email on your GitHub account");

  return { providerId: String(p.id), email: email.toLowerCase(), name: p.name || p.login || email.split("@")[0] };
}

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "typist";
  if (!(await User.exists({ username: clean }))) return clean;
  for (let i = 0; i < 10; i++) {
    const candidate = `${clean}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `typist${Date.now().toString().slice(-8)}`;
}

async function findOrCreateUser(provider: Provider, profile: OAuthProfile): Promise<IUser> {
  const idField = provider === "google" ? "googleId" : "githubId";

  // 1. Already linked to this provider account.
  const linked = await User.findOne({ [idField]: profile.providerId });
  if (linked) return linked;

  // 2. Same email already has an account - link rather than creating a duplicate,
  //    so signing in with Google later reaches the same history and stats.
  const byEmail = await User.findOne({ email: profile.email });
  if (byEmail) {
    await User.updateOne(
      { _id: byEmail._id },
      { $set: { [idField]: profile.providerId, isVerified: true } }
    );
    byEmail.set(idField, profile.providerId);
    byEmail.isVerified = true;
    return byEmail;
  }

  // 3. Brand new account. The provider already verified the email, so skip OTP.
  return User.create({
    username: await uniqueUsername(profile.name),
    email: profile.email,
    [idField]: profile.providerId,
    isVerified: true,
  });
}

export function oauthCallback(provider: Provider) {
  return asyncHandler(async (req: Request, res: Response) => {
    const fail = (reason: string) =>
      res.redirect(`${env.CLIENT_ORIGIN}/login?error=${encodeURIComponent(reason)}`);

    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(error);
    if (!code || !state) return fail("Missing code from provider");

    const cookieState = (req as Request & { cookies?: Record<string, string> }).cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: "/api/auth" });
    if (cookieState !== `${provider}:${state}`) return fail("Invalid state - please try again");

    let user: IUser;
    try {
      const profile = await exchangeAndFetchProfile(provider, code);
      user = await findOrCreateUser(provider, profile);
    } catch (err) {
      return fail(err instanceof ApiError ? err.message : "Social login failed");
    }

    // The refresh token goes out as an httpOnly cookie and the frontend trades it
    // for an access token - no token ever lands in the URL or browser history.
    setRefreshCookie(res, signRefreshToken({ userId: user.id, username: user.username }));
    res.redirect(`${env.CLIENT_ORIGIN}/oauth/done`);
  });
}
