import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePhotoPath } from "./paths";
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
export async function browseDirectory(relPath: string): Promise<BrowseResult> {
  const absolute = resolvePhotoPath(relPath);
  const entries = await readdir(absolute, { withFileTypes: true });

  const folders: FolderEntry[] = [];
  const photos: PhotoEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const { photoCount, previews } = await summarizeFolder(path.join(absolute, entry.name), entryRelPath);
      folders.push({ name: entry.name, path: entryRelPath, photoCount, previews });
      continue;
    }

    if (entry.isFile() && isImageFile(entry.name)) {
      const fileStat = await stat(path.join(absolute, entry.name));
      photos.push({
        name: entry.name,
        path: entryRelPath,
        mtimeMs: fileStat.mtimeMs,
        birthtimeMs: fileStat.birthtimeMs,
        size: fileStat.size,
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  photos.sort((a, b) => a.name.localeCompare(b.name));

  const parentPath = relPath ? path.dirname(relPath).replace(/^\.$/, "") : null;

  return { path: relPath, parentPath, folders, photos };
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

/** Finds the first photo within a directory (recursing into subfolders) to use as a cover. */
export async function findCoverPhoto(relPath: string): Promise<string | null> {
  const { photos, folders } = await browseDirectory(relPath);

  if (photos[0]) {
    return photos[0].path;
  }

  for (const folder of folders) {
    const nested = await findCoverPhoto(folder.path);
    if (nested) {
      return nested;
    }
  }

  return null;
}
