import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children at the top of the document rather than where they are declared.
 * Fixed-position UI (dialogs, overlays) must escape the sidebar and content area: both create containing
 * blocks (blur filter, size containment) that would otherwise clip or mis-centre it.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

interface ModalProps {
  onClose: () => void;
  /** The dialog itself (an element with the `dialog` class); the backdrop and centring are handled here. */
  children: ReactNode;
}

/** A centred modal over a dimmed backdrop. Clicking the backdrop or pressing Escape closes it. */
export default function Modal({ onClose, children }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Portal>
      <div className="dialog-backdrop" role="presentation" onClick={onClose}>
        {children}
      </div>
    </Portal>
  );
}
