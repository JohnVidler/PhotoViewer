import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config";

let database: DatabaseSync | null = null;

/** Opens (creating and migrating on first use) the application database in the config volume. */
export function getDb(): DatabaseSync {
  if (database) {
    return database;
  }

  mkdirSync(config.configDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.configDir, "photoviewer.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  // Early development builds identified users through an external OpenID Connect provider. Those accounts
  // have no passwords, so they can't be carried over: drop them (photo folders on disk are left alone).
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (columns.some((column) => column.name === "issuer")) {
    console.warn("Found accounts from an older sign-in system; clearing them. Create the first account again.");
    db.exec("DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS login_attempts; DROP TABLE users;");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Lowercase; also the name of the user's folder inside the photos directory.
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
      created_at    INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- A folder (never a single photo) of the owner's library, shared either with one user or via a public link.
    -- The files are never copied: a share is only a pointer, so there is always exactly one copy.
    CREATE TABLE IF NOT EXISTS shares (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path       TEXT NOT NULL CHECK (path <> ''),
      grantee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT UNIQUE,
      can_write  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      CHECK ((grantee_id IS NULL) <> (token IS NULL)),
      CHECK (token IS NULL OR can_write = 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS shares_one_per_user ON shares (owner_id, path, grantee_id) WHERE grantee_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shares_one_public ON shares (owner_id, path) WHERE token IS NOT NULL;

    -- Only a hash of the session token is stored, so a leaked database can't be replayed as cookies.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  database = db;
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/** Runs `work` inside a write transaction that is rolled back if it throws. */
export function transaction<T>(work: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
