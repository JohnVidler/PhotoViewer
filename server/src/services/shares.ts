import { randomBytes } from "node:crypto";
import { getDb, transaction } from "./db";
import { describeUser } from "./users";

/**
 * Shares point at a folder of the owner's library. They never copy anything, so a shared folder is the owner's
 * actual folder: changes by either side are immediately seen by the other.
 */

export interface ShareRecord {
  id: number;
  ownerId: number;
  ownerUsername: string;
  /** How the owner is named to other people (display name plus username, or just the username). */
  ownerLabel: string;
  /** Folder inside the owner's library (never empty, never a single photo). */
  path: string;
  /** Set for shares with one user; null for public links. */
  granteeId: number | null;
  granteeUsername: string | null;
  granteeLabel: string | null;
  /** Set for public links; null for shares with one user. */
  token: string | null;
  canWrite: boolean;
  createdAt: number;
}

interface ShareRow {
  id: number;
  owner_id: number;
  owner_username: string;
  owner_display_name: string | null;
  path: string;
  grantee_id: number | null;
  grantee_username: string | null;
  grantee_display_name: string | null;
  token: string | null;
  can_write: number;
  created_at: number;
}

const SELECT = `
  SELECT s.id, s.owner_id, owner.username AS owner_username, owner.display_name AS owner_display_name, s.path, s.grantee_id,
         grantee.username AS grantee_username, grantee.display_name AS grantee_display_name, s.token, s.can_write, s.created_at
  FROM shares s
  JOIN users owner ON owner.id = s.owner_id
  LEFT JOIN users grantee ON grantee.id = s.grantee_id`;

function toShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    ownerLabel: describeUser(row.owner_display_name, row.owner_username),
    path: row.path,
    granteeId: row.grantee_id,
    granteeUsername: row.grantee_username,
    granteeLabel: row.grantee_username ? describeUser(row.grantee_display_name, row.grantee_username) : null,
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

export const MAX_INVITE_USES = 1000;
export const DEFAULT_INVITE_USES = 5;

export interface InviteRecord {
  id: number;
  ownerId: number;
  ownerUsername: string;
  ownerLabel: string;
  path: string;
  token: string;
  canWrite: boolean;
  maxUses: number;
  uses: number;
}

interface InviteRow {
  id: number;
  owner_id: number;
  owner_username: string;
  owner_display_name: string | null;
  path: string;
  token: string;
  can_write: number;
  max_uses: number;
  uses: number;
}

const INVITE_SELECT = `
  SELECT i.id, i.owner_id, owner.username AS owner_username, owner.display_name AS owner_display_name, i.path, i.token, i.can_write, i.max_uses, i.uses
  FROM share_invites i JOIN users owner ON owner.id = i.owner_id`;

function toInvite(row: InviteRow): InviteRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    ownerLabel: describeUser(row.owner_display_name, row.owner_username),
    path: row.path,
    token: row.token,
    canWrite: row.can_write === 1,
    maxUses: row.max_uses,
    uses: row.uses,
  };
}

export function listInvitesForPath(ownerId: number, path: string): InviteRecord[] {
  const rows = getDb()
    .prepare(`${INVITE_SELECT} WHERE i.owner_id = ? AND i.path = ? ORDER BY i.id`)
    .all(ownerId, path) as unknown as InviteRow[];
  return rows.map(toInvite);
}

/** Looks an invite up by its link token. Links from locked owners don't resolve. */
export function findInvite(token: string): InviteRecord | null {
  const row = getDb().prepare(`${INVITE_SELECT} WHERE i.token = ? AND owner.status = 'active'`).get(token) as
    | InviteRow
    | undefined;
  return row ? toInvite(row) : null;
}

export function createInvite(ownerId: number, path: string, canWrite: boolean, maxUses: number): InviteRecord {
  // 192 random bits, like public links: the token is the only thing that stops the link being guessed.
  const token = randomBytes(24).toString("base64url");
  getDb()
    .prepare("INSERT INTO share_invites (owner_id, path, token, can_write, max_uses, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(ownerId, path, token, canWrite ? 1 : 0, maxUses, Date.now());
  return findInvite(token)!;
}

export function removeInvite(ownerId: number, inviteId: number): boolean {
  const result = getDb().prepare("DELETE FROM share_invites WHERE id = ? AND owner_id = ?").run(inviteId, ownerId);
  return Number(result.changes) > 0;
}

export type RedeemResult =
  | { ok: true; shareId: number; alreadyHadAccess: boolean }
  | { ok: false; reason: "not_found" | "exhausted" | "own_album" };

/**
 * Adds the invite's album to the user's account. Runs in one transaction so concurrent redemptions can never
 * overshoot the limit. Someone who already has the album (e.g. opening the link twice) doesn't use up a place,
 * and never has their permission lowered or raised by it.
 */
export function redeemInvite(token: string, userId: number): RedeemResult {
  return transaction((): RedeemResult => {
    const invite = findInvite(token);
    if (!invite) {
      return { ok: false, reason: "not_found" };
    }
    if (invite.ownerId === userId) {
      return { ok: false, reason: "own_album" };
    }

    const db = getDb();
    const existing = db
      .prepare("SELECT id FROM shares WHERE owner_id = ? AND path = ? AND grantee_id = ?")
      .get(invite.ownerId, invite.path, userId) as { id: number } | undefined;
    if (existing) {
      return { ok: true, shareId: existing.id, alreadyHadAccess: true };
    }

    if (invite.uses >= invite.maxUses) {
      return { ok: false, reason: "exhausted" };
    }

    const inserted = db
      .prepare("INSERT INTO shares (owner_id, path, grantee_id, can_write, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(invite.ownerId, invite.path, userId, invite.canWrite ? 1 : 0, Date.now());
    db.prepare("UPDATE share_invites SET uses = uses + 1 WHERE id = ?").run(invite.id);
    return { ok: true, shareId: Number(inserted.lastInsertRowid), alreadyHadAccess: false };
  });
}

/** Shares that point at `path` or anything inside it. */
function affected(ownerId: number, path: string): { id: number; path: string }[] {
  const rows = getDb().prepare("SELECT id, path FROM shares WHERE owner_id = ?").all(ownerId) as unknown as {
    id: number;
    path: string;
  }[];
  return rows.filter((row) => row.path === path || row.path.startsWith(`${path}/`));
}

function affectedInvites(ownerId: number, path: string): { id: number; path: string }[] {
  const rows = getDb().prepare("SELECT id, path FROM share_invites WHERE owner_id = ?").all(ownerId) as unknown as {
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
  const updateInvite = getDb().prepare("UPDATE share_invites SET path = ? WHERE id = ?");
  for (const row of affectedInvites(ownerId, from)) {
    updateInvite.run(to + row.path.slice(from.length), row.id);
  }
}

/** A shared folder was deleted: remove its shares, so a new folder that later takes the name isn't exposed. */
export function dropSharesUnder(ownerId: number, path: string): void {
  const remove = getDb().prepare("DELETE FROM shares WHERE id = ?");
  for (const row of affected(ownerId, path)) {
    remove.run(row.id);
  }
  const removeInvites = getDb().prepare("DELETE FROM share_invites WHERE id = ?");
  for (const row of affectedInvites(ownerId, path)) {
    removeInvites.run(row.id);
  }
}
