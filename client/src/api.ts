import type { BrowseResult, PhotoInfo } from "./types";

const THUMBNAIL_SIZE = 400;

export async function fetchBrowse(relPath: string): Promise<BrowseResult> {
  const response = await fetch(`/api/browse?path=${encodeURIComponent(relPath)}`);

  if (!response.ok) {
    throw new Error(`Failed to load folder: ${response.status}`);
  }

  return (await response.json()) as BrowseResult;
}

// `version` (the file's mtime) busts the browser cache when a photo is edited in place.
export function thumbnailUrl(relPath: string, version: number, size: number = THUMBNAIL_SIZE): string {
  return `/api/thumbnail?path=${encodeURIComponent(relPath)}&size=${size}&v=${Math.round(version)}`;
}

export function photoUrl(relPath: string, version: number): string {
  return `/api/photo?path=${encodeURIComponent(relPath)}&v=${Math.round(version)}`;
}

/** URL that makes the server send the original file as a download (Content-Disposition: attachment). */
export function downloadUrl(relPath: string): string {
  return `/api/photo?path=${encodeURIComponent(relPath)}&download=1`;
}

export async function fetchPhotoInfo(relPath: string, signal?: AbortSignal): Promise<PhotoInfo> {
  const response = await fetch(`/api/info?path=${encodeURIComponent(relPath)}`, signal ? { signal } : {});

  if (!response.ok) {
    throw new Error(`Failed to load photo info: ${response.status}`);
  }

  return (await response.json()) as PhotoInfo;
}

interface ChangeListener {
  onChange: (dirs: string[]) => void;
  onReconnect: () => void;
}

// One EventSource is shared by every subscriber (sidebar, page) and closed when none remain.
const changeListeners = new Set<ChangeListener>();
let changeSource: EventSource | null = null;

function ensureChangeSource(): void {
  if (changeSource) {
    return;
  }

  const source = new EventSource("/api/events");
  let hasConnected = false;

  source.addEventListener("open", () => {
    if (hasConnected) {
      changeListeners.forEach((listener) => listener.onReconnect());
    }
    hasConnected = true;
  });

  source.addEventListener("change", (event) => {
    const { dirs } = JSON.parse((event as MessageEvent<string>).data) as { dirs: string[] };
    changeListeners.forEach((listener) => listener.onChange(dirs));
  });

  changeSource = source;
}

/**
 * Listens for folders changing on disk. `onChange` receives the affected folder paths;
 * `onReconnect` fires after a dropped connection is restored, since changes may have been missed.
 */
export function subscribeToChanges(
  onChange: (dirs: string[]) => void,
  onReconnect: () => void,
): () => void {
  const listener: ChangeListener = { onChange, onReconnect };
  changeListeners.add(listener);
  ensureChangeSource();

  return () => {
    changeListeners.delete(listener);
    if (changeListeners.size === 0) {
      changeSource?.close();
      changeSource = null;
    }
  };
}
