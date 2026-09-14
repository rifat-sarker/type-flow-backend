import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/token.service";
import { ApiError } from "../utils/ApiError";

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
