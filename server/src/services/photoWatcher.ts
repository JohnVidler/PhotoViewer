import chokidar from "chokidar";
import { EventEmitter } from "node:events";
import path from "node:path";
import { config } from "../config";
import { isImageFile } from "./fileScanner";
import { reconcileThumbnailCache, removeCachedThumbnails, removeCachedThumbnailsUnderFolder } from "./thumbnailCache";

// Batches bursts of filesystem events (e.g. copying a whole folder) into a single notification.
const CHANGE_DEBOUNCE_MS = 300;

const changeEmitter = new EventEmitter();
changeEmitter.setMaxListeners(0);

let pendingDirs = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

function toRelPath(absolutePath: string): string {
  return path.relative(config.photosDir, absolutePath).split(path.sep).join("/");
}

function parentOf(relPath: string): string {
  const parent = path.posix.dirname(relPath);
  return parent === "." ? "" : parent;
}

/** Marks a directory and all of its ancestors as changed, since folder photo counts are recursive. */
function markDirChanged(relDir: string): void {
  let current = relDir;
  for (;;) {
    pendingDirs.add(current);
    if (current === "") {
      break;
    }
    current = parentOf(current);
  }

  flushTimer ??= setTimeout(() => {
    const dirs = [...pendingDirs];
    pendingDirs = new Set();
    flushTimer = null;
    changeEmitter.emit("change", dirs);
  }, CHANGE_DEBOUNCE_MS);
}

/** Subscribes to batched folder changes; the listener receives every affected relative folder path. */
export function onPhotosChanged(listener: (dirs: string[]) => void): () => void {
  changeEmitter.on("change", listener);
  return () => changeEmitter.off("change", listener);
}

/**
 * Watches the read-only photos mount for additions, edits, deletes and moves.
 * Prunes any cached thumbnails left behind and notifies subscribers (the web UI)
 * so open folders refresh automatically.
 */
export function startPhotoWatcher(): void {
  void reconcileThumbnailCache().catch((error) => console.error("Thumbnail cache reconciliation failed", error));

  const watcher = chokidar.watch(config.photosDir, {
    ignoreInitial: true,
    ignored: (absolutePath) => absolutePath !== config.photosDir && path.basename(absolutePath).startsWith("."),
    usePolling: config.watchPolling,
    interval: config.watchPollInterval,
    binaryInterval: config.watchPollInterval,
    // Wait for large photos to finish copying before announcing them.
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
  });

  watcher.on("add", (absolutePath) => {
    if (isImageFile(absolutePath)) {
      markDirChanged(parentOf(toRelPath(absolutePath)));
    }
  });

  watcher.on("change", (absolutePath) => {
    if (isImageFile(absolutePath)) {
      markDirChanged(parentOf(toRelPath(absolutePath)));
    }
  });

  watcher.on("unlink", (absolutePath) => {
    const relPath = toRelPath(absolutePath);
    void removeCachedThumbnails(relPath).catch((error) =>
      console.error("Failed to prune thumbnail for deleted file", error),
    );

    if (isImageFile(absolutePath)) {
      markDirChanged(parentOf(relPath));
    }
  });

  watcher.on("addDir", (absolutePath) => {
    markDirChanged(toRelPath(absolutePath));
  });

  watcher.on("unlinkDir", (absolutePath) => {
    const relPath = toRelPath(absolutePath);
    void removeCachedThumbnailsUnderFolder(relPath).catch((error) =>
      console.error("Failed to prune thumbnails for deleted folder", error),
    );
    markDirChanged(relPath);
  });

  watcher.on("ready", () => {
    console.log(`Watching ${config.photosDir} for changes${config.watchPolling ? " (polling)" : ""}`);
  });

  watcher.on("error", (error) => console.error("Photo watcher error", error));
}
