import { useEffect, useState, type FormEvent } from "react";
import { fetchBrowse } from "../api";
import { baseName, deletePaths, moveTo, parentOf, rename } from "../hooks/itemActions";
import type { FolderEntry } from "../types";
import Modal from "./Modal";
import type { SelectedItem } from "./SelectionBar";

// ---------------------------------------------------------------- Move

interface MoveDialogProps {
  items: SelectedItem[];
  /** The folder being viewed, where the picker starts. */
  startPath: string;
  /** Top of the tree being browsed ("" for the user's library, ".shared/12" inside a shared album). Can't go above it. */
  rootPath: string;
  rootLabel: string;
  onClose: () => void;
  onDone: () => void;
}

/** Lets the user pick any album in their own library (or the top level) to move the selection into. */
export function MoveDialog({ items, startPath, rootPath, rootLabel, onClose, onDone }: MoveDialogProps) {
  const [dir, setDir] = useState(startPath);
  const [folders, setFolders] = useState<FolderEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const paths = items.map((item) => item.path);
  const movingFolders = items.filter((item) => item.isFolder).map((item) => item.path);

  useEffect(() => {
    let cancelled = false;
    setFolders(null);
    setError(false);

    fetchBrowse(dir)
      .then((data) => {
        if (!cancelled) {
          setFolders(data.folders);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dir]);

  // An album can't go inside itself, so the albums being moved (and what is inside them) are not offered.
  const insideMovedFolder = movingFolders.some((folder) => dir === folder || dir.startsWith(`${folder}/`));
  const alreadyThere = paths.every((path) => parentOf(path) === dir);
  const canMove = !insideMovedFolder && !alreadyThere && !busy;

  // Crumbs are relative to the top of the tree, which is the first one.
  const crumbs = dir === rootPath ? [] : dir.slice(rootPath ? rootPath.length + 1 : 0).split("/");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const moved = await moveTo(paths, dir, dir === rootPath ? rootLabel : baseName(dir));
    setBusy(false);
    if (moved) {
      onDone();
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <form
        className="dialog dialog--wide"
        role="dialog"
        aria-labelledby="move-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2 id="move-title" className="dialog__title">
          Move {items.length === 1 ? `"${items[0]!.name}"` : `${items.length} items`} to…
        </h2>

        <nav className="picker__crumbs" aria-label="Destination">
          <button type="button" className="picker__crumb" onClick={() => setDir(rootPath)}>
            {rootLabel}
          </button>
          {crumbs.map((crumb, index) => (
            <span key={index} className="picker__crumb-wrap">
              <span className="breadcrumbs__separator">/</span>
              <button
                type="button"
                className="picker__crumb"
                onClick={() => setDir([rootPath, ...crumbs.slice(0, index + 1)].filter(Boolean).join("/"))}
              >
                {crumb}
              </button>
            </span>
          ))}
        </nav>

        <div className="picker__list" role="list">
          {error && <p className="dialog__text">Could not load this folder.</p>}
          {!error && folders === null && <p className="dialog__text">Loading…</p>}
          {folders?.length === 0 && <p className="dialog__text">No albums in here.</p>}
          {folders?.map((folder) => {
            const blocked = movingFolders.some((moving) => folder.path === moving);
            return (
              <button
                key={folder.path}
                type="button"
                role="listitem"
                className="picker__item"
                disabled={blocked}
                onClick={() => setDir(folder.path)}
                title={blocked ? "This album is being moved" : undefined}
              >
                <span>{folder.name}</span>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>

        {insideMovedFolder && <p className="dialog__text">An album can't be moved into itself.</p>}
        {!insideMovedFolder && alreadyThere && <p className="dialog__text">Already in this folder. Choose another.</p>}

        <div className="dialog__buttons">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={!canMove}>
            Move here
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Delete

interface DeleteDialogProps {
  items: SelectedItem[];
  /** How many photos each selected album contains, to make the consequences clear. */
  folderPhotoCounts: Map<string, number>;
  onClose: () => void;
  onDone: () => void;
}

export function DeleteDialog({ items, folderPhotoCounts, onClose, onDone }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);

  const photos = items.filter((item) => !item.isFolder).length;
  const albums = items.length - photos;
  const insideAlbums = items.reduce((sum, item) => sum + (item.isFolder ? (folderPhotoCounts.get(item.path) ?? 0) : 0), 0);

  const parts = [
    photos > 0 ? `${photos} ${photos === 1 ? "photo" : "photos"}` : null,
    albums > 0 ? `${albums} ${albums === 1 ? "album" : "albums"}` : null,
  ].filter(Boolean);

  async function confirm() {
    setBusy(true);
    const deleted = await deletePaths(items.map((item) => item.path));
    setBusy(false);
    if (deleted) {
      onDone();
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="dialog" role="alertdialog" aria-labelledby="delete-items-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="delete-items-title" className="dialog__title">
          Delete {parts.join(" and ")}?
        </h2>
        <p className="dialog__text">
          {items.length === 1 ? `"${items[0]!.name}" will` : "They will"} be permanently deleted from the server.
          {albums > 0 && ` Albums are deleted together with everything inside them (${insideAlbums} ${insideAlbums === 1 ? "photo" : "photos"}).`}{" "}
          This can't be undone.
        </p>
        <div className="dialog__buttons">
          <button type="button" className="button" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="button button--danger" disabled={busy} onClick={() => void confirm()}>
            Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Rename

interface RenameDialogProps {
  item: SelectedItem;
  onClose: () => void;
  onDone: () => void;
}

export function RenameDialog({ item, onClose, onDone }: RenameDialogProps) {
  const [name, setName] = useState(item.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await rename(item.path, name);
      onDone();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not rename.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="rename-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2 id="rename-title" className="dialog__title">
          Rename {item.isFolder ? "album" : "photo"}
        </h2>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="New name"
          maxLength={200}
          autoFocus
          onFocus={(event) => {
            // Select the name but not the extension, so ".jpg" isn't retyped by accident.
            const dot = item.isFolder ? -1 : event.target.value.lastIndexOf(".");
            event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
          }}
        />
        {error && (
          <p className="auth-card__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__buttons">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={busy || name.trim() === "" || name === item.name}>
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}
