import exifr from "exifr";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { resolvePhotoPath } from "./paths";
import type { PhotoInfo } from "../types";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
};

// Header bytes scanned for JPEG quantization tables / WebP chunk types, and parsed for
// metadata when the whole file is too large to read (embedded tags normally sit near the start).
const HEADER_SCAN_BYTES = 512 * 1024;

// Files up to this size are read whole so metadata stored late in the file (TIFF/HEIF) is found.
const FULL_READ_MAX_BYTES = 64 * 1024 * 1024;

// Longest metadata string passed to the client; XMP blobs etc. are truncated.
const MAX_VALUE_LENGTH = 300;

// Standard IJG luminance quantization table (quality 50), used to estimate JPEG quality.
const STANDARD_LUMINANCE_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const STANDARD_LUMINANCE_SUM = STANDARD_LUMINANCE_TABLE.reduce((sum, value) => sum + value, 0);

async function readHeader(absolutePath: string, size: number): Promise<Buffer> {
  if (size <= FULL_READ_MAX_BYTES) {
    return readFile(absolutePath);
  }

  const handle = await open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(HEADER_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_SCAN_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Estimates the IJG quality setting a JPEG was saved with by comparing its luminance
 * quantization table to the standard one (the inverse of libjpeg's quality scaling).
 */
function estimateJpegQuality(header: Buffer): number | undefined {
  let offset = 2;

  while (offset + 4 <= header.length && header[offset] === 0xff) {
    const marker = header[offset + 1]!;
    const length = header.readUInt16BE(offset + 2);

    // Start of scan: quantization tables always precede it.
    if (marker === 0xda) {
      break;
    }

    if (marker === 0xdb) {
      let tableOffset = offset + 4;
      const segmentEnd = offset + 2 + length;

      while (tableOffset < segmentEnd && tableOffset < header.length) {
        const precision = header[tableOffset]! >> 4;
        const tableId = header[tableOffset]! & 0x0f;
        const entrySize = precision === 0 ? 1 : 2;
        tableOffset += 1;

        if (tableId === 0 && tableOffset + 64 * entrySize <= header.length) {
          let sum = 0;
          for (let i = 0; i < 64; i++) {
            sum += entrySize === 1 ? header[tableOffset + i]! : header.readUInt16BE(tableOffset + i * 2);
          }

          const scale = (sum * 100) / STANDARD_LUMINANCE_SUM;
          const quality = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
          return Math.min(100, Math.max(1, Math.round(quality)));
        }

        tableOffset += 64 * entrySize;
      }
    }

    offset += 2 + length;
  }

  return undefined;
}

/** WebP stores lossy data in a "VP8 " chunk and lossless in "VP8L". */
function webpCompression(header: Buffer): string {
  if (header.includes("VP8L")) {
    return "Lossless (VP8L)";
  }
  if (header.includes("VP8 ")) {
    return "Lossy (VP8)";
  }
  return "WebP";
}

function describeCompression(
  format: string | undefined,
  header: Buffer,
  meta: sharp.Metadata,
  tiffCompression: unknown,
): string | undefined {
  switch (format) {
    case "jpeg":
      return "Lossy (JPEG DCT)";
    case "png":
      return "Lossless (Deflate)";
    case "gif":
      return "Lossless (LZW, indexed colour)";
    case "webp":
      return webpCompression(header);
    case "heif":
      return meta.compression === "av1" ? "AV1 (AVIF)" : meta.compression === "hevc" ? "HEVC (HEIC)" : undefined;
    case "tiff":
      return typeof tiffCompression === "string" ? tiffCompression : undefined;
    default:
      return undefined;
  }
}

/** Converts metadata values to JSON-friendly primitives, dropping binary blobs. */
function toDisplayValue(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.replace(/\0+$/, "").trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    return trimmed.length > MAX_VALUE_LENGTH ? `${trimmed.slice(0, MAX_VALUE_LENGTH)}…` : trimmed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const parts = value.map(toDisplayValue).filter((part) => part !== undefined);
    return parts.length > 0 && parts.length <= 16 ? toDisplayValue(parts.join(", ")) : undefined;
  }
  if (typeof value === "object") {
    // XMP language alternatives arrive as { lang, value }; show just the text.
    const text = (value as { value?: unknown }).value;
    return typeof text === "string" ? toDisplayValue(text) : toDisplayValue(JSON.stringify(value));
  }
  return undefined;
}

/** Collects file, image, compression and embedded (EXIF/GPS/IPTC/XMP/ICC) metadata for a photo. */
export async function getPhotoInfo(relPath: string): Promise<PhotoInfo> {
  const absolute = resolvePhotoPath(relPath);
  const fileStat = await stat(absolute);
  const extension = path.extname(absolute).toLowerCase();

  // exifr is given a buffer: its own file reader is incompatible with recent Node versions.
  const header = await readHeader(absolute, fileStat.size);

  const [meta, tags] = await Promise.all([
    sharp(absolute)
      .metadata()
      .catch(() => null),
    exifr
      .parse(header, {
        tiff: true,
        exif: true,
        gps: true,
        iptc: true,
        xmp: true,
        icc: true,
        ifd1: false,
        mergeOutput: true,
        translateKeys: true,
        translateValues: true,
        // Keep dates as written ("2024:05:01 12:34:56") rather than reinterpreting them in the server's timezone.
        reviveValues: false,
      })
      .catch(() => null) as Promise<Record<string, unknown> | null | undefined>,
  ]);

  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    const displayValue = toDisplayValue(value);
    if (displayValue !== undefined) {
      metadata[key] = displayValue;
    }
  }

  const latitude = tags?.["latitude"];
  const longitude = tags?.["longitude"];
  const altitude = tags?.["GPSAltitude"];

  const format = meta?.format;
  const width = meta?.width;
  const height = meta?.height;
  // EXIF orientations 5-8 rotate by 90°, so the displayed image has swapped dimensions.
  const rotated = (meta?.orientation ?? 1) >= 5;

  return {
    file: {
      name: path.basename(absolute),
      path: relPath,
      size: fileStat.size,
      mimeType: MIME_TYPES[extension] ?? "application/octet-stream",
      modifiedMs: fileStat.mtimeMs,
      createdMs: fileStat.birthtimeMs,
    },
    image: {
      format: format === "heif" && meta?.compression === "av1" ? "avif" : format,
      width: rotated ? height : width,
      height: rotated ? width : height,
      orientation: meta?.orientation,
      colorSpace: meta?.space,
      channels: meta?.channels,
      bitDepth: meta?.depth === "uchar" ? 8 : meta?.depth === "ushort" ? 16 : undefined,
      hasAlpha: meta?.hasAlpha,
      density: meta?.density,
      iccProfile: typeof tags?.["ProfileDescription"] === "string" ? tags["ProfileDescription"] : undefined,
      pages: meta?.pages,
    },
    compression: {
      method: describeCompression(format, header, meta ?? {}, tags?.["Compression"]),
      estimatedQuality: format === "jpeg" ? estimateJpegQuality(header) : undefined,
      chromaSubsampling: meta?.chromaSubsampling,
      progressive: format === "jpeg" ? meta?.isProgressive : undefined,
      interlaced: format === "png" || format === "gif" ? meta?.isProgressive : undefined,
      bitsPerPixel: width && height ? (fileStat.size * 8) / (width * height) : undefined,
    },
    location:
      typeof latitude === "number" && typeof longitude === "number"
        ? { latitude, longitude, altitude: typeof altitude === "number" ? altitude : undefined }
        : null,
    metadata,
  };
}
