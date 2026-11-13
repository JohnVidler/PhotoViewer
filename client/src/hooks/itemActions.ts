import { useState, useSyncExternalStore, type DragEvent } from "react";
import { copyItems, deleteItems, moveItems, renameItem } from "../api";

/**
 * Shared state for dragging photos around and for the little status messages that follow an action.
 * It lives outside React because many unrelated places react to it: every folder tile, the sidebar,
 * the "move up" strip and the message toast.
 */

export const MOVE_MIME = "application/x-photoviewer-items";

export interface Notice {
  id: number;
  text: string;
  error: boolean;
}

interface Store {
  dragged: string[];
  notice: Notice | null;
}

const NOTHING: string[] = [];
let store: Store = { dragged: NOTHING, notice: null };
const listeners = new Set<() => void>();
let nextNoticeId = 1;

function update(next: Partial<Store>): void {
  store = { ...store, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Shows a message for a few seconds. */
export function notify(text: string, error = false): void {
  const id = nextNoticeId++;
  update({ notice: { id, text, error } });
  setTimeout(() => {
    if (store.notice?.id === id) {
      update({ notice: null });
    }
  }, error ? 7000 : 4000);
}

export function dismissNotice(): void {
  update({ notice: null });
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(subscribe, () => store.notice);
}

export function useDragged(): string[] {
  return useSyncExternalStore(subscribe, () => store.dragged);
}

/** Starts dragging the given paths (a photo, or the whole selection when the dragged photo is part of it). */
export function beginDrag(event: DragEvent, paths: string[]): void {
  event.dataTransfer.setData(MOVE_MIME, JSON.stringify(paths));
  event.dataTransfer.effectAllowed = "copyMove";
  // Re-rendering inside dragstart can make Chrome cancel the drag, so publish the state a moment later.
  setTimeout(() => update({ dragged: paths }), 0);
}

export function endDrag(): void {
  update({ dragged: NOTHING });
}

function isMoveDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(MOVE_MIME);
}

function readPaths(event: DragEvent): string[] {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(MOVE_MIME));
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function describe(paths: string[]): string {
  return paths.length === 1 ? `"${baseName(paths[0]!)}"` : `${paths.length} items`;
}

/** Moves items and reports the outcome. Never throws. */
export async function moveTo(paths: string[], destination: string, label: string): Promise<boolean> {
  try {
    const result = await moveItems(paths, destination);
    const reasons = [...new Set(result.skipped.map((skip) => skip.reason))].join("; ");

    if (result.moved.length > 0) {
      const skipped = result.skipped.length > 0 ? ` ${result.skipped.length} skipped: ${reasons}.` : "";
      notify(`Moved ${describe(result.moved.map((move) => move.from))} to ${label}.${skipped}`);
      return true;
    }

    notify(`Nothing was moved: ${reasons || "no items"}.`, true);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not move the items.", true);
  }
  return false;
}

export async function deletePaths(paths: string[]): Promise<boolean> {
  try {
    const result = await deleteItems(paths);
    const reasons = [...new Set(result.skipped.map((skip) => skip.reason))].join("; ");

    if (result.deleted.length > 0) {
      const skipped = result.skipped.length > 0 ? ` ${result.skipped.length} skipped: ${reasons}.` : "";
      notify(`Deleted ${describe(result.deleted)}.${skipped}`);
      return true;
    }

    notify(`Nothing was deleted: ${reasons || "no items"}.`, true);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not delete the items.", true);
  }
  return false;
}

export async function rename(path: string, name: string): Promise<void> {
  await renameItem(path, name);
  notify(`Renamed to "${name}".`);
}

/** Copies photos and reports the outcome. Never throws. */
export async function copyTo(paths: string[], destination: string, label: string): Promise<boolean> {
  try {
    const result = await copyItems(paths, destination);
    const reasons = [...new Set(result.skipped.map((skip) => skip.reason))].join("; ");

    if (result.copied.length > 0) {
      const skipped = result.skipped.length > 0 ? ` ${result.skipped.length} skipped: ${reasons}.` : "";
      notify(`Copied ${describe(result.copied.map((copy) => copy.from))} to ${label}.${skipped}`);
      return true;
    }

    notify(`Nothing was copied: ${reasons || "no items"}.`, true);
  } catch (error) {
    notify(error instanceof Error ? error.message : "Could not copy the items.", true);
  }
  return false;
}

/**
 * The tree a path belongs to: "" for the user's own library, ".shared/12" for an album shared with them,
 * ".public/<token>" for a public link. Two paths are in the same tree exactly when this matches.
 */
export function treeOf(path: string): string {
  const match = /^\.(?:shared|public)\/[^/]+/.exec(path);
  return match ? match[0] : "";
}

export type DropOperation = "move" | "copy";

/**
 * What dropping `dragged` onto `destination` does. Inside one tree it moves (there is still one copy of each file).
 * Between two different trees it copies, so the result is a wholly separate file that belongs to the destination.
 * Returns null when the drop makes no sense (already there, or an album into itself).
 */
export function operationFor(dragged: string[], destination: string): DropOperation | null {
  const source = treeOf(dragged[0] ?? "");
  if (dragged.some((path) => treeOf(path) !== source)) {
    return null;
  }

  if (source !== treeOf(destination)) {
    return "copy";
  }

  const alreadyThere = dragged.every((path) => parentOf(path) === destination);
  const intoItself = dragged.some((path) => destination === path || destination.startsWith(`${path}/`));
  return alreadyThere || intoItself ? null : "move";
}

/**
 * Makes an element a place that dragged photos can be dropped. `destination` is the folder's path ("" is the top of
 * the user's own library). Pass `writable = false` for places the user can't change (read-only shares), which then
 * never accept a drop.
 */
export function useMoveDrop(destination: string, label: string, writable = true) {
  const dragged = useDragged();
  const [over, setOver] = useState(false);

  const allowed = writable && dragged.length > 0 && operationFor(dragged, destination) !== null;

  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (allowed && isMoveDrag(event)) {
        event.preventDefault();
        setOver(true);
      }
    },
    onDragOver: (event: DragEvent) => {
      if (allowed && isMoveDrag(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = operationFor(dragged, destination) === "copy" ? "copy" : "move";
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOver(false);
      }
    },
    onDrop: (event: DragEvent) => {
      if (!isMoveDrag(event)) {
        return;
      }
      event.preventDefault();
      setOver(false);
      const paths = readPaths(event);
      // The dragged tile may disappear before its own dragend fires, so clear the state here as well.
      endDrag();

      const operation = writable && paths.length > 0 ? operationFor(paths, destination) : null;
      if (operation === "copy") {
        void copyTo(paths, destination, label);
      } else if (operation === "move") {
        void moveTo(paths, destination, label);
      }
    },
  };

  return { over: over && allowed, active: allowed, dropProps };
}
