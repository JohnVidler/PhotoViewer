import { thumbnailUrl } from "../api";
import { formatDate, stripExtension } from "../utils";
import type { PhotoEntry } from "../types";

interface PhotoGridProps {
  photos: PhotoEntry[];
  onSelect: (index: number) => void;
}

export default function PhotoGrid({ photos, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <div className="photo-grid">
      {photos.map((photo, index) => (
        <button
          key={photo.path}
          type="button"
          className="photo-card"
          onClick={() => onSelect(index)}
          aria-label={`Open ${photo.name}`}
        >
          <img
            src={thumbnailUrl(photo.path, photo.mtimeMs)}
            alt=""
            loading="lazy"
            className="photo-card__image"
          />
          <span className="photo-card__overlay">
            <span className="photo-card__title">{stripExtension(photo.name)}</span>
            <span className="photo-card__date">{formatDate(photo.birthtimeMs)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
