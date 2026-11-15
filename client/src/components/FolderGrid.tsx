import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createFolder, thumbnailUrl } from "../api";
import { useLongPress } from "../hooks/useLongPress";
import { useMoveDrop } from "../hooks/itemActions";
import type { FolderEntry, PhotoPreview } from "../types";
import FolderIcon from "./FolderIcon";
import SelectBox from "./SelectBox";

interface FolderGridProps {
  folders: FolderEntry[];
  selected: Set<string>;
  onToggleSelect: (path: string) => void;
  /** Albums can be ticked, and photos dropped onto them, where the user may change the folder. */
  editable: boolean;
  /** When set, a "New album" tile follows the albums and creates albums inside this folder. */
  newAlbumParent?: string | undefined;
}

/**
 * Arranges up to four previews into flex columns:
 * 1 → single image, 2 → side by side, 3 → one large + two stacked, 4 → 2×2.
 */
function mosaicColumns(previews: PhotoPreview[]): PhotoPreview[][] {
  switch (previews.length) {
    case 0:
      return [];
    case 1:
      return [previews];
    case 2:
      return [[previews[0]!], [previews[1]!]];
    case 3:
      return [[previews[0]!], [previews[1]!, previews[2]!]];
    default:
      return [
        [previews[0]!, previews[2]!],
        [previews[1]!, previews[3]!],
      ];
  }
}

function FolderMosaic({ previews }: { previews: PhotoPreview[] }) {
  const columns = mosaicColumns(previews);

  if (columns.length === 0) {
    return (
      <div className="folder-card__mosaic folder-card__mosaic--empty" aria-hidden="true">
        <FolderIcon />
      </div>
    );
  }

  return (
    <div className={`folder-card__mosaic folder-card__mosaic--${previews.length}`} aria-hidden="true">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="folder-card__mosaic-column">
          {column.map((preview) => (
            <img
              key={preview.path}
              src={thumbnailUrl(preview.path, preview.mtimeMs)}
              alt=""
              loading="lazy"
              className="folder-card__mosaic-image"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface FolderTileProps {
  folder: FolderEntry;
  selected: boolean;
  selecting: boolean;
  editable: boolean;
  onToggle: (path: string) => void;
}

function FolderTile({ folder, selected, selecting, editable, onToggle }: FolderTileProps) {
  // Photos dragged onto an album are moved into it (or copied, if they come from another tree). An album shared
  // with the user is a drop target only if they may edit it.
  const droppable = folder.writable ?? editable;
  const { over, active, dropProps } = useMoveDrop(folder.path, folder.name, droppable);
  const longPress = useLongPress(editable && !selecting ? () => onToggle(folder.path) : undefined);

  return (
    <div
      className={`folder-tile${selected ? " folder-tile--selected" : ""}${selecting ? " folder-tile--selecting" : ""}${active && droppable ? " folder-tile--droppable" : ""}${over && droppable ? " folder-tile--drop" : ""}`}
    >
      <Link
        to={`/${folder.path}`}
        className="folder-card"
        draggable={false}
        {...longPress.handlers}
        onClick={(event) => {
          // The release at the end of a long-press (which just ticked the album) must not open it.
          if (longPress.consumeLongPress()) {
            event.preventDefault();
            return;
          }
          // While ticking things, clicking an album ticks it rather than opening it.
          if (selecting && editable) {
            event.preventDefault();
            onToggle(folder.path);
          }
        }}
        {...(droppable ? dropProps : {})}
      >
        <FolderMosaic previews={folder.previews} />
        {folder.shared && (
          <span className="folder-card__shared" title="Shared" role="img" aria-label="Shared">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
              <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14c2 .7 3 2.3 3 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <span className="folder-card__info">
          <span className="folder-card__name">{folder.name}</span>
          <span className="folder-card__count">
            {folder.photoCount} {folder.photoCount === 1 ? "photo" : "photos"}
            {folder.subtitle ? ` · ${folder.subtitle}` : ""}
          </span>
        </span>
      </Link>
      {editable && <SelectBox checked={selected} label={folder.name} onToggle={() => onToggle(folder.path)} />}
    </div>
  );
}

/** A dashed tile at the end of the albums: click it, type a name, press Enter. */
function NewAlbumTile({ parentPath }: { parentPath: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setEditing(false);
    setName("");
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createFolder(parentPath, name);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create the album.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-album-tile">
      {editing ? (
        <form className="new-album-tile__form" onSubmit={(event) => void submit(event)}>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                close();
              }
            }}
            placeholder="Album name"
            aria-label="New album name"
            aria-invalid={error !== null}
            maxLength={100}
            autoFocus
          />
          <div className="new-album-tile__buttons">
            <button type="submit" className="button button--primary" disabled={busy || name.trim() === ""}>
              Create
            </button>
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
          </div>
          {error && (
            <span className="new-album-tile__error" role="alert">
              {error}
            </span>
          )}
        </form>
      ) : (
        <button type="button" className="new-album-tile__button" onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>New album</span>
        </button>
      )}
    </div>
  );
}

export default function FolderGrid({ folders, selected, onToggleSelect, editable, newAlbumParent }: FolderGridProps) {
  const showNewAlbum = editable && newAlbumParent !== undefined;
  if (folders.length === 0 && !showNewAlbum) {
    return null;
  }

  const selecting = selected.size > 0;

  return (
    <div className="folder-grid">
      {folders.map((folder) => (
        <FolderTile
          key={folder.path}
          folder={folder}
          selected={selected.has(folder.path)}
          selecting={selecting}
          editable={editable}
          onToggle={onToggleSelect}
        />
      ))}
      {showNewAlbum && <NewAlbumTile parentPath={newAlbumParent} />}
    </div>
  );
}
