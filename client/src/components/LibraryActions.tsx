import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createFolder, uploadFiles, type UploadItem } from "../api";
import type { UploadSummary } from "../types";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Portal } from "./Modal";

interface LibraryActionsProps {
  /** Folder (relative to the user's library) that uploads and new albums go into. */
  relPath: string;
  /** Name of the folder, for the drop overlay (the path may be an internal ".shared/12" one). */
  folderLabel?: string | undefined;
  /** When set, a Share button is shown that opens the sharing settings of this album. */
  onShare?: (() => void) | undefined;
  /** When set, a Leave album button is shown (inside an album someone shared with the user). */
  onLeave?: (() => void) | undefined;
  /** The user can't change this folder: only the Leave button is shown, and nothing can be dropped or uploaded. */
  readOnly?: boolean | undefined;
}

const IMAGE_PATTERN = /\.(jpe?g|png|webp|gif|avif|tiff?|bmp)$/i;

/** Walks a dropped folder tree. Entries must be grabbed synchronously during the drop event. */
async function readEntry(entry: FileSystemEntry, prefix: string): Promise<UploadItem[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [{ file, path: `${prefix}${entry.name}` }];
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const items: UploadItem[] = [];
  for (;;) {
    const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (children.length === 0) {
      break;
    }
    for (const child of children) {
      items.push(...(await readEntry(child, `${prefix}${entry.name}/`)));
    }
  }
  return items;
}

async function collectDropped(dataTransfer: DataTransfer): Promise<UploadItem[]> {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length === 0) {
    return [...dataTransfer.files].map((file) => ({ file, path: file.name }));
  }

  const nested = await Promise.all(entries.map((entry) => readEntry(entry, "")));
  return nested.flat();
}

