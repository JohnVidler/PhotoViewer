import path from "node:path";
import { config } from "../config";

// Thrown when a client-supplied relative path escapes the photos root.
export class UnsafePathError extends Error {
  constructor(relPath: string) {
    super(`Path escapes photos root: ${relPath}`);
    this.name = "UnsafePathError";
  }
}

/** Normalizes a client-supplied relative path and resolves it inside the photos root. */
export function resolvePhotoPath(relPath: string): string {
  const normalized = normalizeRelPath(relPath);
  const absolute = path.resolve(config.photosDir, normalized);

  const rootWithSep = config.photosDir.endsWith(path.sep)
    ? config.photosDir
    : config.photosDir + path.sep;

  if (absolute !== config.photosDir && !absolute.startsWith(rootWithSep)) {
    throw new UnsafePathError(relPath);
  }

  return absolute;
}

/** Strips leading slashes and rejects ".." segments so paths cannot escape the root. */
export function normalizeRelPath(relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "");
  const segments = cleaned.split("/").filter((segment) => segment.length > 0);

  if (segments.some((segment) => segment === "..")) {
    throw new UnsafePathError(relPath);
  }

  return segments.join("/");
}
