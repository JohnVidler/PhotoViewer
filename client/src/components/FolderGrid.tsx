import { Link } from "react-router-dom";
import { thumbnailUrl } from "../api";
import type { FolderEntry, PhotoPreview } from "../types";
import FolderIcon from "./FolderIcon";

interface FolderGridProps {
  folders: FolderEntry[];
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

export default function FolderGrid({ folders }: FolderGridProps) {
  if (folders.length === 0) {
    return null;
  }

  return (
    <div className="folder-grid">
      {folders.map((folder) => (
        <Link key={folder.path} to={`/${folder.path}`} className="folder-card">
          <FolderMosaic previews={folder.previews} />
          <span className="folder-card__info">
            <span className="folder-card__name">{folder.name}</span>
            <span className="folder-card__count">
              {folder.photoCount} {folder.photoCount === 1 ? "photo" : "photos"}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
