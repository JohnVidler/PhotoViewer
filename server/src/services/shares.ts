import { randomBytes } from "node:crypto";
import { getDb } from "./db";

/**
 * Shares point at a folder of the owner's library. They never copy anything, so a shared folder is the owner's
 * actual folder: changes by either side are immediately seen by the other.
 */

export interface ShareRecord {
  id: number;
  ownerId: number;
  ownerUsername: string;
  /** Folder inside the owner's library (never empty, never a single photo). */
  path: string;
  /** Set for shares with one user; null for public links. */
  granteeId: number | null;
  granteeUsername: string | null;
  /** Set for public links; null for shares with one user. */
  token: string | null;
  canWrite: boolean;
  createdAt: number;
}

interface ShareRow {
  id: number;
  owner_id: number;
  owner_username: string;
  path: string;
  grantee_id: number | null;
  grantee_username: string | null;
  token: string | null;
  can_write: number;
  created_at: number;
}

const SELECT = `
  SELECT s.id, s.owner_id, owner.username AS owner_username, s.path, s.grantee_id,
         grantee.username AS grantee_username, s.token, s.can_write, s.created_at
  FROM shares s
  JOIN users owner ON owner.id = s.owner_id
  LEFT JOIN users grantee ON grantee.id = s.grantee_id`;

function toShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    path: row.path,
    granteeId: row.grantee_id,
    granteeUsername: row.grantee_username,
    token: row.token,
    canWrite: row.can_write === 1,
    createdAt: row.created_at,
  };
}

/** Shares with one user, as seen by that user. Folders of locked owners are hidden. */
export function listSharedWithUser(userId: number): ShareRecord[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE s.grantee_id = ? AND owner.status = 'active' ORDER BY owner.username, s.path`)
    .all(userId) as unknown as ShareRow[];
  return rows.map(toShare);
}

export function findSharedWithUser(shareId: number, userId: number): ShareRecord | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE s.id = ? AND s.grantee_id = ? AND owner.status = 'active'`)
    .get(shareId, userId) as ShareRow | undefined;
  return row ? toShare(row) : null;
}

export function findPublicShare(token: string): ShareRecord | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE s.token = ? AND owner.status = 'active'`)
    .get(token) as ShareRow | undefined;
  return row ? toShare(row) : null;
}

/** Everything the owner has shared from one folder: people with access, and the public link if there is one. */
export function listSharesForPath(ownerId: number, path: string): ShareRecord[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE s.owner_id = ? AND s.path = ? ORDER BY grantee.username`)
    .all(ownerId, path) as unknown as ShareRow[];
  return rows.map(toShare);
}

/** Paths of the owner's folders that are shared with anyone (users or a public link). */
export function listSharedPaths(ownerId: number): Set<string> {
  const rows = getDb().prepare("SELECT DISTINCT path FROM shares WHERE owner_id = ?").all(ownerId) as unknown as {
    path: string;
  }[];
  return new Set(rows.map((row) => row.path));
}

/** Shares with a user (or updates their permission if they already have one). */
export function shareWithUser(ownerId: number, path: string, granteeId: number, canWrite: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO shares (owner_id, path, grantee_id, can_write, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (owner_id, path, grantee_id) WHERE grantee_id IS NOT NULL DO UPDATE SET can_write = excluded.can_write`,
    )
    .run(ownerId, path, granteeId, canWrite ? 1 : 0, Date.now());
}

/** Turns on the public link for a folder (keeping the existing link if there already is one) and returns it. */
export function enablePublicShare(ownerId: number, path: string): ShareRecord {
  const db = getDb();
  const existing = db
    .prepare(`${SELECT} WHERE s.owner_id = ? AND s.path = ? AND s.token IS NOT NULL`)
    .get(ownerId, path) as ShareRow | undefined;
  if (existing) {
    return toShare(existing);
  }

  // 192 random bits: the link can't be guessed, which is the only thing protecting a public share.
  const token = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO shares (owner_id, path, token, can_write, created_at) VALUES (?, ?, ?, 0, ?)").run(
    ownerId,
    path,
    token,
    Date.now(),
  );
  return toShare(db.prepare(`${SELECT} WHERE s.token = ?`).get(token) as unknown as ShareRow);
}

/** Only the owner can change a share. Returns false if there is no such share belonging to them. */
export function setShareWrite(ownerId: number, shareId: number, canWrite: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE shares SET can_write = ? WHERE id = ? AND owner_id = ? AND grantee_id IS NOT NULL")
    .run(canWrite ? 1 : 0, shareId, ownerId);
  return Number(result.changes) > 0;
}

export function removeShare(ownerId: number, shareId: number): boolean {
  const result = getDb().prepare("DELETE FROM shares WHERE id = ? AND owner_id = ?").run(shareId, ownerId);
  return Number(result.changes) > 0;
}

/** The person a folder is shared with stops having access. Returns false if it isn't shared with them. */
export function leaveShare(granteeId: number, shareId: number): boolean {
  const result = getDb().prepare("DELETE FROM shares WHERE id = ? AND grantee_id = ?").run(shareId, granteeId);
  return Number(result.changes) > 0;
}

/** Shares that point at `path` or anything inside it. */
function affected(ownerId: number, path: string): { id: number; path: string }[] {
  const rows = getDb().prepare("SELECT id, path FROM shares WHERE owner_id = ?").all(ownerId) as unknown as {
    id: number;
    path: string;
  }[];
  return rows.filter((row) => row.path === path || row.path.startsWith(`${path}/`));
}

/** A shared folder (or one containing shared folders) was renamed or moved: its shares follow it. */
export function followMovedPath(ownerId: number, from: string, to: string): void {
  const update = getDb().prepare("UPDATE shares SET path = ? WHERE id = ?");
  for (const row of affected(ownerId, from)) {
    update.run(to + row.path.slice(from.length), row.id);
  }
}

/** A shared folder was deleted: remove its shares, so a new folder that later takes the name isn't exposed. */
export function dropSharesUnder(ownerId: number, path: string): void {
  const remove = getDb().prepare("DELETE FROM shares WHERE id = ?");
  for (const row of affected(ownerId, path)) {
    remove.run(row.id);
  }
}
