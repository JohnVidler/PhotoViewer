import { useCallback, useEffect, useState } from "react";
import { downloadUrl, photoUrl } from "../api";
import type { PhotoEntry } from "../types";
import PhotoInfoModal from "./PhotoInfoModal";

interface PhotoViewerProps {
  photos: PhotoEntry[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function PhotoViewer({ photos, index, onClose, onNavigate }: PhotoViewerProps) {
  const photo = photos[index];
  const hasPrevious = index > 0;
  const hasNext = index < photos.length - 1;
  // Stays open while navigating, so details follow the current photo.
  const [infoOpen, setInfoOpen] = useState(false);

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
    <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.name}>
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

        <button type="button" className="viewer__button" onClick={onClose} aria-label="Close" title="Close">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

      <img key={photo.path} src={photoUrl(photo.path, photo.mtimeMs)} alt={photo.name} className="viewer__image" />

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
