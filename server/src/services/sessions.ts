import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { config } from "../config";
import { getDb } from "./db";
import type { UserRecord } from "./users";
import { getUserById } from "./users";

export const SESSION_COOKIE = "pv_session";

// Extend a session's life at most this often, to avoid a database write on every request.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setCookie(res: Response, name: string, value: string, maxAgeMs: number): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (config.secureCookies) {
    attributes.push("Secure");
  }
  res.append("Set-Cookie", attributes.join("; "));
}

export function clearCookie(res: Response, name: string): void {
  setCookie(res, name, "", 0);
}

export function createSession(res: Response, user: UserRecord): void {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), user.id, now, now + config.sessionMs);

  setCookie(res, SESSION_COOKIE, token, config.sessionMs);
}

export function destroySession(req: Request, res: Response): void {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
  clearCookie(res, SESSION_COOKIE);
}

/** Returns the active, unlocked user for the request's session cookie, if any. */
export function userFromRequest(req: Request): UserRecord | null {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { user_id: number; expires_at: number } | undefined;
  if (!row) {
    return null;
  }

  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  const user = getUserById(row.user_id);
  if (!user || user.status !== "active") {
    return null;
  }

  if (row.expires_at - now < config.sessionMs - REFRESH_INTERVAL_MS) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(now + config.sessionMs, tokenHash);
  }

  return user;
}

export function purgeExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}