export default function LibraryActions({ relPath, folderLabel, onShare, onLeave, readOnly }: LibraryActionsProps) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const [progress, setProgress] = useState<number | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const uploading = progress !== null;

  // On phones the actions float in a bar along the bottom of the screen, within thumb's reach, rather than in the header.
  const compact = useMediaQuery("(max-width: 860px)");

  const upload = useCallback(
    async (items: UploadItem[]) => {
      const images = items.filter((item) => IMAGE_PATTERN.test(item.path));
      const ignored = items.length - images.length;

      if (images.length === 0) {
        setSummary({
          uploaded: 0,
          skipped: items.map((item) => ({ name: item.path, reason: "Not a supported image type" })),
        });
        return;
      }

      setSummary(null);
      setProgress(0);
      const result = await uploadFiles(relPath, images, setProgress);
      if (ignored > 0) {
        result.skipped.push({ name: `${ignored} other file${ignored === 1 ? "" : "s"}`, reason: "Not images" });
      }
      setProgress(null);
      setSummary(result);
    },
    [relPath],
  );

  // Dropping files anywhere on the page uploads them into the folder being viewed.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

    function onEnter(event: DragEvent) {
      if (hasFiles(event)) {
        depth++;
        setDragging(true);
      }
    }
    function onOver(event: DragEvent) {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    }
    function onLeave(event: DragEvent) {
      if (hasFiles(event) && --depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    }
    function onDrop(event: DragEvent) {
      if (!hasFiles(event) || !event.dataTransfer) {
        return;
      }
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void collectDropped(event.dataTransfer).then((items) => upload(items));
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload]);

  function pickedFiles(input: HTMLInputElement | null, useRelativePaths: boolean) {
    const files = [...(input?.files ?? [])];
    if (input) {
      input.value = "";
    }
    void upload(
      files.map((file) => ({
        file,
        path: useRelativePaths && file.webkitRelativePath ? file.webkitRelativePath : file.name,
      })),
    );
  }

  async function submitFolder(event: FormEvent) {
    event.preventDefault();
    setFolderError(null);
    try {
      const created = await createFolder(relPath, folderName);
      setCreating(false);
      setFolderName("");
      navigate(`/${created.split("/").map(encodeURIComponent).join("/")}`);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Could not create the album.");
    }
  }

  const folderForm = (
      <form className="library-actions__form" onSubmit={(event) => void submitFolder(event)}>
        <input
          className="input"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="Album name"
          maxLength={100}
          autoFocus
          aria-label="New album name"
          aria-invalid={folderError !== null}
        />
        <button type="submit" className="button button--primary" disabled={folderName.trim() === ""}>
          Create
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setCreating(false);
            setFolderError(null);
          }}
        >
          Cancel
        </button>
        {folderError && (
          <span className="library-actions__error" role="alert">
            {folderError}
          </span>
        )}
      </form>
  );

  const icon = (path: string) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const actionBar = (
    <Portal>
      <div className="action-bar" role="toolbar" aria-label="Album actions">
        <div className="action-bar__inner">
          {creating ? (
            folderForm
          ) : (
            <>
              {onLeave && (
                <button type="button" className="action-bar__item action-bar__item--danger" onClick={onLeave}>
                  {icon("M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10")}
                  Leave
                </button>
              )}
              {!readOnly && (
                <>
                  {onShare && (
                    <button type="button" className="action-bar__item" onClick={onShare}>
                      {icon("M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7")}
                      Share
                    </button>
                  )}
                  <button type="button" className="action-bar__item" onClick={() => setCreating(true)}>
                    {icon("M12 5v14M5 12h14")}
                    New album
                  </button>
                  <button type="button" className="action-bar__item" disabled={uploading} aria-label="Upload a whole folder" onClick={() => folderInput.current?.click()}>
                    {icon("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z")}
                    Add folder
                  </button>
                  <button type="button" className="action-bar__item action-bar__item--primary" disabled={uploading} aria-label="Upload photos" onClick={() => fileInput.current?.click()}>
                    {icon("M12 16V4M7 9l5-5 5 5M5 20h14")}
                    Add photos
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Portal>
  );

  if (readOnly && compact) {
    return onLeave ? actionBar : null;
  }

  if (readOnly) {
    return onLeave ? (
      <div className="library-actions">
        <button type="button" className="button" onClick={onLeave}>
          Leave album
        </button>
      </div>
    ) : null;
  }

  return (
    <>
      <div className="library-actions">
        {compact ? null : creating ? (
          folderForm
        ) : (
          <>
            {onShare && (
              <button type="button" className="button" onClick={onShare}>
                Share
              </button>
            )}
            {onLeave && (
              <button type="button" className="button" onClick={onLeave}>
                Leave album
              </button>
            )}
            <button type="button" className="button" onClick={() => setCreating(true)}>
              New album
            </button>
            <button type="button" className="button" disabled={uploading} onClick={() => folderInput.current?.click()}>
              Upload folder
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Upload photos
            </button>
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={() => pickedFiles(fileInput.current, false)}
        />
        <input
          ref={folderInput}
          type="file"
          // Non-standard but universally supported attribute for choosing a whole directory.
          {...{ webkitdirectory: "" }}
          multiple
          hidden
          onChange={() => pickedFiles(folderInput.current, true)}
        />
      </div>

      {compact && actionBar}

      {dragging && (
        <Portal>
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-overlay__message">Drop photos or folders to upload{folderLabel && relPath ? ` to ${folderLabel}` : ""}</div>
          </div>
        </Portal>
      )}

      {(uploading || summary) && (
        <Portal>
        <div className="upload-toast" role="status">
          {uploading ? (
            <>
              <div className="upload-toast__text">Uploading… {Math.round((progress ?? 0) * 100)}%</div>
              <div className="upload-toast__bar">
                <div className="upload-toast__fill" style={{ width: `${(progress ?? 0) * 100}%` }} />
              </div>
            </>
          ) : (
            summary && (
              <>
                <div className="upload-toast__text">
                  {summary.uploaded > 0
                    ? `Uploaded ${summary.uploaded} photo${summary.uploaded === 1 ? "" : "s"}`
                    : "Nothing was uploaded"}
                  {summary.skipped.length > 0 && ` · ${summary.skipped.length} skipped`}
                </div>
                {summary.skipped.length > 0 && (
                  <ul className="upload-toast__skipped">
                    {summary.skipped.slice(0, 5).map((skip, index) => (
                      <li key={index}>
                        {skip.name}: {skip.reason}
                      </li>
                    ))}
                    {summary.skipped.length > 5 && <li>…and {summary.skipped.length - 5} more</li>}
                  </ul>
                )}
                <button type="button" className="button upload-toast__close" onClick={() => setSummary(null)}>
                  Dismiss
                </button>
              </>
            )
          )}
        </div>
        </Portal>
      )}
    </>
  );
}
