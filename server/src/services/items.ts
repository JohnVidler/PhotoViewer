import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, link, lstat, rename, rm, stat, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import { isImageFile } from "./fileScanner";
import { assertVisiblePath, normalizeRelPath, resolvePhotoPath, UnsafePathError, type PhotoRoot } from "./paths";
import { placeWithoutOverwriting, sanitizeSegment } from "./uploads";

/**
 * Operations on existing photos and albums inside one user's library. Every path is resolved against the
 * caller's own root, so nothing can be moved above it, into someone else's library, or deleted outside it.
 * The root itself can never be moved, renamed or deleted.
 */

export const MAX_ITEMS_PER_REQUEST = 200;

/** A problem with the request that is safe to show to the user as-is. */
export class ItemError extends Error {}

export interface MoveResult {
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

export interface CopyResult {
  copied: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

export interface DeleteResult {
  deleted: string[];
  skipped: { path: string; reason: string }[];
}

interface Item {
  rel: string;
  abs: string;
  isDirectory: boolean;
}

function checkCount(paths: string[]): void {
  if (paths.length === 0 || paths.length > MAX_ITEMS_PER_REQUEST) {
    throw new ItemError(`Choose between 1 and ${MAX_ITEMS_PER_REQUEST} items.`);
  }
}

/** Drops duplicates and anything inside another selected folder (it moves or goes with its parent). */
function withoutNested(rels: string[]): string[] {
  const unique = [...new Set(rels)];
  return unique.filter((rel) => !unique.some((other) => other !== rel && rel.startsWith(`${other}/`)));
}

/** Resolves one selected path to a real photo or album inside the root, or throws an ItemError. */
async function resolveItem(root: PhotoRoot, rel: string): Promise<Item> {
  if (!rel) {
    throw new ItemError("The top folder itself can't be changed");
  }
  assertVisiblePath(rel);

  const abs = await resolvePhotoPath(root, rel);
  // lstat, so a symlink is never touched (it could point outside the library).
  const info = await lstat(abs).catch(() => null);
  if (!info) {
    throw new ItemError("Not found");
  }

  if (info.isDirectory()) {
    return { rel, abs, isDirectory: true };
  }
  if (info.isFile() && isImageFile(abs)) {
    return { rel, abs, isDirectory: false };
  }
  throw new ItemError("Only photos and albums can be changed");
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

/** Moves an album into a directory under a free name (" (2)", " (3)"...). Never replaces an existing entry. */
async function placeDirectory(sourceAbs: string, directory: string, name: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? name : `${name} (${attempt})`;
    const target = path.join(directory, candidate);
    if (!(await exists(target))) {
      await rename(sourceAbs, target);
      return candidate;
    }
  }
}

/** Moves photos and albums into another folder of the same library. Clashes get a " (2)" suffix. */
export async function moveItems(root: PhotoRoot, rawPaths: string[], destination: string): Promise<MoveResult> {
  checkCount(rawPaths);

  // "" is the root of the user's library: the highest place anything can go.
  const destinationRel = normalizeRelPath(destination);
  assertVisiblePath(destinationRel);
  const destinationAbs = await resolvePhotoPath(root, destinationRel);
  if (!(await stat(destinationAbs).then((info) => info.isDirectory(), () => false))) {
    throw new ItemError("The destination folder doesn't exist.");
  }

  const result: MoveResult = { moved: [], skipped: [] };

  for (const rel of withoutNested(rawPaths.map(normalizeRelPath))) {
    try {
      const item = await resolveItem(root, rel);

      if (path.dirname(item.abs) === destinationAbs) {
        throw new ItemError("Already in that folder");
      }
      if (item.isDirectory && (destinationAbs === item.abs || destinationAbs.startsWith(item.abs + path.sep))) {
        throw new ItemError("An album can't be moved into itself");
      }

      const name = path.basename(item.abs);
      const placed = item.isDirectory
        ? await placeDirectory(item.abs, destinationAbs, name)
        : await placeWithoutOverwriting(item.abs, destinationAbs, name);
      result.moved.push({ from: rel, to: destinationRel ? `${destinationRel}/${placed}` : placed });
    } catch (error) {
      result.skipped.push({ path: rel, reason: reasonFor(error, `move "${rel}"`) });
    }
  }

  return result;
}

/**
 * Copies photos from one tree into a folder of another (or the same). The copy is a wholly separate file: later
 * changes or deletion on either side never affect the other. Albums can't be copied, only photos.
 */
export async function copyPhotos(
  sourceRoot: PhotoRoot,
  rawSources: string[],
  destinationRoot: PhotoRoot,
  destination: string,
): Promise<CopyResult> {
  checkCount(rawSources);

  const destinationRel = normalizeRelPath(destination);
  assertVisiblePath(destinationRel);
  const destinationAbs = await resolvePhotoPath(destinationRoot, destinationRel);
  if (!(await stat(destinationAbs).then((info) => info.isDirectory(), () => false))) {
    throw new ItemError("The destination folder doesn't exist.");
  }

  const result: CopyResult = { copied: [], skipped: [] };

  for (const rel of [...new Set(rawSources.map(normalizeRelPath))]) {
    // A hidden name keeps the half-written copy out of listings and the file watcher until it is complete.
    const temporary = path.join(destinationAbs, `.copy-${randomBytes(6).toString("hex")}`);
    try {
      const item = await resolveItem(sourceRoot, rel);
      if (item.isDirectory) {
        throw new ItemError("Only photos can be copied");
      }

      const info = await stat(item.abs);
      // COPYFILE_EXCL: never overwrite. The copy then gets a free name, and keeps the original's date for sorting.
      await copyFile(item.abs, temporary, constants.COPYFILE_EXCL);
      await utimes(temporary, info.atime, info.mtime);
      const placed = await placeWithoutOverwriting(temporary, destinationAbs, path.basename(item.abs));
      result.copied.push({ from: rel, to: destinationRel ? `${destinationRel}/${placed}` : placed });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      result.skipped.push({ path: rel, reason: reasonFor(error, `copy "${rel}"`) });
    }
  }

  return result;
}

/** Permanently deletes photos and albums (albums with everything inside them). */
export async function deleteItems(root: PhotoRoot, rawPaths: string[]): Promise<DeleteResult> {
  checkCount(rawPaths);
  const result: DeleteResult = { deleted: [], skipped: [] };

  for (const rel of withoutNested(rawPaths.map(normalizeRelPath))) {
    try {
      const item = await resolveItem(root, rel);
      // rm does not follow symlinks while recursing, so links inside an album are removed, never their targets.
      await rm(item.abs, { recursive: item.isDirectory, force: false });
      result.deleted.push(rel);
    } catch (error) {
      result.skipped.push({ path: rel, reason: reasonFor(error, `delete "${rel}"`) });
    }
  }

  return result;
}

/** Renames a photo or album in place. Photos must keep an image extension; nothing is ever overwritten. */
export async function renameItem(root: PhotoRoot, rawPath: string, rawName: string): Promise<string> {
  const rel = normalizeRelPath(rawPath);
  const name = sanitizeSegment(rawName);
  if (!name) {
    throw new ItemError("Enter a name");
  }

  const item = await resolveItem(root, rel);
  if (!item.isDirectory && !isImageFile(name)) {
    throw new ItemError("Keep a photo extension such as .jpg or .png");
  }

  const directory = path.dirname(item.abs);
  const target = path.join(directory, name);
  const newRel = path.posix.join(path.posix.dirname(rel), name).replace(/^\.\//, "");
  if (target === item.abs) {
    return rel;
  }

  // On case-insensitive filesystems "a.jpg" -> "A.jpg" finds itself; that is a legitimate rename.
  const clash = await stat(target).catch(() => null);
  const self = await stat(item.abs);
  if (clash && !(clash.ino === self.ino && name.toLowerCase() === path.basename(item.abs).toLowerCase())) {
    throw new ItemError("Something with that name already exists here");
  }

  if (item.isDirectory || clash) {
    await rename(item.abs, target);
  } else {
    try {
      // A hard link fails with EEXIST instead of replacing a file that appeared a moment ago.
      await link(item.abs, target);
      await unlink(item.abs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new ItemError("Something with that name already exists here");
      }
      // Filesystems without hard links: fall back to a plain rename (we checked for a clash above).
      await rename(item.abs, target);
    }
  }

  return newRel;
}

function reasonFor(error: unknown, action: string): string {
  if (error instanceof ItemError) {
    return error.message;
  }
  if (error instanceof UnsafePathError) {
    // Hidden names, or a link leading outside the library: refused, and nothing was touched.
    return "That item can't be changed";
  }
  console.error(`Failed to ${action}`, error);
  return "Something went wrong";
}
