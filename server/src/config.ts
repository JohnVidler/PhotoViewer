import path from "node:path";

const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR ?? "/data/photos");
const CACHE_DIR = path.resolve(process.env.CACHE_DIR ?? "/data/cache");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const THUMBNAIL_SIZE = Number.parseInt(process.env.THUMBNAIL_SIZE ?? "400", 10);
const THUMBNAIL_QUALITY = Number.parseInt(process.env.THUMBNAIL_QUALITY ?? "78", 10);
// Polling is slower but needed where native fs events don't propagate (e.g. some network/Docker mounts).
const WATCH_POLLING = ["1", "true", "yes"].includes((process.env.WATCH_POLLING ?? "").toLowerCase());
const WATCH_POLL_INTERVAL = Number.parseInt(process.env.WATCH_POLL_INTERVAL ?? "2000", 10);

export const config = {
  photosDir: PHOTOS_DIR,
  cacheDir: CACHE_DIR,
  port: PORT,
  thumbnailSize: THUMBNAIL_SIZE,
  thumbnailQuality: THUMBNAIL_QUALITY,
  watchPolling: WATCH_POLLING,
  watchPollInterval: WATCH_POLL_INTERVAL,
} as const;
