import { downloadUrl } from "../api";
import { Portal } from "./Modal";

export interface SelectedItem {
  path: string;
  name: string;
  isFolder: boolean;
}

interface SelectionBarProps {
  items: SelectedItem[];
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Offered only when exactly one of the user's own albums is selected: whole albums can be shared, photos can't. */
  onShare?: (() => void) | undefined;
}

function ActionIcon({ path }: { path: string }) {
  return (
    <svg className="button__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Pinned to the bottom of the window while anything is ticked. Add further per-item actions here
 * (for example Share) and they appear for every selection.
 */
export default function SelectionBar({
  items,
  allSelected,
  onSelectAll,
  onClear,
  onMove,
  onRename,
  onDelete,
  onShare,
}: SelectionBarProps) {
  const single = items.length === 1 ? items[0]! : null;
  const photoCount = items.filter((item) => !item.isFolder).length;
  const folderCount = items.length - photoCount;

  const summary = [
    photoCount > 0 ? `${photoCount} ${photoCount === 1 ? "photo" : "photos"}` : null,
    folderCount > 0 ? `${folderCount} ${folderCount === 1 ? "album" : "albums"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Portal>
      <div className="selection-bar" role="toolbar" aria-label="Actions for selected items">
        <div className="selection-bar__inner">
          <div className="selection-bar__head">
          <button type="button" className="selection-bar__icon" onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="selection-bar__summary" aria-live="polite">
            {summary} selected
          </span>
          {!allSelected && (
            <button type="button" className="selection-bar__link" onClick={onSelectAll}>
              Select all
            </button>
          )}

          </div>

          <span className="selection-bar__divider" aria-hidden="true" />

          <div className="selection-bar__actions">
          <button type="button" className="button" onClick={onMove}>
            <ActionIcon path="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 11v5M9.5 13.5L12 11l2.5 2.5" />
            Move
          </button>
          {single && (
            <button type="button" className="button" onClick={onRename}>
              <ActionIcon path="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              Rename
            </button>
          )}
          {single && !single.isFolder && (
            <a className="button" href={downloadUrl(single.path)} download={single.name}>
              <ActionIcon path="M12 4v11M7 11l5 5 5-5M5 20h14" />
              Download
            </a>
          )}
          {onShare && (
            <button type="button" className="button" onClick={onShare}>
              <ActionIcon path="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              Share
            </button>
          )}
          <button type="button" className="button button--danger" onClick={onDelete}>
            <ActionIcon path="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            Delete
          </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
