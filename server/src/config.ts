import path from "node:path";

const PHOTOS_DIR = path.resolve(process.env.PHOTOS_DIR ?? "/data/photos");
const CACHE_DIR = path.resolve(process.env.CACHE_DIR ?? "/data/cache");
const CONFIG_DIR = path.resolve(process.env.CONFIG_DIR ?? "/data/config");
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const THUMBNAIL_SIZE = Number.parseInt(process.env.THUMBNAIL_SIZE ?? "400", 10);
const THUMBNAIL_QUALITY = Number.parseInt(process.env.THUMBNAIL_QUALITY ?? "78", 10);
// Polling is slower but needed where native fs events don't propagate (e.g. some network/Docker mounts).
const WATCH_POLLING = ["1", "true", "yes"].includes((process.env.WATCH_POLLING ?? "").toLowerCase());
const WATCH_POLL_INTERVAL = Number.parseInt(process.env.WATCH_POLL_INTERVAL ?? "2000", 10);

const MAX_UPLOAD_MB = Number.parseInt(process.env.MAX_UPLOAD_MB ?? "200", 10);
const SESSION_DAYS = Number.parseInt(process.env.SESSION_DAYS ?? "30", 10);

const truthy = (value: string | undefined) => ["1", "true", "yes"].includes((value ?? "").toLowerCase());

/**
 * Express "trust proxy" value. Behind a reverse proxy (e.g. nginx-proxy-manager) set TRUST_PROXY=1 so the
 * real client address is used for login throttling. Accepts true/false, a hop count, or an address list.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = (raw ?? "").trim();
  if (value === "" || ["0", "false", "no"].includes(value.toLowerCase())) {
    return false;
  }
  if (["true", "yes"].includes(value.toLowerCase())) {
    return true;
  }
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : value;
}

export const config = {
  photosDir: PHOTOS_DIR,
  cacheDir: CACHE_DIR,
  configDir: CONFIG_DIR,
  port: PORT,
  thumbnailSize: THUMBNAIL_SIZE,
  thumbnailQuality: THUMBNAIL_QUALITY,
  watchPolling: WATCH_POLLING,
  watchPollInterval: WATCH_POLL_INTERVAL,
  maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
  sessionMs: SESSION_DAYS * 24 * 60 * 60 * 1000,
  // Mark the session cookie Secure. Set once the site is served over HTTPS (browsers then refuse to send it over HTTP).
  secureCookies: truthy(process.env.SECURE_COOKIES),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Required to create the first (administrator) account. Generated and logged at startup if not provided.
  setupCode: (process.env.SETUP_CODE ?? "").trim(),
} as const;
