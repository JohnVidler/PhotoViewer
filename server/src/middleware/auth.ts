import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { rootForSlug, type PhotoRoot } from "../services/paths";
import { userFromRequest } from "../services/sessions";
import type { UserRecord } from "../services/users";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

/** Rejects requests without a valid session; otherwise exposes the account as `req.user`. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  req.user = user;
  next();
}

/** Attaches the account if there is a valid session, but lets anonymous visitors through (public links need that). */
export function optionalUser(req: Request, _res: Response, next: NextFunction): void {
  const user = userFromRequest(req);
  if (user) {
    req.user = user;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  next();
}

/** The photo root of the signed-in user. Only call behind `requireUser`. */
export function rootOf(req: Request): PhotoRoot {
  if (!req.user) {
    throw new Error("rootOf called without an authenticated user");
  }
  return rootForSlug(req.user.username);
}

/**
 * Defence in depth on top of SameSite cookies: a state-changing request that names a foreign
 * Origin is refused, so another site can never drive the API with the user's session.
 */
export function rejectForeignOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }

    // Behind a trusted reverse proxy the public host may arrive as X-Forwarded-Host.
    const forwarded = config.trustProxy ? req.headers["x-forwarded-host"] : undefined;
    const expectedHost = (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ?? req.headers.host;

    if (originHost !== expectedHost) {
      res.status(403).json({ error: "Cross-origin request refused" });
      return;
    }
  }

  next();
}
