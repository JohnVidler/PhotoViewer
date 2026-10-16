import exifr from "exifr";
import { open } from "node:fs/promises";

// Embedded dates sit in the first EXIF segment, so only the start of the file is read.
const HEADER_BYTES = 512 * 1024;

const EXIF_DATE_PATTERN = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/;

// Dates only change when the file does, so results are cached by path and mtime.
const cache = new Map<string, { mtimeMs: number; takenAt: string | undefined }>();

/**
 * Returns the date a photo was taken, as the camera wrote it ("2024:05:01 12:34:56", no
 * timezone), or undefined if the file has no usable EXIF date.
 */
export async function readTakenAt(absolutePath: string, mtimeMs: number): Promise<string | undefined> {
  const cached = cache.get(absolutePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.takenAt;
  }

  const takenAt = await readExifDate(absolutePath);
  cache.set(absolutePath, { mtimeMs, takenAt });
  return takenAt;
}

async function readExifDate(absolutePath: string): Promise<string | undefined> {
  try {
    const handle = await open(absolutePath, "r");
    let header: Buffer;
    try {
      const buffer = Buffer.alloc(HEADER_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
      header = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }

    // exifr is given a buffer: its own file reader is incompatible with recent Node versions.
    const tags = (await exifr.parse(header, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      reviveValues: false,
    })) as Record<string, unknown> | null | undefined;

    for (const key of ["DateTimeOriginal", "CreateDate", "ModifyDate"]) {
      const value = tags?.[key];
      if (typeof value === "string" && EXIF_DATE_PATTERN.test(value) && !value.startsWith("0000")) {
        return value.slice(0, 19);
      }
    }
  } catch {
    // Unreadable or metadata-free files simply fall back to file times.
  }

  return undefined;
}
