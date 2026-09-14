import { Response } from "express";
import bcrypt from "bcryptjs";
import { IUser, User } from "../models/User";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../services/token.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { env } from "../config/env";
import { sendOtpEmail } from "../services/email.service";
import { generateOtpCode, hashOtp, compareOtp, OTP_TTL_MS } from "../utils/otp";

const REFRESH_COOKIE = "typeflow_refresh";

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

function serializeUser(user: IUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    bestWpm: user.bestWpm,
    role: user.role,
    isVerified: user.isVerified,
  };
}

async function issueOtp(user: IUser, purpose: "verify" | "reset"): Promise<void> {
  const code = generateOtpCode();
  user.otp = { codeHash: await hashOtp(code), purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) };
  await user.save();
  await sendOtpEmail(user.email, code, purpose);
}

export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
  if (!username || !email || !password) {
    throw new ApiError(400, "username, email and password are required");
  }
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  if (username.length < 3 || username.length > 20) {
    throw new ApiError(400, "Username must be between 3 and 20 characters");
  }

  const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
  if (existing) {
    throw new ApiError(409, "Username or email already in use");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, email: email.toLowerCase(), passwordHash });
  await issueOtp(user, "verify");

  const payload = { userId: user.id, username: user.username };
  const accessToken = signAccessToken(payload);
  setRefreshCookie(res, signRefreshToken(payload));

  res.status(201).json({ accessToken, user: serializeUser(user) });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) throw new ApiError(400, "email and code are required");

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.otp || user.otp.purpose !== "verify") {
    throw new ApiError(400, "No pending verification for this email");
  }
  if (user.otp.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "Code expired - request a new one");
  }
  if (!(await compareOtp(code, user.otp.codeHash))) {
    throw new ApiError(400, "Incorrect code");
  }

  user.isVerified = true;
  user.otp = undefined;
  await user.save();

  res.json({ user: serializeUser(user) });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { email, purpose } = req.body as { email?: string; purpose?: "verify" | "reset" };
  if (!email || (purpose !== "verify" && purpose !== "reset")) {
    throw new ApiError(400, "email and a valid purpose are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  // Same response whether or not the account exists, so this can't be used to
  // probe which emails are registered.
  if (user && !(purpose === "verify" && user.isVerified)) {
    await issueOtp(user, purpose);
  }
  res.json({ message: "If that account exists, a code has been sent." });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) throw new ApiError(400, "email is required");

  const user = await User.findOne({ email: email.toLowerCase() });
  if (user) await issueOtp(user, "reset");
  res.json({ message: "If that account exists, a reset code has been sent." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body as { email?: string; code?: string; newPassword?: string };
  if (!email || !code || !newPassword) throw new ApiError(400, "email, code and newPassword are required");
  if (newPassword.length < 8) throw new ApiError(400, "Password must be at least 8 characters");

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !user.otp || user.otp.purpose !== "reset") {
    throw new ApiError(400, "No pending reset for this email");
  }
  if (user.otp.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "Code expired - request a new one");
  }
  if (!(await compareOtp(code, user.otp.codeHash))) {
    throw new ApiError(400, "Incorrect code");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.otp = undefined;
  await user.save();

  res.json({ message: "Password updated - you can log in now." });
});

export const login = asyncHandler(async (req, res) => {
  const { emailOrUsername, password } = req.body as { emailOrUsername?: string; password?: string };
  if (!emailOrUsername || !password) {
    throw new ApiError(400, "emailOrUsername and password are required");
  }

  const user = await User.findOne({
    $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
  });
  if (!user) throw new ApiError(401, "Invalid credentials");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid credentials");

  const payload = { userId: user.id, username: user.username };
  const accessToken = signAccessToken(payload);
  setRefreshCookie(res, signRefreshToken(payload));

  res.json({ accessToken, user: serializeUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = (req as AuthedRequest).cookies?.[REFRESH_COOKIE];
  if (!token) throw new ApiError(401, "No refresh token");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const accessToken = signAccessToken({ userId: payload.userId, username: payload.username });
  res.json({ accessToken });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.status(204).send();
});

export const me = asyncHandler(async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId).select("-passwordHash");
  if (!user) throw new ApiError(404, "User not found");
  res.json({ user: serializeUser(user) });
});
