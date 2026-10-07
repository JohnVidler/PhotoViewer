/** Removes the file extension from a photo file name for display purposes. */
export function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Formats a timestamp (ms) as a short human-readable date. */
export function formatDate(ms: number): string {
  return dateFormatter.format(new Date(ms));
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Formats a timestamp (ms) as a date and time. */
export function formatDateTime(ms: number): string {
  return dateTimeFormatter.format(new Date(ms));
}

/**
 * Formats an EXIF date ("2024:05:01 12:34:56"). EXIF dates carry no timezone, so they
 * are shown as the camera recorded them rather than converted.
 */
export function formatExifDate(value: string): string {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return value;
  }

  const [, year, month, day, hours, minutes, seconds] = match.map(Number) as number[];
  return formatDateTime(new Date(year!, month! - 1, day!, hours!, minutes!, seconds!).getTime());
}

/** Formats a byte count using binary units (e.g. "4.2 MB"). */
export function formatBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return unit === 0 ? `${value} ${units[0]}` : `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

/** Formats an exposure time in seconds as a photographic shutter speed (e.g. "1/250 s"). */
export function formatShutterSpeed(seconds: number): string {
  if (seconds >= 1) {
    return `${Number(seconds.toFixed(1))} s`;
  }
  return `1/${Math.round(1 / seconds)} s`;
}
