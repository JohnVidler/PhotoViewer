import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { link, mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Request } from "express";
import busboy from "busboy";
import { config } from "../config";
import { isImageFile } from "./fileScanner";
import { assertVisiblePath, normalizeRelPath, resolvePhotoPath, type PhotoRoot } from "./paths";

export interface UploadResult {
  uploaded: { name: string; path: string }[];
  skipped: { name: string; reason: string }[];
}

const MAX_FILES_PER_REQUEST = 500;
const MAX_NAME_LENGTH = 200;

/** Reduces a client-supplied name to one safe, visible path segment ("" if nothing usable remains). */
export function sanitizeSegment(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\\/]/g, "")
      .trim()
      // Leading dots would hide the entry from the gallery (and ".." must never survive).
      .replace(/^\.+/, "")
      .slice(0, MAX_NAME_LENGTH)
      .trim()
  );
}

/** Atomically moves a file into a directory under a free name, adding " (2)", " (3)"... on clashes. The source is removed. */
export async function placeWithoutOverwriting(tempPath: string, directory: string, fileName: string): Promise<string> {
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);

  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? fileName : `${stem} (${attempt})${extension}`;
    const target = path.join(directory, candidate);

    try {
      // A hard link fails with EEXIST instead of silently replacing an existing file.
      await link(tempPath, target);
      await unlink(tempPath);
      return candidate;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        continue;
      }

      // Filesystems without hard links (some network/FAT mounts): fall back to check-then-rename.
      const exists = await stat(target).then(
        () => true,
        () => false,
      );
      if (exists) {
        continue;
      }
      await rename(tempPath, target);
      return candidate;
    }
  }
}

/**
 * Streams a multipart upload into a folder of the user's root. Only image files are kept, existing
 * files are never overwritten, and a file appears in the gallery only once it has fully arrived.
 * File names may carry a relative path ("Trip/IMG_1.jpg") so whole folders can be uploaded.
 */
export function receiveUpload(req: Request, root: PhotoRoot, folderRelPath: string): Promise<UploadResult> {
  const result: UploadResult = { uploaded: [], skipped: [] };
  const folder = normalizeRelPath(folderRelPath);
  assertVisiblePath(folder);

  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers,
        preservePath: true,
        limits: { fileSize: config.maxUploadBytes, files: MAX_FILES_PER_REQUEST, fields: 0 },
      });
    } catch (error) {
      reject(error);
      return;
    }

    const work: Promise<void>[] = [];
    const tempFiles = new Set<string>();

    parser.on("file", (_field, stream, info) => {
      const displayName = info.filename || "unnamed";
      const rawName = info.filename ?? "";

      const task = (async () => {
        const segments = rawName
          .split(/[\\/]/)
          .map(sanitizeSegment)
          .filter((segment) => segment.length > 0);
        const fileName = segments.pop();

        if (!fileName || !isImageFile(fileName)) {
          result.skipped.push({ name: displayName, reason: "Not a supported image type" });
          stream.resume();
          return;
        }

        const relDir = [folder, ...segments].filter(Boolean).join("/");
        const absoluteDir = await resolvePhotoPath(root, relDir);
        await mkdir(absoluteDir, { recursive: true });
        // Re-check after creating directories, in case an existing path component is a symlink.
        await resolvePhotoPath(root, relDir);

        // The ".upload-" prefix keeps in-flight files hidden from listings and the file watcher.
        const tempPath = path.join(absoluteDir, `.upload-${randomBytes(8).toString("hex")}`);
        tempFiles.add(tempPath);

        await pipeline(stream, createWriteStream(tempPath, { flags: "wx" }));

        if (stream.truncated) {
          await rm(tempPath, { force: true });
          tempFiles.delete(tempPath);
          result.skipped.push({
            name: displayName,
            reason: `Larger than the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit`,
          });
          return;
        }

        const placedName = await placeWithoutOverwriting(tempPath, absoluteDir, fileName);
        tempFiles.delete(tempPath);
        result.uploaded.push({ name: placedName, path: relDir ? `${relDir}/${placedName}` : placedName });
      })().catch((error: unknown) => {
        console.error(`Upload of "${displayName}" failed`, error);
        stream.resume();
        result.skipped.push({ name: displayName, reason: "Could not be saved" });
      });

      work.push(task);
    });

    parser.on("filesLimit", () => {
      result.skipped.push({ name: "(remaining files)", reason: `Only ${MAX_FILES_PER_REQUEST} files per upload` });
    });

    const cleanup = () => Promise.all([...tempFiles].map((file) => rm(file, { force: true })));

    parser.on("error", (error) => {
      void cleanup().finally(() => reject(error));
    });

    parser.on("close", () => {
      void Promise.all(work).then(() => resolve(result));
    });

    req.on("aborted", () => {
      void cleanup();
    });

    req.pipe(parser);
  });
}

/** Creates a single new sub-folder inside an existing folder of the user's root. */
export async function createFolder(root: PhotoRoot, parentRelPath: string, rawName: string): Promise<string> {
  const name = sanitizeSegment(rawName);
  if (!name) {
    throw new InvalidNameError("Enter a folder name");
  }

  const parent = normalizeRelPath(parentRelPath);
  assertVisiblePath(parent);
  const relPath = parent ? `${parent}/${name}` : name;
  const absolute = await resolvePhotoPath(root, relPath);

  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await mkdir(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new InvalidNameError("A folder with that name already exists");
    }
    throw error;
  }

  return relPath;
}

export class InvalidNameError extends Error {}
