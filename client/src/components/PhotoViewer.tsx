import { useCallback, useEffect, useRef, useState } from "react";
import { downloadUrl, photoUrl } from "../api";
import type { PhotoEntry } from "../types";
import PhotoInfoModal from "./PhotoInfoModal";

interface PhotoViewerProps {
  photos: PhotoEntry[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const MAX_ZOOM = 6;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

/**
 * Pinch-to-zoom, drag-to-pan and double-tap zoom for just the image, so the rest of the page (the action bar,
 * the caption) stays put. Works with pointer events; the viewer sets touch-action: none so the browser doesn't
 * zoom the whole page instead.
 */
function distanceBetween(points: { x: number; y: number }[]): number {
  const [a, b] = points;
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function useImageZoom(resetKey: string) {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const transformRef = useRef<Transform>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    distance: number;
    scale: number;
    // Point under the fingers, relative to the image's centre, in unscaled image units.
    ox: number;
    oy: number;
    // Where the image's centre would sit with no translation.
    cx: number;
    cy: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);

  const apply = useCallback((next: Transform) => {
    transformRef.current = next;
    setTransform(next);
  }, []);

  // Older iOS Safari ignores touch-action for pinches and fires its own gesture events instead.
  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", block);
    document.addEventListener("gesturechange", block);
    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
    };
  }, []);

  useEffect(() => {
    pointers.current.clear();
    gesture.current = null;
    apply(IDENTITY);
  }, [resetKey, apply]);

  function beginGesture(element: HTMLElement) {
    const points = [...pointers.current.values()];
    if (points.length === 0) {
      gesture.current = null;
      return;
    }
    const current = transformRef.current;
    const rect = element.getBoundingClientRect();
    const rectCx = rect.left + rect.width / 2;
    const rectCy = rect.top + rect.height / 2;
    const mx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const my = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    gesture.current = {
      distance: distanceBetween(points),
      scale: current.scale,
      ox: (mx - rectCx) / current.scale,
      oy: (my - rectCy) / current.scale,
      cx: rectCx - current.x,
      cy: rectCy - current.y,
      lastX: mx,
      lastY: my,
    };
  }

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.pointerType === "mouse") {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) {
        moved.current = false;
      }
      beginGesture(event.currentTarget);
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      if (!pointers.current.has(event.pointerId) || !gesture.current) {
        return;
      }
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.current.values()];
      const start = gesture.current;
      const mx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const my = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      if (Math.abs(mx - start.lastX) > 6 || Math.abs(my - start.lastY) > 6 || points.length > 1) {
        moved.current = true;
      }

      let scale = start.scale;
      if (points.length > 1 && start.distance > 0) {
        const distance = distanceBetween(points);
        scale = Math.min(MAX_ZOOM, Math.max(1, (start.scale * distance) / start.distance));
      } else if (start.scale <= 1) {
        return; // Nothing to pan when not zoomed.
      }
      if (scale <= 1) {
        apply(IDENTITY);
        return;
      }
      apply({ scale, x: mx - start.ox * scale - start.cx, y: my - start.oy * scale - start.cy });
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      if (!pointers.current.delete(event.pointerId)) {
        return;
      }
      if (pointers.current.size === 0 && !moved.current && event.type === "pointerup") {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          lastTap.current = 0;
          if (transformRef.current.scale > 1) {
            apply(IDENTITY);
          } else {
            const rect = event.currentTarget.getBoundingClientRect();
            const scale = 2.5;
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            apply({ scale, x: -(event.clientX - cx) * (scale - 1), y: -(event.clientY - cy) * (scale - 1) });
          }
        } else {
          lastTap.current = now;
        }
      }
      if (transformRef.current.scale <= 1) {
        apply(IDENTITY);
      }
      beginGesture(event.currentTarget);
    },
  };

  return { transform, handlers };
}

export default function PhotoViewer({ photos, index, onClose, onNavigate }: PhotoViewerProps) {
  const photo = photos[index];
  const hasPrevious = index > 0;
  const hasNext = index < photos.length - 1;
  // Stays open while navigating, so details follow the current photo.
  const [infoOpen, setInfoOpen] = useState(false);
  const { transform, handlers: zoomHandlers } = useImageZoom(photo?.path ?? "");

  const goPrevious = useCallback(() => {
    if (hasPrevious) {
      onNavigate(index - 1);
    }
  }, [hasPrevious, index, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) {
      onNavigate(index + 1);
    }
  }, [hasNext, index, onNavigate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (infoOpen) {
          setInfoOpen(false);
        } else {
          onClose();
        }
      } else if (event.key === "ArrowLeft") {
        goPrevious();
      } else if (event.key === "ArrowRight") {
        goNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, onClose, infoOpen]);

  if (!photo) {
    return null;
  }

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={photo.name}
      onClick={(event) => {
        // Clicking the dimmed background does the same as the X button. Clicks that land on the photo, the
        // buttons, the caption or the details panel bubble up here too, but their target isn't the backdrop.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Apart from the toolbar and in the corner, so it is a deliberate reach rather than an easy mis-tap. */}
      <button type="button" className="viewer__button viewer__close" onClick={onClose} aria-label="Close" title="Close (Esc)">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <div className="viewer__toolbar">
        <a
          className="viewer__button"
          href={downloadUrl(photo.path)}
          download={photo.name}
          aria-label={`Download ${photo.name}`}
          title="Download"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V15M12 15L7.5 10.5M12 15L16.5 10.5M5 19.5H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>

        <button
          type="button"
          className={`viewer__button${infoOpen ? " viewer__button--active" : ""}`}
          onClick={() => setInfoOpen((open) => !open)}
          aria-label="Photo details"
          aria-pressed={infoOpen}
          title="Details"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="6.5" r="1.4" fill="currentColor" />
            <path d="M10 10.5H12.25V18M10 18H14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="viewer__nav viewer__nav--previous"
        onClick={goPrevious}
        disabled={!hasPrevious}
        aria-label="Previous photo"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <img
        key={photo.path}
        src={photoUrl(photo.path, photo.mtimeMs)} alt={photo.name}
        className="viewer__image"
        draggable={false}
        style={
          transform.scale > 1
            ? { transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }
            : undefined
        }
        onPointerDown={zoomHandlers.onPointerDown}
        onPointerMove={zoomHandlers.onPointerMove}
        onPointerUp={zoomHandlers.onPointerUp}
        onPointerCancel={zoomHandlers.onPointerUp}
      />

      <button
        type="button"
        className="viewer__nav viewer__nav--next"
        onClick={goNext}
        disabled={!hasNext}
        aria-label="Next photo"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="viewer__caption">
        {photo.name} · {index + 1} / {photos.length}
      </div>

      {infoOpen && (
        <PhotoInfoModal photoPath={photo.path} version={photo.mtimeMs} onClose={() => setInfoOpen(false)} />
      )}
    </div>
  );
}
