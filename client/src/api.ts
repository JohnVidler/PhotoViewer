import type {
  AdminUser,
  AuthStatus,
  BrowseResult,
  CopyResult,
  DeleteResult,
  MoveResult,
  PhotoInfo,
  SharedFolder,
  ShareState,
  UploadSummary,
} from "./types";

const THUMBNAIL_SIZE = 400;

/** Fired when the server says the session is gone (signed out elsewhere, or the account was locked). */
export const UNAUTHORIZED_EVENT = "photoviewer:unauthorized";

function notifyIfUnauthorized(response: Response): void {
  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

export async function fetchBrowse(relPath: string): Promise<BrowseResult> {
  const response = await fetch(`/api/browse?path=${encodeURIComponent(relPath)}`);
  notifyIfUnauthorized(response);

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
  notifyIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(`Failed to load photo info: ${response.status}`);
  }

  return (await response.json()) as PhotoInfo;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status");
  if (!response.ok) {
    throw new Error(`Failed to load sign-in status: ${response.status}`);
  }
  return (await response.json()) as AuthStatus;
}

/** POSTs credentials to an auth endpoint. Throws an Error carrying the server's message on failure. */
async function postAuth(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Something went wrong. Please try again.");
  }
}

export function setupAdmin(username: string, password: string, setupCode: string): Promise<void> {
  return postAuth("/api/auth/setup", { username, password, setupCode });
}

export function register(username: string, password: string): Promise<void> {
  return postAuth("/api/auth/register", { username, password });
}

export function logIn(username: string, password: string): Promise<void> {
  return postAuth("/api/auth/login", { username, password });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return postAuth("/api/auth/password", { currentPassword, newPassword });
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

async function sendJson(url: string, method: string, body?: unknown): Promise<Response> {
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  notifyIfUnauthorized(response);

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return response;
}

/** Fired after photos or albums are moved, renamed or deleted, so open listings refresh straight away. */
export const ITEMS_CHANGED_EVENT = "photoviewer:items-changed";

async function changeItems<T>(url: string, body: unknown): Promise<T> {
  const response = await sendJson(url, "POST", body);
  const result = (await response.json()) as T;
  window.dispatchEvent(new Event(ITEMS_CHANGED_EVENT));
  return result;
}

export function moveItems(paths: string[], destination: string): Promise<MoveResult> {
  return changeItems<MoveResult>("/api/move", { paths, destination });
}

/** Copies photos into another folder as wholly separate files (used between different trees, e.g. out of a share). */
export function copyItems(paths: string[], destination: string): Promise<CopyResult> {
  return changeItems<CopyResult>("/api/copy", { paths, destination });
}

export async function fetchSharedWithMe(): Promise<SharedFolder[]> {
  const response = await sendJson("/api/shared", "GET");
  return (await response.json()) as SharedFolder[];
}

export async function fetchShares(path: string): Promise<ShareState> {
  const response = await sendJson(`/api/shares?path=${encodeURIComponent(path)}`, "GET");
  return (await response.json()) as ShareState;
}

export async function shareWithUser(path: string, username: string, canWrite: boolean): Promise<void> {
  await sendJson("/api/shares", "POST", { path, username, canWrite });
}

export async function setSharePermission(id: number, canWrite: boolean): Promise<void> {
  await sendJson(`/api/shares/${id}`, "PATCH", { canWrite });
}

/** Stops an album that someone shared with the signed-in user from appearing for them. */
export async function leaveSharedAlbum(shareId: number): Promise<void> {
  await sendJson(`/api/shared/${shareId}`, "DELETE");
  window.dispatchEvent(new Event(ITEMS_CHANGED_EVENT));
}

export async function removeShare(id: number): Promise<void> {
  await sendJson(`/api/shares/${id}`, "DELETE");
}

export async function enablePublicLink(path: string): Promise<{ id: number; token: string }> {
  const response = await sendJson("/api/shares/public", "POST", { path });
  return (await response.json()) as { id: number; token: string };
}

export function deleteItems(paths: string[]): Promise<DeleteResult> {
  return changeItems<DeleteResult>("/api/delete", { paths });
}

export async function renameItem(path: string, name: string): Promise<string> {
  return (await changeItems<{ path: string }>("/api/rename", { path, name })).path;
}

export async function createFolder(parentPath: string, name: string): Promise<string> {
  const response = await sendJson("/api/folders", "POST", { path: parentPath, name });
  const { path } = (await response.json()) as { path: string };
  window.dispatchEvent(new Event(ITEMS_CHANGED_EVENT));
  return path;
}

export async function fetchAdminUsers(): Promise<{ signupsEnabled: boolean; users: AdminUser[] }> {
  const response = await sendJson("/api/admin/users", "GET");
  return (await response.json()) as { signupsEnabled: boolean; users: AdminUser[] };
}

export async function createUser(username: string, password: string): Promise<void> {
  await sendJson("/api/admin/users", "POST", { username, password });
}

export async function resetUserPassword(id: number, password: string): Promise<void> {
  await sendJson(`/api/admin/users/${id}/password`, "POST", { password });
}

export async function setSignupsEnabled(enabled: boolean): Promise<void> {
  await sendJson("/api/admin/settings", "PUT", { signupsEnabled: enabled });
}

export async function setUserLocked(id: number, locked: boolean): Promise<void> {
  await sendJson(`/api/admin/users/${id}`, "PATCH", { status: locked ? "locked" : "active" });
}

export async function deleteUser(id: number, deletePhotos: boolean): Promise<void> {
  await sendJson(`/api/admin/users/${id}${deletePhotos ? "?deletePhotos=1" : ""}`, "DELETE");
}

export interface UploadItem {
  file: File;
  /** Name sent to the server; may include sub-folders ("Trip/IMG_1.jpg") to keep a dropped folder's structure. */
  path: string;
}

// Keeps individual requests a manageable size, and lets progress be reported between them.
const BATCH_MAX_FILES = 20;
const BATCH_MAX_BYTES = 64 * 1024 * 1024;

function batchItems(items: UploadItem[]): UploadItem[][] {
  const batches: UploadItem[][] = [];
  let current: UploadItem[] = [];
  let currentBytes = 0;

  for (const item of items) {
    if (current.length > 0 && (current.length >= BATCH_MAX_FILES || currentBytes + item.file.size > BATCH_MAX_BYTES)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.file.size;
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function uploadBatch(
  folderPath: string,
  batch: UploadItem[],
  onProgress: (loadedBytes: number) => void,
): Promise<{ uploaded: { name: string; path: string }[]; skipped: { name: string; reason: string }[] }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const item of batch) {
      form.append("file", item.file, item.path);
    }

    const request = new XMLHttpRequest();
    request.open("POST", `/api/upload?path=${encodeURIComponent(folderPath)}`);
    request.upload.addEventListener("progress", (event) => onProgress(event.loaded));
    request.addEventListener("error", () => reject(new Error("Network error during upload")));
    request.addEventListener("load", () => {
      if (request.status === 401) {
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(request.status === 401 ? "You have been signed out" : "The server rejected the upload"));
        return;
      }
      resolve(JSON.parse(request.responseText) as never);
    });
    request.send(form);
  });
}

