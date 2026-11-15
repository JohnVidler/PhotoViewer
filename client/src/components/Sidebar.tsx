import { useEffect, useState } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { thumbnailUrl } from "../api";
import { useAuth } from "../auth";
import { useMoveDrop } from "../hooks/itemActions";
import { useBrowse } from "../hooks/useBrowse";
import { useSharedWithMe } from "../hooks/useSharedWithMe";
import type { PhotoPreview } from "../types";
import FolderIcon from "./FolderIcon";

interface SidebarProps {
  currentPath: string;
  open: boolean;
  onClose: () => void;
}

const COVER_SIZE = 96;

export const SETTINGS_ROUTE = ".settings";

/**
 * A sidebar link that photos can be dragged onto: moved into that album if they come from the same tree, copied if
 * they come from another ("" = top of the user's library). Read-only shared albums (`writable={false}`) take no drops.
 */
function DropLink({
  destination,
  label,
  writable = true,
  className,
  ...rest
}: LinkProps & { destination: string; label: string; writable?: boolean }) {
  const { over, active, dropProps } = useMoveDrop(destination, label, writable);
  return (
    <Link
      {...rest}
      className={`${className ?? ""}${active ? " sidebar__item--droppable" : ""}${over ? " sidebar__item--drop" : ""}`}
      {...dropProps}
    />
  );
}

export default function Sidebar({ currentPath, open, onClose }: SidebarProps) {
  const { data, error } = useBrowse("");
  const { status, signOut } = useAuth();
  const user = status?.user ?? null;
  const sharedFolders = useSharedWithMe(user !== null) ?? [];

  const renderAlbum = (
    folder: { name: string; path: string; photoCount: number; previews: PhotoPreview[] },
    writable: boolean,
    note?: string,
  ) => {
    const active = currentPath === folder.path || currentPath.startsWith(`${folder.path}/`);
    const cover = folder.previews[0];

    return (
      <li key={folder.path}>
        <DropLink
          to={`/${folder.path}`}
          destination={folder.path}
          label={folder.name}
          writable={writable}
          title={note}
          className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
          aria-current={currentPath === folder.path ? "page" : undefined}
        >
          {cover ? (
            <img className="sidebar__thumb" src={thumbnailUrl(cover.path, cover.mtimeMs, COVER_SIZE)} alt="" loading="lazy" />
          ) : (
            <span className="sidebar__thumb sidebar__thumb--icon" aria-hidden="true">
              <FolderIcon />
            </span>
          )}
          <span className="sidebar__label">{folder.name}</span>
          <span className="sidebar__count">{folder.photoCount}</span>
        </DropLink>
      </li>
    );
  };

  const onSettings = currentPath === SETTINGS_ROUTE || currentPath.startsWith(`${SETTINGS_ROUTE}/`);
  // Open by default while on a settings page; otherwise the tree stays collapsed until asked for.
  const [settingsOpen, setSettingsOpen] = useState(onSettings);

  useEffect(() => {
    if (onSettings) {
      setSettingsOpen(true);
    }
  }, [onSettings]);
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
          <button type="button" className="sidebar__close" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar__nav">
          <DropLink
            to="/"
            destination=""
            label="My Library"
            className={`sidebar__item${currentPath === "" ? " sidebar__item--active" : ""}`}
            aria-current={currentPath === "" ? "page" : undefined}
          >
            <span className="sidebar__thumb sidebar__thumb--icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 11L12 4L20 11V19.5C20 19.7761 19.7761 20 19.5 20H4.5C4.22386 20 4 19.7761 4 19.5V11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="sidebar__label">My Library</span>
          </DropLink>

          <h2 className="sidebar__heading">Albums</h2>

          {error && <p className="sidebar__note">{error}</p>}
          {data && folders.length === 0 && <p className="sidebar__note">No albums yet</p>}

          <ul className="sidebar__list">{folders.map((folder) => renderAlbum(folder, true))}</ul>

          {sharedFolders.length > 0 && (
            <>
              <h2 className="sidebar__heading">Shared With Me</h2>
              <ul className="sidebar__list">
                {sharedFolders.map((folder) =>
                  renderAlbum(folder, folder.canWrite, `shared by ${folder.ownerName}${folder.canWrite ? " · can edit" : ""}`),
                )}
              </ul>
            </>
          )}
        </nav>

        {user && (
          <div className="sidebar__account">
            <div className="sidebar__settings">
              <button
                type="button"
                className={`sidebar__item sidebar__settings-toggle${onSettings ? " sidebar__item--active" : ""}`}
                aria-expanded={settingsOpen}
                aria-controls="settings-tree"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <span className="sidebar__thumb sidebar__thumb--icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 3V5M12 19V21M3 12H5M19 12H21M5.6 5.6L7 7M17 17L18.4 18.4M5.6 18.4L7 17M17 7L18.4 5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="sidebar__label">Settings</span>
                <svg
                  className={`sidebar__chevron${settingsOpen ? " sidebar__chevron--open" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {settingsOpen && (
                <ul id="settings-tree" className="sidebar__tree">
                  <li>
                    <Link
                      to={`/${SETTINGS_ROUTE}/user-settings`}
                      className={`sidebar__tree-link${currentPath === `${SETTINGS_ROUTE}/user-settings` ? " sidebar__tree-link--active" : ""}`}
                      aria-current={currentPath === `${SETTINGS_ROUTE}/user-settings` ? "page" : undefined}
                    >
                      User Settings
                    </Link>
                  </li>
                  {user.role === "admin" && (
                    <li>
                      <span className="sidebar__tree-heading">Admin</span>
                      <ul className="sidebar__tree sidebar__tree--nested">
                        <li>
                          <Link
                            to={`/${SETTINGS_ROUTE}/admin/users`}
                            className={`sidebar__tree-link${currentPath === `${SETTINGS_ROUTE}/admin/users` ? " sidebar__tree-link--active" : ""}`}
                            aria-current={currentPath === `${SETTINGS_ROUTE}/admin/users` ? "page" : undefined}
                          >
                            Users
                          </Link>
                        </li>
                        <li>
                          <Link
                            to={`/${SETTINGS_ROUTE}/admin/links`}
                            className={`sidebar__tree-link${currentPath === `${SETTINGS_ROUTE}/admin/links` ? " sidebar__tree-link--active" : ""}`}
                            aria-current={currentPath === `${SETTINGS_ROUTE}/admin/links` ? "page" : undefined}
                          >
                            Sharing links
                          </Link>
                        </li>
                      </ul>
                    </li>
                  )}
                </ul>
              )}
            </div>

            <div className="sidebar__user">
              <span className="sidebar__user-name">{user.displayName ?? user.username}</span>
              <span className="sidebar__user-email">
                {user.displayName ? `@${user.username} · ` : ""}
                {user.role === "admin" ? "Administrator" : "Member"}
              </span>
            </div>
            <button type="button" className="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
