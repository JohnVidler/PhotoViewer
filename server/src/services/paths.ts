import { realpath } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

// Thrown when a client-supplied relative path escapes the user's photo root.
export class UnsafePathError extends Error {
  constructor(relPath: string) {
    super(`Path escapes photos root: ${relPath}`);
    this.name = "UnsafePathError";
  }
}

/**
 * A folder tree the signed-in (or anonymous) visitor may work inside: their own library, or a folder
 * somebody shared. Paths handed to the file services are always relative to `dir`, so nothing above it is reachable.
 */
export interface PhotoRoot {
  /** Absolute directory of the root. */
  dir: string;
  /** The root's path relative to the photos directory ("alice" or "alice/Trips/Spain"); keys thumbnail cache entries. */
  key: string;
  /** What the client sees in front of paths inside this root: "" for the user's own library, ".shared/12/" for a share. */
  prefix: string;
}

export function rootForSlug(slug: string): PhotoRoot {
  return { dir: path.join(config.photosDir, slug), key: slug, prefix: "" };
}

/** Lexically resolves a (normalized) relative path inside a root, without touching the filesystem. */
export function lexicalPhotoPath(root: PhotoRoot, relPath: string): string {
  const normalized = normalizeRelPath(relPath);
  const absolute = path.resolve(root.dir, normalized);

  if (absolute !== root.dir && !absolute.startsWith(root.dir + path.sep)) {
    throw new UnsafePathError(relPath);
  }

  return absolute;
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + path.sep);
}

/**
 * Resolves a client-supplied relative path inside a root, and additionally follows symlinks to make
 * sure an existing target (or the nearest existing ancestor) really lives inside the root.
 */
export async function resolvePhotoPath(root: PhotoRoot, relPath: string): Promise<string> {
  const absolute = lexicalPhotoPath(root, relPath);

  let realRoot: string;
  try {
    realRoot = await realpath(root.dir);
  } catch {
    // The root doesn't exist yet (a brand-new account); nothing inside it can either.
    return absolute;
  }

  let probe = absolute;
  for (;;) {
    try {
      const real = await realpath(probe);
      if (!isInside(realRoot, real)) {
        throw new UnsafePathError(relPath);
      }
      return absolute;
    } catch (error) {
      if (error instanceof UnsafePathError) {
        throw error;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw error;
      }
      const parent = path.dirname(probe);
      if (parent === probe || !isInside(root.dir, parent)) {
        return absolute;
      }
      probe = parent;
    }
  }
}

/** Strips leading slashes and rejects ".." segments so paths cannot escape the root. */
export function normalizeRelPath(relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "");
  const segments = cleaned.split("/").filter((segment) => segment.length > 0);

  if (segments.some((segment) => segment === ".." || segment.includes("\0"))) {
    throw new UnsafePathError(relPath);
  }

  return segments.join("/");
}

/** Rejects hidden (dot-prefixed) segments. Those are reserved for internal files, temp uploads and app routes. */
export function assertVisiblePath(relPath: string): void {
  if (normalizeRelPath(relPath).split("/").some((segment) => segment.startsWith("."))) {
    throw new UnsafePathError(relPath);
  }
}