/** Uploads files into a folder in batches, reporting overall progress as a 0..1 fraction. */
export async function uploadFiles(
  folderPath: string,
  items: UploadItem[],
  onProgress: (fraction: number) => void,
): Promise<UploadSummary> {
  const totalBytes = Math.max(1, items.reduce((sum, item) => sum + item.file.size, 0));
  const summary: UploadSummary = { uploaded: 0, skipped: [] };
  let finishedBytes = 0;

  for (const batch of batchItems(items)) {
    const batchBytes = batch.reduce((sum, item) => sum + item.file.size, 0);
    try {
      const result = await uploadBatch(folderPath, batch, (loaded) =>
        // Multipart framing makes `loaded` slightly exceed the file bytes, so clamp it.
        onProgress(Math.min(1, (finishedBytes + Math.min(loaded, batchBytes)) / totalBytes)),
      );
      summary.uploaded += result.uploaded.length;
      summary.skipped.push(...result.skipped);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Upload failed";
      summary.skipped.push(...batch.map((item) => ({ name: item.path, reason })));
    }
    finishedBytes += batchBytes;
    onProgress(Math.min(1, finishedBytes / totalBytes));
  }

  // Live updates only cover the user's own library, so tell open listings to reload (matters inside shared albums).
  window.dispatchEvent(new Event(ITEMS_CHANGED_EVENT));
  return summary;
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

function closeChangeSource(): void {
  changeSource?.close();
  changeSource = null;
}

/**
 * Browsers allow only a handful of connections per site over HTTP/1.1, and this stream holds one open for as long as
 * it lives. So it is released whenever the page goes away (including into the back/forward cache) or the tab is
 * hidden, and re-opened when the tab comes back. Otherwise leftover streams pile up until nothing else can load.
 * Changes made while it was closed are caught by refreshing the listeners on return.
 */
function resumeChangeSource(): void {
  if (changeListeners.size > 0 && !changeSource) {
    ensureChangeSource();
    changeListeners.forEach((listener) => listener.onReconnect());
  }
}

window.addEventListener("pagehide", closeChangeSource);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    resumeChangeSource();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    closeChangeSource();
  } else {
    resumeChangeSource();
  }
});

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
