import { useState } from "react";
import { useBrowse } from "../hooks/useBrowse";
import Breadcrumbs from "./Breadcrumbs";
import FolderGrid from "./FolderGrid";
import PhotoGrid from "./PhotoGrid";
import PhotoViewer from "./PhotoViewer";

interface BrowsePageProps {
  relPath: string;
  onOpenSidebar: () => void;
}

export default function BrowsePage({ relPath, onOpenSidebar }: BrowsePageProps) {
  const { data, error } = useBrowse(relPath);

  // Track the open photo by path so it survives live refreshes that reorder the list;
  // if it disappears from disk the viewer simply closes.
  const [viewerPath, setViewerPath] = useState<string | null>(null);

  const title = relPath ? relPath.split("/").pop()! : "Library";

  let body;
  if (error) {
    body = <div className="state-message state-message--error">{error}</div>;
  } else if (!data) {
    body = <div className="state-message">Loading…</div>;
  } else if (data.folders.length === 0 && data.photos.length === 0) {
    body = <div className="state-message">This folder is empty.</div>;
  } else {
    const photos = data.photos;
    const viewerIndex = viewerPath === null ? -1 : photos.findIndex((photo) => photo.path === viewerPath);

    body = (
      <>
        {data.folders.length > 0 && (
          <section className="page__section" aria-labelledby="albums-heading">
            <h2 id="albums-heading" className="page__section-title">
              Albums <span className="page__section-count">{data.folders.length}</span>
            </h2>
            <FolderGrid folders={data.folders} />
          </section>
        )}

        {photos.length > 0 && (
          <section className="page__section" aria-labelledby="photos-heading">
            <h2 id="photos-heading" className="page__section-title">
              Photos <span className="page__section-count">{photos.length}</span>
            </h2>
            <PhotoGrid photos={photos} onSelect={(index) => setViewerPath(photos[index]?.path ?? null)} />
          </section>
        )}

        {viewerIndex !== -1 && (
          <PhotoViewer
            photos={photos}
            index={viewerIndex}
            onClose={() => setViewerPath(null)}
            onNavigate={(index) => setViewerPath(photos[index]?.path ?? null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <button type="button" className="page__menu-button" onClick={onOpenSidebar} aria-label="Show albums">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="page__heading">
          <h1 className="page__title">{title}</h1>
          {relPath && <Breadcrumbs path={relPath} />}
        </div>
      </header>

      <main>{body}</main>
    </div>
  );
}
