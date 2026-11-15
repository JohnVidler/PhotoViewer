import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { getDb, getSetting, setSetting, transaction } from "./db";
import { hashPassword, passwordProblem, verifyAgainstNobody, verifyPassword } from "./passwords";
import { removeCachedThumbnailsUnderFolder } from "./thumbnailCache";

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "locked";

export interface UserRecord {
  id: number;
  /** Lowercase; also the name of this user's folder inside the photos directory. */
  username: string;
  /** Optional friendly name shown to other people. Purely cosmetic: it is never used to identify or locate anyone. */
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  lastLoginAt: number | null;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: number;
  last_login_at: number | null;
}

const USER_COLUMNS = "id, username, display_name, role, status, created_at, last_login_at";

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function getUserById(id: number): UserRecord | null {
  const row = getDb().prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUserByUsername(raw: string): UserRecord | null {
  const row = getDb()
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
    .get(raw.trim().toLowerCase()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

/**
 * How a person is named to other people. When they've chosen a display name the username is shown too, so a
 * display name can never be used to pass yourself off as someone else.
 */
export function describeUser(displayName: string | null, username: string): string {
  return displayName ? `${displayName} (@${username})` : username;
}

export const MAX_DISPLAY_NAME_LENGTH = 50;

/** Returns the cleaned name (null for "none"), or a message explaining what is wrong with it. */
export function checkDisplayName(raw: unknown): { ok: true; displayName: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, displayName: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Display name must be text." };
  }

  const cleaned = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (/\p{C}/u.test(cleaned)) {
    return { ok: false, error: "Display name can't contain control or invisible characters." };
  }
  if ([...cleaned].length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, error: `Display name can be at most ${MAX_DISPLAY_NAME_LENGTH} characters.` };
  }
  return { ok: true, displayName: cleaned === "" ? null : cleaned };
}

export function setDisplayName(userId: number, displayName: string | null): void {
  getDb().prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, userId);
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count;
}

export function listUsers(): UserRecord[] {
  const rows = getDb()
    .prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at ASC, id ASC`)
    .all() as unknown as UserRow[];
  return rows.map(toUser);
}

export function signupsEnabled(): boolean {
  // Open by default once the administrator exists; they can switch it off in the admin page.
  return getSetting("signups_enabled") !== "false";
}

export function setSignupsEnabled(enabled: boolean): void {
  setSetting("signups_enabled", enabled ? "true" : "false");
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Returns a normalised (lowercase) username, or a message explaining what is wrong with it. */
export function checkUsername(raw: unknown): { ok: true; username: string } | { ok: false; error: string } {
  const username = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: "Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    };
  }
  return { ok: true, username };
}

export type CreateUserResult =
  | { ok: true; user: UserRecord }
  | { ok: false; reason: "invalid" | "unavailable" | "already_set_up"; error: string };

/**
 * Creates an account. The administrator role can only be given while no accounts exist, inside the same
 * transaction as the insert, so two simultaneous first-run setups can't both succeed.
 */
export async function createUser(
  rawUsername: unknown,
  password: unknown,
  role: UserRole,
): Promise<CreateUserResult> {
  const checked = checkUsername(rawUsername);
  if (!checked.ok) {
    return { ok: false, reason: "invalid", error: checked.error };
  }

  const problem = typeof password === "string" ? passwordProblem(password) : "Enter a password.";
  if (problem || typeof password !== "string") {
    return { ok: false, reason: "invalid", error: problem ?? "Enter a password." };
  }

  const passwordHash = await hashPassword(password);
  const { username } = checked;

  return transaction<CreateUserResult>(() => {
    const db = getDb();

    if (role === "admin" && countUsers() > 0) {
      return { ok: false, reason: "already_set_up", error: "This server has already been set up." };
    }

    // The username doubles as a folder name. Never adopt a directory that already exists on disk: it wasn't
    // created for this person, and could hold someone else's photos.
    const taken = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
    if (taken || existsSync(path.join(config.photosDir, username))) {
      return { ok: false, reason: "unavailable", error: "That username isn't available." };
    }

    const now = Date.now();
    const result = db
      .prepare("INSERT INTO users (username, password_hash, role, status, created_at) VALUES (?, ?, ?, 'active', ?)")
      .run(username, passwordHash, role, now);

    const user = getUserById(Number(result.lastInsertRowid));
    if (!user) {
      throw new Error("Failed to create user");
    }
    return { ok: true, user };
  });
}

export type AuthResult = { ok: true; user: UserRecord } | { ok: false; reason: "invalid" | "locked" };

/** Checks a username and password. Wrong usernames and wrong passwords are indistinguishable to the caller. */
export async function authenticate(rawUsername: unknown, password: unknown): Promise<AuthResult> {
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  const candidate = typeof password === "string" ? password : "";

  const row = getDb()
    .prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE username = ?`)
    .get(username) as (UserRow & { password_hash: string }) | undefined;

  if (!row) {
    await verifyAgainstNobody(candidate);
    return { ok: false, reason: "invalid" };
  }

  if (!(await verifyPassword(candidate, row.password_hash))) {
    return { ok: false, reason: "invalid" };
  }

  // Only someone who knows the password is told the account is locked.
  if (row.status === "locked") {
    return { ok: false, reason: "locked" };
  }

  const now = Date.now();
  getDb().prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, row.id);
  return { ok: true, user: toUser({ ...row, last_login_at: now }) };
}

/** Verifies a user's current password (for the change-password form). */
export async function checkPassword(userId: number, password: string): Promise<boolean> {
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  return row ? verifyPassword(password, row.password_hash) : false;
}

/** Sets a new password and signs the account out everywhere; the caller issues a fresh session if appropriate. */
export async function setPassword(userId: number, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Creates the folder that holds a user's photos. Safe to call repeatedly. */
export async function ensureUserRoot(user: UserRecord): Promise<void> {
  await mkdir(path.join(config.photosDir, user.username), { recursive: true });
}

export function setUserStatus(id: number, status: UserStatus): void {
  const db = getDb();
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
  if (status === "locked") {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
}

/**
 * Removes an account and its sessions. The user's photos are set aside in a hidden
 * folder (ignored by the gallery) unless `deletePhotos` is true, in which case they are erased.
 */
export async function deleteUser(user: UserRecord, deletePhotos: boolean): Promise<void> {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(user.id);

  const folder = path.join(config.photosDir, user.username);
  if (existsSync(folder)) {
    if (deletePhotos) {
      await rm(folder, { recursive: true, force: true });
    } else {
      await rename(folder, path.join(config.photosDir, `.deleted-${user.username}-${Date.now()}`));
    }
  }

  await removeCachedThumbnailsUnderFolder(user.username).catch((error) =>
    console.error("Failed to prune thumbnails for deleted user", error),
  );
}
