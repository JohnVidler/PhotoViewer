import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
import { assertVisiblePath, normalizeRelPath, rootForSlug, UnsafePathError, type PhotoRoot } from "./paths";
import { findPublicShare, findSharedWithUser, type ShareRecord } from "./shares";
import type { UserRecord } from "./users";

/**
 * Every request names a path. This turns it into the tree the visitor may work in, the root inside it, and what
 * they may do there. Three kinds of tree exist:
 *
 *   own     "Trips/Spain"                  the signed-in user's own library
 *   shared  ".shared/<shareId>/Day1"       a folder another user shared with them (rooted at that folder)
 *   public  ".public/<token>/Day1"         a folder with a public link; anyone holding the link, signed in or not
 *
 * A shared or public tree is rooted AT the shared folder, so nothing above it can be named, and symlinks that lead
 * out of it are refused when paths are resolved.
 */

/** Not signed in, and the path needs an account. */
export class SignInRequiredError extends Error {}
/** The path doesn't exist or isn't available to this visitor. Reported as "not found" so existence isn't revealed. */
export class AccessDeniedError extends Error {}
/** The visitor can see this tree but may not change it. */
export class ReadOnlyError extends Error {}

export interface Scope {
  kind: "own" | "shared" | "public";
  /** Identity of the tree. Two paths are in the same tree exactly when their keys match. */
  key: string;
  root: PhotoRoot;
  /** The requested path, relative to `root`. */
  relPath: string;
  canWrite: boolean;
  ownerId: number;
  /** Folder of the owner's library that `root` sits at ("" for an own library); used to follow renames of shared folders. */
  basePath: string;
  /** For shares: what to call it and who owns it. */
  info: { name: string; ownerName: string } | null;
}

/** The root of a share's tree, or null if its folder is gone or has been replaced by a link leading elsewhere. */
export async function rootForShare(share: ShareRecord, head: ".shared" | ".public"): Promise<PhotoRoot | null> {
  const owner = rootForSlug(share.ownerUsername);
  const dir = path.join(owner.dir, share.path);
  const selector = head === ".shared" ? String(share.id) : (share.token ?? "");

  try {
    const [realOwner, realDir, info] = await Promise.all([realpath(owner.dir), realpath(dir), stat(dir)]);
    if (!info.isDirectory() || !(realDir === realOwner || realDir.startsWith(realOwner + path.sep))) {
      return null;
    }
  } catch {
    return null;
  }

  return { dir, key: `${owner.key}/${share.path}`, prefix: `${head}/${selector}/` };
}

export async function resolveScope(user: UserRecord | null, rawPath: string): Promise<Scope> {
  const rel = normalizeRelPath(rawPath);
  const segments = rel.split("/").filter(Boolean);
  const head = segments[0];

  if (head === ".shared" || head === ".public") {
    const selector = segments[1];
    if (!selector) {
      throw new AccessDeniedError();
    }
    const inner = segments.slice(2).join("/");
    assertVisiblePath(inner);

    let share: ShareRecord | null;
    if (head === ".shared") {
      if (!user) {
        throw new SignInRequiredError();
      }
      const id = /^\d+$/.test(selector) ? Number.parseInt(selector, 10) : NaN;
      share = Number.isInteger(id) ? findSharedWithUser(id, user.id) : null;
    } else {
      share = findPublicShare(selector);
    }

    const root = share ? await rootForShare(share, head) : null;
    if (!share || !root) {
      throw new AccessDeniedError();
    }

    return {
      kind: head === ".shared" ? "shared" : "public",
      key: `${head}/${selector}`,
      root,
      relPath: inner,
      canWrite: head === ".shared" && share.canWrite,
      ownerId: share.ownerId,
      basePath: share.path,
      info: { name: path.posix.basename(share.path), ownerName: share.ownerUsername },
    };
  }

  if (!user) {
    throw new SignInRequiredError();
  }
  assertVisiblePath(rel);

  return {
    kind: "own",
    key: "own",
    root: rootForSlug(user.username),
    relPath: rel,
    canWrite: true,
    ownerId: user.id,
    basePath: "",
    info: null,
  };
}

/** Throws unless the visitor may change things in this tree. */
export function requireWrite(scope: Scope): void {
  if (!scope.canWrite) {
    throw new ReadOnlyError();
  }
}

/** A path inside the owner's library for a path inside this scope (for keeping shares pointing at moved folders). */
export function ownerPath(scope: Scope, relPath: string): string {
  return [scope.basePath, relPath].filter(Boolean).join("/");
}

/** Sends the right error response for a failed scope resolution. Returns true if it handled the error. */
export function sendScopeError(res: Response, error: unknown): boolean {
  if (error instanceof SignInRequiredError) {
    res.status(401).json({ error: "Sign in required" });
    return true;
  }
  if (error instanceof AccessDeniedError) {
    res.status(404).json({ error: "Not found" });
    return true;
  }
  if (error instanceof ReadOnlyError) {
    res.status(403).json({ error: "You can view this folder but not change it." });
    return true;
  }
  if (error instanceof UnsafePathError) {
    res.status(400).json({ error: "That location isn't allowed." });
    return true;
  }
  return false;
}
