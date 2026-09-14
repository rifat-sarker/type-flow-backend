import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/token.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { User } from "../models/User";

export interface AuthedRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new ApiError(401, "Missing or invalid authorization header"));
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

// Chained after requireAuth on admin-only routes. Looks the role up fresh from the
// DB (rather than trusting the JWT payload) so a promotion/demotion takes effect
// immediately instead of waiting for the user's next login.
export const requireAdmin = asyncHandler(async (req: AuthedRequest, _res, next) => {
  const user = await User.findById(req.user!.userId).select("role");
  if (!user || user.role !== "admin") {
    throw new ApiError(403, "Admin access required");
  }
  next();
});

// Attaches req.user if a valid token is present, but never rejects the request.
// Used for endpoints that behave differently for guests vs logged-in users.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
