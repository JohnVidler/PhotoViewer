import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { deleteAdminLink, fetchAdminLinks } from "../api";
import type { AdminLink } from "../types";
import Modal from "./Modal";

interface AdminLinksPageProps {
  onOpenSidebar: () => void;
}

function linkUrl(link: AdminLink): string {
  return `${window.location.origin}/${link.kind === "public" ? ".public" : ".invite"}/${link.token}`;
}

function usesLabel(link: AdminLink): string {
  return link.maxUses === null
    ? "No limit"
    : `${link.uses ?? 0} of ${link.maxUses} uses${link.uses !== null && link.uses >= link.maxUses ? " (used up)" : ""}`;
}

/** A row that can be dragged sideways; letting go past the threshold calls onSwipe, then the row springs back. */
function SwipeRow({
  children,
  disabled,
  label,
  onSwipe,
}: {
  children: ReactNode;
  disabled: boolean;
  /** Accessible name for the keyboard/screen-reader delete button. */
  label: string;
  onSwipe: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
  const rowRef = useRef<HTMLLIElement>(null);

  const threshold = () => Math.min(140, (rowRef.current?.offsetWidth ?? 300) * 0.4);

  function onPointerDown(event: React.PointerEvent) {
    if (disabled || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, locked: false };
  }

  function onPointerMove(event: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // vertical scroll, not a swipe
        return;
      }
      if (Math.abs(dx) < 8) return;
      s.locked = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(dx);
  }

  function finish(event: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    start.current = null;
    setDragging(false);
    if (s.locked && Math.abs(offset) >= threshold()) onSwipe();
    setOffset(0);
  }

  const armed = Math.abs(offset) >= threshold();

  return (
    <li className={`swipe-row${armed ? " swipe-row--armed" : ""}`} ref={rowRef}>
      <div className="swipe-row__action" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Delete
      </div>
      <div
        className={`swipe-row__content${dragging ? " swipe-row__content--dragging" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {children}
        <button type="button" className="swipe-row__delete" disabled={disabled} onClick={onSwipe}>
          Delete<span className="visually-hidden"> {label}</span>
        </button>
      </div>
    </li>
  );
}

export default function AdminLinksPage({ onOpenSidebar }: AdminLinksPageProps) {
  const [links, setLinks] = useState<AdminLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminLink | null>(null);
  const compact = useMediaQuery("(max-width: 860px)");

  const load = useCallback(async () => {
    try {
      setLinks(await fetchAdminLinks());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load sharing links.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(link: AdminLink) {
    setPendingDelete(null);
    setBusy(true);
    setError(null);
    try {
      await deleteAdminLink(link.kind, link.id);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
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
          <h1 className="page__title">Sharing links</h1>
          <nav className="breadcrumbs" aria-label="Settings path">
            <span>Settings</span>
            <span className="breadcrumbs__separator">/</span>
            <span>Admin</span>
            <span className="breadcrumbs__separator">/</span>
            <span className="breadcrumbs__current">Sharing links</span>
          </nav>
        </div>
      </header>

      <main>
        {error && <div className="state-message state-message--error admin__error">{error}</div>}

        <section className="admin__card">
          <span className="admin__hint">
            Every public and invite link on this server. Public links have no limit; invite links stop working once
            they've been used the allowed number of times. Deleting a link stops it working straight away, but people who
            already used an invite keep their access.{compact && " Swipe a link sideways to delete it."}
          </span>
        </section>

        {links === null && !error && <div className="state-message">Loading…</div>}
        {links !== null && links.length === 0 && <div className="state-message">There are no sharing links.</div>}

        {links !== null && links.length > 0 && compact && (
          <ul className="swipe-list" aria-label="Sharing links">
            {links.map((link) => {
              const used = link.uses ?? 0;
              const usedUp = link.maxUses !== null && used >= link.maxUses;
              return (
                <SwipeRow
                  key={`${link.kind}-${link.id}`}
                  disabled={busy}
                  label={`link to ${link.path}`}
                  onSwipe={() => setPendingDelete(link)}
                >
                  <div className="link-card__head">
                    <h2 className="link-card__title">{link.path}</h2>
                    <span className={`chip chip--${link.kind === "public" ? "public" : "invite"}`}>
                      {link.kind === "public" ? "Public" : "Invite"}
                    </span>
                  </div>
                  <dl className="link-card__facts">
                    <div>
                      <dt>Owner</dt>
                      <dd>{link.ownerLabel}</dd>
                    </div>
                    <div>
                      <dt>Access</dt>
                      <dd>{link.canWrite ? "Can edit" : "View only"}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{new Date(link.createdAt).toLocaleDateString()}</dd>
                    </div>
                    <div>
                      <dt>Uses</dt>
                      <dd>
                        {link.maxUses === null ? (
                          "No limit"
                        ) : (
                          <>
                            {used} of {link.maxUses}
                            {usedUp && <span className="link-card__used-up"> · used up</span>}
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {link.maxUses !== null && (
                    <div
                      className={`link-card__meter${usedUp ? " link-card__meter--full" : ""}`}
                      role="progressbar"
                      aria-label="Uses"
                      aria-valuemin={0}
                      aria-valuemax={link.maxUses}
                      aria-valuenow={Math.min(used, link.maxUses)}
                    >
                      <span style={{ width: `${Math.min(100, (used / link.maxUses) * 100)}%` }} />
                    </div>
                  )}
                </SwipeRow>
              );
            })}
          </ul>
        )}

        {links !== null && links.length > 0 && !compact && (
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>Album</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Limit</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={`${link.kind}-${link.id}`}>
                    <td>
                      <div className="admin__name">{link.path}</div>
                      <div className="admin__hint">{link.canWrite ? "Can edit" : "View only"}</div>
                    </td>
                    <td>{link.ownerLabel}</td>
                    <td>{link.kind === "public" ? "Public link" : "Invite link"}</td>
                    <td>{usesLabel(link)}</td>
                    <td>{new Date(link.createdAt).toLocaleString()}</td>
                    <td className="admin__actions">
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={busy}
                        onClick={() => setPendingDelete(link)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {pendingDelete && (
        <Modal onClose={() => setPendingDelete(null)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-labelledby="delete-link-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-link-title" className="dialog__title">
              Delete this {pendingDelete.kind === "public" ? "public" : "invite"} link?
            </h2>
            <p className="dialog__text">
              The link to “{pendingDelete.path}” ({pendingDelete.ownerLabel}) will stop working immediately.
              {pendingDelete.kind === "invite" && " People who already used it keep their access."}
            </p>
            <input className="input" readOnly value={linkUrl(pendingDelete)} aria-label="Link address" onFocus={(e) => e.currentTarget.select()} />
            <div className="dialog__buttons">
              <button type="button" className="button" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="button button--danger" onClick={() => void remove(pendingDelete)}>
                Delete link
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
