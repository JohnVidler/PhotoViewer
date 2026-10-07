import { useEffect } from "react";
import { Link } from "react-router-dom";
import { thumbnailUrl } from "../api";
import { useBrowse } from "../hooks/useBrowse";
import FolderIcon from "./FolderIcon";

interface SidebarProps {
  currentPath: string;
  open: boolean;
  onClose: () => void;
}

const COVER_SIZE = 96;

export default function Sidebar({ currentPath, open, onClose }: SidebarProps) {
  const { data, error } = useBrowse("");
  const folders = data?.folders ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`sidebar-backdrop${open ? " sidebar-backdrop--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar${open ? " sidebar--open" : ""}`} aria-label="Albums">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="9" cy="10" r="1.75" fill="currentColor" />
              <path d="M4 17L9.5 12.5L13 15.5L16 13L20 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
          PhotoViewer
        </div>

        <nav className="sidebar__nav">
          <Link
            to="/"
            className={`sidebar__item${currentPath === "" ? " sidebar__item--active" : ""}`}
            aria-current={currentPath === "" ? "page" : undefined}
          >
            <span className="sidebar__thumb sidebar__thumb--icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 11L12 4L20 11V19.5C20 19.7761 19.7761 20 19.5 20H4.5C4.22386 20 4 19.7761 4 19.5V11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="sidebar__label">Library</span>
          </Link>

          <h2 className="sidebar__heading">Albums</h2>

          {error && <p className="sidebar__note">{error}</p>}
          {data && folders.length === 0 && <p className="sidebar__note">No albums yet</p>}

          <ul className="sidebar__list">
            {folders.map((folder) => {
              const active = currentPath === folder.path || currentPath.startsWith(`${folder.path}/`);
              const cover = folder.previews[0];

              return (
                <li key={folder.path}>
                  <Link
                    to={`/${folder.path}`}
                    className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
                    aria-current={currentPath === folder.path ? "page" : undefined}
                  >
                    {cover ? (
                      <img
                        className="sidebar__thumb"
                        src={thumbnailUrl(cover.path, cover.mtimeMs, COVER_SIZE)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className="sidebar__thumb sidebar__thumb--icon" aria-hidden="true">
                        <FolderIcon />
                      </span>
                    )}
                    <span className="sidebar__label">{folder.name}</span>
                    <span className="sidebar__count">{folder.photoCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
