import { useMemo } from "react";
import { beginDrag, endDrag, useDragged } from "../hooks/itemActions";
import { thumbnailUrl } from "../api";
import { dayKey, formatDate, formatDayLabel, photoDateMs, stripExtension } from "../utils";
import type { PhotoEntry } from "../types";
import DateRail from "./DateRail";
import SelectBox from "./SelectBox";

interface PhotoGridProps {
  /** Photos in display order; consecutive photos from the same day are grouped together. */
  photos: PhotoEntry[];
  /** Opens a photo in the viewer. */
  onSelect: (index: number) => void;
  /** Paths of the photos (and albums) currently ticked. */
  selected: Set<string>;
  onToggleSelect: (path: string) => void;
  /** Photos can be ticked (for move, rename, delete) where the user may change the folder. */
  selectable: boolean;
  /** Photos can be dragged out (to move them, or copy them into another tree) for any signed-in user. */
  draggable: boolean;
  /** What to drag when this photo is picked up: the whole selection if it is part of it, otherwise just itself. */
  dragPayload: (path: string) => string[];
}

interface PhotoTileProps {
  photo: PhotoEntry;
  index: number;
  selected: boolean;
  selecting: boolean;
  selectable: boolean;
  draggable: boolean;
  dragPayload: (path: string) => string[];
  onOpen: (index: number) => void;
  onToggle: (path: string) => void;
}

function PhotoTile({ photo, index, selected, selecting, selectable, draggable, dragPayload, onOpen, onToggle }: PhotoTileProps) {
  const dragged = useDragged();
  const dragging = dragged.includes(photo.path);
  const activate = () => (selecting && selectable ? onToggle(photo.path) : onOpen(index));

  return (
    <div
      className={`photo-tile${selected ? " photo-tile--selected" : ""}${selecting ? " photo-tile--selecting" : ""}${dragging ? " photo-tile--dragging" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? (event) => beginDrag(event, dragPayload(photo.path)) : undefined}
      onDragEnd={draggable ? endDrag : undefined}
    >
      {/* Not a <button>: Firefox won't start a drag from inside one. It behaves like a button for keyboards. */}
      <div
        role="button"
        tabIndex={0}
        className="photo-card"
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        }}
        aria-label={selecting && selectable ? `Select ${photo.name}` : `Open ${photo.name}`}
      >
        <img
          src={thumbnailUrl(photo.path, photo.mtimeMs)}
          alt=""
          loading="lazy"
          draggable={false}
          className="photo-card__image"
        />
        <span className="photo-card__overlay">
          <span className="photo-card__title">{stripExtension(photo.name)}</span>
          <span className="photo-card__date">{formatDate(photoDateMs(photo))}</span>
        </span>
      </div>
      {selectable && <SelectBox checked={selected} label={photo.name} onToggle={() => onToggle(photo.path)} />}
    </div>
  );
}

interface DayGroup {
  key: string;
  label: string;
  items: { photo: PhotoEntry; index: number }[];
}

export default function PhotoGrid({ photos, onSelect, selected, onToggleSelect, selectable, draggable, dragPayload }: PhotoGridProps) {
  const selecting = selected.size > 0;
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
              <PhotoTile
                key={photo.path}
                photo={photo}
                index={index}
                selected={selected.has(photo.path)}
                selecting={selecting}
                selectable={selectable}
                draggable={draggable}
                dragPayload={dragPayload}
                onOpen={onSelect}
                onToggle={onToggleSelect}
              />
            ))}
          </div>
        </section>
      ))}
      <DateRail markerSelector=".day-group__heading" />
    </>
  );
}
