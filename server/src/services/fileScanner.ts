import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePhotoPath, type PhotoRoot } from "./paths";
import { readTakenAt } from "./photoDate";
import type { BrowseResult, FolderEntry, PhotoEntry, PhotoPreview } from "../types";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".tif",
  ".tiff",
  ".bmp",
]);

const FOLDER_PREVIEW_COUNT = 4;

export function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/** Lists the folders and photos directly inside the given relative directory. */
export async function browseDirectory(root: PhotoRoot, relPath: string): Promise<BrowseResult> {
  const absolute = await resolvePhotoPath(root, relPath);
  const entries = await readdir(absolute, { withFileTypes: true });
  // Paths sent to the client are what it asks for next, so inside a share they carry the share's prefix.
  const display = (rel: string) => (root.prefix + rel).replace(/\/$/, "");

  const folders: FolderEntry[] = [];
  const photos: PhotoEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const { photoCount, previews } = await summarizeFolder(path.join(absolute, entry.name), display(entryRelPath));
      folders.push({ name: entry.name, path: display(entryRelPath), photoCount, previews });
      continue;
    }

    if (entry.isFile() && isImageFile(entry.name)) {
      const filePath = path.join(absolute, entry.name);
      const fileStat = await stat(filePath);
      photos.push({
        name: entry.name,
        path: display(entryRelPath),
        mtimeMs: fileStat.mtimeMs,
        birthtimeMs: fileStat.birthtimeMs,
        takenAt: await readTakenAt(filePath, fileStat.mtimeMs),
        size: fileStat.size,
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  photos.sort((a, b) => a.name.localeCompare(b.name));

  const parentRel = path.dirname(relPath).replace(/^\.$/, "");
  const parentPath = relPath ? display(parentRel) : null;

  return { path: display(relPath), parentPath, folders, photos };
}

/** Photo count and cover photos for a whole folder; `displayPath` is the path the client will use for it. */
export async function describeFolder(absoluteDir: string, displayPath: string) {
  return summarizeFolder(absoluteDir, displayPath);
}

/** Picks `count` items spread evenly across a list, so previews aren't all from one burst of shots. */
function spreadSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) {
    return items;
  }

  return Array.from({ length: count }, (_, index) => items[Math.floor((index * items.length) / count)]!);
}

/**
 * Recursively counts image files under an absolute directory, and picks a few preview
 * photos: spread across the folder's own photos first, topped up from subfolders.
 */
async function summarizeFolder(
  absoluteDir: string,
  relDir: string,
): Promise<{ photoCount: number; previews: PhotoPreview[] }> {
  const entries = (await readdir(absoluteDir, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  const imageNames = entries.filter((entry) => entry.isFile() && isImageFile(entry.name)).map((entry) => entry.name);
  let photoCount = imageNames.length;

  const previews: PhotoPreview[] = await Promise.all(
    spreadSample(imageNames, FOLDER_PREVIEW_COUNT).map(async (name) => {
      const fileStat = await stat(path.join(absoluteDir, name));
      return { path: `${relDir}/${name}`, mtimeMs: fileStat.mtimeMs };
    }),
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nested = await summarizeFolder(path.join(absoluteDir, entry.name), `${relDir}/${entry.name}`);
    photoCount += nested.photoCount;
    previews.push(...nested.previews.slice(0, FOLDER_PREVIEW_COUNT - previews.length));
  }

  return { photoCount, previews };
}
