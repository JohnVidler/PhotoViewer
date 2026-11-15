import { useNavigate } from "react-router-dom";
import { leaveSharedAlbum } from "../api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { baseName, treeOf } from "../hooks/itemActions";
import { useBrowse } from "../hooks/useBrowse";
import { useSharedWithMe } from "../hooks/useSharedWithMe";
import type { FolderEntry } from "../types";
import { dayKey, photoDateMs } from "../utils";
import AlbumDescription from "./AlbumDescription";
import Breadcrumbs from "./Breadcrumbs";
import { ParentDropZone } from "./DropStrips";
import FolderGrid from "./FolderGrid";
import { DeleteDialog, MoveDialog, RenameDialog } from "./ItemDialogs";
import LibraryActions from "./LibraryActions";
import PhotoGrid from "./PhotoGrid";
import PhotoViewer from "./PhotoViewer";
import SelectionBar, { type SelectedItem } from "./SelectionBar";
import ShareDialog from "./ShareDialog";

interface BrowsePageProps {
  relPath: string;
  /** Opens the sidebar drawer on small screens. Omitted where there is no sidebar (public links). */
  onOpenSidebar?: (() => void) | undefined;
}

export default function BrowsePage({ relPath, onOpenSidebar }: BrowsePageProps) {
  const { data, error } = useBrowse(relPath);
  const navigate = useNavigate();
  const { status } = useAuth();
  const signedIn = status?.user != null;

  // Which tree this folder belongs to: the user's own library, an album shared with them, or a public link.
  const tree = treeOf(relPath);
  const isOwn = tree === "";
  const scope = data?.scope;
  // Anyone signed in may pick photos up and drag them out (to copy them into their own library, say), but things
  // can only be ticked, uploaded, moved, renamed or deleted where the user is allowed to change the folder.
  const canModify = signedIn && (isOwn || scope?.canWrite === true);
  const canDrag = signedIn;

  // Track the open photo by path so it survives live refreshes that reorder the list;
  // if it disappears from disk the viewer simply closes.
  const [viewerPath, setViewerPath] = useState<string | null>(null);

  // Ticked photos and albums, by path. Cleared when the folder changes, because this page is keyed by folder.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<"move" | "rename" | "delete" | null>(null);
  // The own album whose sharing settings are open, if any.
  const [shareTarget, setShareTarget] = useState<string | null>(null);

  // Albums other people have shared with the user are listed in the library under "Shared With Me".
  const sharedWithMe = useSharedWithMe(signedIn && relPath === "");
  const sharedFolders: FolderEntry[] = useMemo(
    () =>
      (sharedWithMe ?? []).map((folder) => ({
        name: folder.name,
        path: folder.path,
        photoCount: folder.photoCount,
        previews: folder.previews,
        subtitle: `shared by ${folder.ownerName}${folder.canWrite ? " · can edit" : ""}`,
        writable: folder.canWrite,
      })),
    [sharedWithMe],
  );

  const toggleSelect = useCallback((path: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Forget ticks for things that have gone (deleted, moved away, renamed).
  useEffect(() => {
    if (!data) {
      return;
    }
    const present = new Set([...data.folders.map((folder) => folder.path), ...data.photos.map((photo) => photo.path)]);
    setSelected((previous) => {
      const next = new Set([...previous].filter((path) => present.has(path)));
      return next.size === previous.size ? previous : next;
    });
  }, [data]);

  // Escape clears the selection (unless a dialog or the photo viewer has its own use for it).
  useEffect(() => {
    if (selected.size === 0 || dialog !== null || shareTarget !== null || viewerPath !== null) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelected(new Set());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected.size, dialog, shareTarget, viewerPath]);

  const selectedItems: SelectedItem[] = useMemo(() => {
    if (!data) {
      return [];
    }
    return [
      ...data.folders.filter((folder) => selected.has(folder.path)).map((folder) => ({ path: folder.path, name: folder.name, isFolder: true })),
      ...data.photos.filter((photo) => selected.has(photo.path)).map((photo) => ({ path: photo.path, name: photo.name, isFolder: false })),
    ];
  }, [data, selected]);

  const folderPhotoCounts = useMemo(
    () => new Map((data?.folders ?? []).map((folder) => [folder.path, folder.photoCount])),
    [data],
  );

  const totalItems = (data?.folders.length ?? 0) + (data?.photos.length ?? 0);
  // Picking up a ticked photo drags the whole selection; an unticked one drags just itself.
  const dragPayload = useCallback((path: string) => (selected.has(path) ? [...selected] : [path]), [selected]);

  // Newest day first; the viewer navigates in this same order so it matches the grid.
  const photos = useMemo(
    () =>
      [...(data?.photos ?? [])].sort(
        (a, b) => dayKey(photoDateMs(b)).localeCompare(dayKey(photoDateMs(a))) || a.name.localeCompare(b.name),
      ),
    [data],
  );

  // The name of the tree's top folder: "Library" for the user's own, the album's own name for a share.
  const rootLabel = isOwn ? "Library" : (scope?.name ?? "Shared album");
  const title = relPath === tree ? rootLabel : baseName(relPath);

  const sharedSection = relPath === "" && sharedFolders.length > 0 && (
    <section className="page__section" aria-labelledby="shared-heading">
      <h2 id="shared-heading" className="page__section-title">
        Shared With Me <span className="page__section-count">{sharedFolders.length}</span>
      </h2>
      <FolderGrid folders={sharedFolders} selected={selected} onToggleSelect={toggleSelect} editable={false} />
    </section>
  );

  let body;
  if (error) {
    body = <div className="state-message state-message--error">{error}</div>;
  } else if (!data) {
    body = <div className="state-message">Loading…</div>;
  } else if (data.folders.length === 0 && data.photos.length === 0) {
    body = (
      <>
        <div className="state-message">
          {relPath === "" ? "Your library is empty." : "This folder is empty."}
          {canModify && " Upload photos, or drop them anywhere on this page."}
        </div>
        {/* A brand-new library has nothing else to hint at albums, so offer the tile on its own. */}
        {relPath === "" && canModify && (
          <section className="page__section" aria-label="Albums">
            <FolderGrid folders={[]} selected={selected} onToggleSelect={toggleSelect} editable={canModify} newAlbumParent="" />
          </section>
        )}
        {sharedSection}
      </>
    );
  } else {
    const viewerIndex = viewerPath === null ? -1 : photos.findIndex((photo) => photo.path === viewerPath);

    // The "New album" tile belongs to the user's own library view. It is hidden when the library holds only loose
    // photos and no albums, so a collection of bare photos isn't nagged to become one of albums.
    const showNewAlbumTile = relPath === "" && canModify && data.folders.length > 0;

    body = (
      <>
        {data.folders.length > 0 && (
          <section className="page__section" aria-labelledby="albums-heading">
            <h2 id="albums-heading" className="page__section-title">
              Albums <span className="page__section-count">{data.folders.length}</span>
            </h2>
            <FolderGrid
              folders={data.folders}
              selected={selected}
              onToggleSelect={toggleSelect}
              editable={canModify}
              newAlbumParent={showNewAlbumTile ? "" : undefined}
            />
          </section>
        )}

        {sharedSection}

        {photos.length > 0 && (
          <section className="page__section" aria-labelledby="photos-heading">
            <h2 id="photos-heading" className="page__section-title">
              Photos <span className="page__section-count">{photos.length}</span>
            </h2>
            <PhotoGrid
              photos={photos}
              onSelect={(index) => setViewerPath(photos[index]?.path ?? null)}
              selected={selected}
              onToggleSelect={toggleSelect}
              selectable={canModify}
              draggable={canDrag}
              dragPayload={dragPayload}
            />
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

  // Sharing is for whole albums that belong to the user: not photos, not the library itself, not someone else's share.
  const singleOwnAlbum = isOwn && selectedItems.length === 1 && selectedItems[0]!.isFolder ? selectedItems[0]! : null;

  // The id of the share when this folder is inside an album someone shared with the user.
  const sharedId = scope?.kind === "shared" ? /^\.shared\/(\d+)/.exec(relPath)?.[1] : undefined;
  async function leave() {
    if (!sharedId || !window.confirm(`Leave "${scope?.name}"? You'll lose access unless ${scope?.ownerName} shares it with you again.`)) {
      return;
    }
    try {
      await leaveSharedAlbum(Number(sharedId));
      navigate("/");
    } catch (failure) {
      window.alert(failure instanceof Error ? failure.message : "Could not leave the album.");
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        {onOpenSidebar && (
          <button type="button" className="page__menu-button" onClick={onOpenSidebar} aria-label="Show albums">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div className="page__heading">
          <h1 className="page__title">{title}</h1>
          {relPath && <Breadcrumbs path={relPath} scope={scope} />}
          {scope && (
            <p className="page__subtitle">
              {scope.kind === "public"
                ? `Public album shared by ${scope.ownerName}`
                : `Shared by ${scope.ownerName} · ${scope.canWrite ? "you can edit" : "view only"}`}
            </p>
          )}
        </div>
        {(canModify || sharedId) && (
          <LibraryActions
            readOnly={!canModify}
            onLeave={sharedId ? () => void leave() : undefined}
            relPath={relPath}
            folderLabel={title}
            onShare={isOwn && relPath !== "" ? () => setShareTarget(relPath) : undefined}
          />
        )}
      </header>

      <main>
        {canModify && relPath !== tree && <ParentDropZone relPath={relPath} rootLabel={rootLabel} />}
        {data && relPath !== "" && (
          <AlbumDescription key={relPath} path={relPath} description={data.description} editable={canModify} />
        )}
        {body}
      </main>

      {canModify && selectedItems.length > 0 && (
        <SelectionBar
          items={selectedItems}
          allSelected={selectedItems.length === totalItems}
          onSelectAll={() =>
            setSelected(new Set([...(data?.folders ?? []).map((folder) => folder.path), ...(data?.photos ?? []).map((photo) => photo.path)]))
          }
          onClear={() => setSelected(new Set())}
          onMove={() => setDialog("move")}
          onRename={() => setDialog("rename")}
          onDelete={() => setDialog("delete")}
          onShare={singleOwnAlbum ? () => setShareTarget(singleOwnAlbum.path) : undefined}
        />
      )}

      {dialog === "move" && (
        <MoveDialog
          items={selectedItems}
          startPath={relPath}
          rootPath={tree}
          rootLabel={rootLabel}
          onClose={() => setDialog(null)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          items={selectedItems}
          folderPhotoCounts={folderPhotoCounts}
          onClose={() => setDialog(null)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {dialog === "rename" && selectedItems[0] && (
        <RenameDialog item={selectedItems[0]} onClose={() => setDialog(null)} onDone={() => setSelected(new Set())} />
      )}
      {shareTarget !== null && <ShareDialog path={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}
