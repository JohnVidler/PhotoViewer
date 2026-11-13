import { baseName, dismissNotice, parentOf, treeOf, useMoveDrop, useNotice } from "../hooks/itemActions";
import { Portal } from "./Modal";

/**
 * A strip at the top of the browse area. Dropping dragged photos on it moves them up into the parent folder.
 * It is only shown inside an album, because nothing can be placed above the top of the user's library.
 */
export function ParentDropZone({ relPath, rootLabel }: { relPath: string; rootLabel: string }) {
  const parent = parentOf(relPath);
  // The top of the tree (the library, or a shared album) is the highest place anything can go.
  const label = parent === treeOf(relPath) ? rootLabel : baseName(parent);
  const { over, active, dropProps } = useMoveDrop(parent, label);

  return (
    <div
      className={`drop-zone${active ? " drop-zone--active" : ""}${over ? " drop-zone--over" : ""}`}
      {...dropProps}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 19V6M12 6L6.5 11.5M12 6L17.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        Drag photos here to move them up to <strong>{label}</strong>
      </span>
    </div>
  );
}

/** Confirmation / error message shown after a move, delete or rename. */
export function ActionNotice() {
  const notice = useNotice();
  if (!notice) {
    return null;
  }

  return (
    <Portal>
      <div className={`action-notice${notice.error ? " action-notice--error" : ""}`} role={notice.error ? "alert" : "status"}>
        <span>{notice.text}</span>
        <button type="button" className="action-notice__close" onClick={dismissNotice} aria-label="Dismiss">
          ×
        </button>
      </div>
    </Portal>
  );
}
