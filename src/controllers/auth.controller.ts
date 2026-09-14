import { Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../services/token.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthedRequest } from "../middleware/auth";
import { env } from "../config/env";

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

  const payload = { userId: user.id, username: user.username };
  const accessToken = signAccessToken(payload);
  setRefreshCookie(res, signRefreshToken(payload));

  res.status(201).json({
    accessToken,
    user: { id: user.id, username: user.username, email: user.email, bestWpm: user.bestWpm },
  });
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

  res.json({
    accessToken,
    user: { id: user.id, username: user.username, email: user.email, bestWpm: user.bestWpm },
  });
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
  res.json({
    user: { id: user.id, username: user.username, email: user.email, bestWpm: user.bestWpm },
  });
});
