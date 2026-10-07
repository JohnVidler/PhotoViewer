import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config";
import { resolvePhotoPath } from "./paths";

const MANIFEST_FILE_NAME = ".thumbnail-manifest.json";

let cacheDirReady: Promise<void> | null = null;
let manifestPromise: Promise<Map<string, string>> | null = null;

function ensureCacheDir(): Promise<void> {
  cacheDirReady ??= mkdir(config.cacheDir, { recursive: true }).then(() => undefined);
  return cacheDirReady;
}

function hashPath(relPath: string): string {
  return createHash("sha1").update(relPath).digest("hex");
}

/** Builds a stable, collision-resistant cache file name for a source path + size + mtime. */
function cacheFileName(hash: string, size: number, mtimeMs: number): string {
  return `${hash}-${size}-${Math.round(mtimeMs)}.webp`;
}

/** Loads the hash -> source-path manifest, used to reverse-lookup cache entries for cleanup. */
async function getManifest(): Promise<Map<string, string>> {
  manifestPromise ??= ensureCacheDir().then(async () => {
    const manifestPath = path.join(config.cacheDir, MANIFEST_FILE_NAME);
    try {
      const raw = await readFile(manifestPath, "utf8");
      return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
    } catch {
      return new Map<string, string>();
    }
  });

  return manifestPromise;
}

async function saveManifest(manifest: Map<string, string>): Promise<void> {
  const manifestPath = path.join(config.cacheDir, MANIFEST_FILE_NAME);
  await writeFile(manifestPath, JSON.stringify(Object.fromEntries(manifest)));
}

async function rememberSourcePath(hash: string, relPath: string): Promise<void> {
  const manifest = await getManifest();
  if (manifest.get(hash) === relPath) {
    return;
  }

  manifest.set(hash, relPath);
  await saveManifest(manifest);
}

async function removeThumbnailFilesForHash(hash: string): Promise<void> {
  const entries = await readdir(config.cacheDir).catch(() => [] as string[]);
  const matches = entries.filter((entry) => entry.startsWith(`${hash}-`));

  await Promise.all(
    matches.map((entry) => rm(path.join(config.cacheDir, entry), { force: true }).catch(() => undefined)),
  );
}

/**
 * Returns the absolute path to a cached thumbnail, generating it first if missing.
 * The cache key embeds the source file's mtime, so edited source files automatically
 * invalidate their old thumbnail and a fresh one is generated on next request.
 */
export async function getOrCreateThumbnail(relPath: string, size = config.thumbnailSize): Promise<string> {
  await ensureCacheDir();

  const sourceAbsolute = resolvePhotoPath(relPath);
  const sourceStat = await stat(sourceAbsolute);
  const hash = hashPath(relPath);
  const fileName = cacheFileName(hash, size, sourceStat.mtimeMs);
  const cacheAbsolute = path.join(config.cacheDir, fileName);

  void rememberSourcePath(hash, relPath);

  const cached = await stat(cacheAbsolute).catch(() => null);
  if (cached) {
    return cacheAbsolute;
  }

  await sharp(sourceAbsolute)
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: config.thumbnailQuality })
    .toFile(cacheAbsolute);

  void pruneStaleThumbnails(hash, fileName);

  return cacheAbsolute;
}

/** Removes older cached thumbnails for the same source path once a fresh one exists. */
async function pruneStaleThumbnails(hash: string, currentFileName: string): Promise<void> {
  const entries = await readdir(config.cacheDir).catch(() => [] as string[]);

  const stalePromises = entries
    .filter((entry) => entry.startsWith(`${hash}-`) && entry !== currentFileName)
    .map((entry) => rm(path.join(config.cacheDir, entry), { force: true }).catch(() => undefined));

  await Promise.all(stalePromises);
}

/** Removes every cached thumbnail for a single source path (used when a file is deleted or moved). */
export async function removeCachedThumbnails(relPath: string): Promise<void> {
  const hash = hashPath(relPath);
  await removeThumbnailFilesForHash(hash);

  const manifest = await getManifest();
  if (manifest.delete(hash)) {
    await saveManifest(manifest);
  }
}

/** Removes cached thumbnails for every source path under a folder (used when a folder is deleted or moved). */
export async function removeCachedThumbnailsUnderFolder(relFolderPath: string): Promise<void> {
  const manifest = await getManifest();
  const prefix = `${relFolderPath}/`;
  const affected = [...manifest.entries()].filter(
    ([, sourcePath]) => sourcePath === relFolderPath || sourcePath.startsWith(prefix),
  );

  if (affected.length === 0) {
    return;
  }

  await Promise.all(affected.map(([hash]) => removeThumbnailFilesForHash(hash)));

  for (const [hash] of affected) {
    manifest.delete(hash);
  }

  await saveManifest(manifest);
}

/** Sweeps the manifest at startup and removes thumbnails whose source file no longer exists. */
export async function reconcileThumbnailCache(): Promise<void> {
  const manifest = await getManifest();
  let changed = false;

  await Promise.all(
    [...manifest.entries()].map(async ([hash, relPath]) => {
      const exists = await stat(resolvePhotoPath(relPath))
        .then(() => true)
        .catch(() => false);

      if (!exists) {
        await removeThumbnailFilesForHash(hash);
        manifest.delete(hash);
        changed = true;
      }
    }),
  );

  if (changed) {
    await saveManifest(manifest);
  }
}

