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

          <span className="selection-bar__divider" aria-hidden="true" />

          <button type="button" className="button" onClick={onMove}>
            Move
          </button>
          {single && (
            <button type="button" className="button" onClick={onRename}>
              Rename
            </button>
          )}
          {single && !single.isFolder && (
            <a className="button" href={downloadUrl(single.path)} download={single.name}>
              Download
            </a>
          )}
          {onShare && (
            <button type="button" className="button" onClick={onShare}>
              Share
            </button>
          )}
          <button type="button" className="button button--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </Portal>
  );
}
