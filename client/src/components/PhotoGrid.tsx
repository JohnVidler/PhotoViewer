import { useMemo } from "react";
import { thumbnailUrl } from "../api";
import { dayKey, formatDate, formatDayLabel, photoDateMs, stripExtension } from "../utils";
import type { PhotoEntry } from "../types";
import DateRail from "./DateRail";

interface PhotoGridProps {
  /** Photos in display order; consecutive photos from the same day are grouped together. */
  photos: PhotoEntry[];
  onSelect: (index: number) => void;
}

interface DayGroup {
  key: string;
  label: string;
  items: { photo: PhotoEntry; index: number }[];
}

export default function PhotoGrid({ photos, onSelect }: PhotoGridProps) {
  const groups = useMemo(() => {
    const result: DayGroup[] = [];
    photos.forEach((photo, index) => {
      const dateMs = photoDateMs(photo);
      const key = dayKey(dateMs);
      let group = result[result.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: formatDayLabel(dateMs), items: [] };
        result.push(group);
      }
      group.items.push({ photo, index });
    });
    return result;
  }, [photos]);

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="day-group">
          <h3 id={`day-${group.key}`} className="day-group__heading" data-label={group.label}>
            <span className="day-group__label">{group.label}</span>
            <span className="page__section-count">{group.items.length}</span>
          </h3>
          <div className="photo-grid">
            {group.items.map(({ photo, index }) => (
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
                  <span className="photo-card__date">{formatDate(photoDateMs(photo))}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <DateRail markerSelector=".day-group__heading" />
    </>
  );
}
