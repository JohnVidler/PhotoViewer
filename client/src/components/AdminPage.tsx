import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { createUser, deleteUser, fetchAdminUsers, resetUserPassword, setSignupsEnabled, setUserLocked } from "../api";
import type { AdminUser } from "../types";
import Modal from "./Modal";

interface AdminPageProps {
  onOpenSidebar: () => void;
}

const MIN_PASSWORD_LENGTH = 10;

function formatDate(ms: number | null): string {
  return ms === null ? "Never" : new Date(ms).toLocaleString();
}

function statusLabel(user: AdminUser): string {
  return user.role === "admin" ? "Administrator" : user.status === "locked" ? "Locked" : "Active";
}

export default function AdminPage({ onOpenSidebar }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [signups, setSignups] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deletePhotos, setDeletePhotos] = useState(false);

  const compact = useMediaQuery("(max-width: 860px)");
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const [pendingReset, setPendingReset] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users);
      setSignups(data.signupsEnabled);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Runs one admin action, then reloads so the table always reflects the server. Returns whether it worked.
  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (await run(() => createUser(newUsername, newPassword))) {
      setNewUsername("");
      setNewPassword("");
    }
  }

  function closeDeleteDialog() {
    setPendingDelete(null);
    setDeletePhotos(false);
  }

  function closeResetDialog() {
    setPendingReset(null);
    setResetPassword("");
  }

  const detailsUser = compact && detailsId !== null ? (users?.find((user) => user.id === detailsId) ?? null) : null;

  return (
    <div className="page">
      <header className="page__header">
        <button type="button" className="page__menu-button" onClick={onOpenSidebar} aria-label="Show albums">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="page__heading">
          <h1 className="page__title">Users</h1>
          <nav className="breadcrumbs" aria-label="Settings path">
            <span>Settings</span>
            <span className="breadcrumbs__separator">/</span>
            <span>Admin</span>
            <span className="breadcrumbs__separator">/</span>
            <span className="breadcrumbs__current">Users</span>
          </nav>
        </div>
      </header>

      <main>
        {error && <div className="state-message state-message--error admin__error">{error}</div>}

        <section className="admin__card">
          <label className="admin__toggle">
            <input
              type="checkbox"
              checked={signups}
              disabled={busy || users === null}
              onChange={(event) => void run(() => setSignupsEnabled(event.target.checked))}
            />
            <span>
              <strong>Allow people to create their own accounts</strong>
              <span className="admin__hint">
                When off, the sign-in page has no "Create an account" option. You can still add people below.
              </span>
            </span>
          </label>

          <form className="admin__add" onSubmit={(event) => void addUser(event)}>
            <input
              className="input"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              placeholder="New username"
              aria-label="New username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Password (10+ characters)"
              aria-label="Password for the new user"
              autoComplete="new-password"
              required
            />
            <button type="submit" className="button button--primary" disabled={busy}>
              Add user
            </button>
          </form>
        </section>

        {users === null && !error && <div className="state-message">Loading…</div>}

        {users !== null && compact && (
          <ul className="user-list" aria-label="Users">
            {users.map((user) => (
              <li key={user.id}>
                <button type="button" className="user-list__item" onClick={() => setDetailsId(user.id)}>
                  <span className="user-list__name">
                    <strong>{user.username}</strong>
                    {user.displayName && <span className="admin__hint">{user.displayName}</span>}
                  </span>
                  <span className={`chip chip--${user.role === "admin" ? "admin" : user.status}`}>{statusLabel(user)}</span>
                  <svg className="user-list__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {users !== null && !compact && (
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Joined</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin__name">{user.username}</div>
                      {user.displayName && <div className="admin__hint">{user.displayName}</div>}
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <span className={`chip chip--${user.role === "admin" ? "admin" : user.status}`}>
                        {statusLabel(user)}
                      </span>
                    </td>
                    <td className="admin__actions">
                      {user.role !== "admin" && (
                        <>
                          <button type="button" className="button" disabled={busy} onClick={() => setPendingReset(user)}>
                            Reset password
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => void run(() => setUserLocked(user.id, user.status !== "locked"))}
                          >
                            {user.status === "locked" ? "Unlock" : "Lock"}
                          </button>
                          <button
                            type="button"
                            className="button button--danger"
                            disabled={busy}
                            onClick={() => setPendingDelete(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {detailsUser && (
        <Modal onClose={() => setDetailsId(null)}>
          <div className="dialog" role="dialog" aria-labelledby="user-details-title" onClick={(event) => event.stopPropagation()}>
            <div className="user-details__head">
              <div>
                <h2 id="user-details-title" className="dialog__title">
                  {detailsUser.username}
                </h2>
                {detailsUser.displayName && <div className="admin__hint">{detailsUser.displayName}</div>}
              </div>
              <span className={`chip chip--${detailsUser.role === "admin" ? "admin" : detailsUser.status}`}>
                {statusLabel(detailsUser)}
              </span>
            </div>
            <dl className="user-details__facts">
              <div>
                <dt>Joined</dt>
                <dd>{formatDate(detailsUser.createdAt)}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{formatDate(detailsUser.lastLoginAt)}</dd>
              </div>
            </dl>
            {detailsUser.role === "admin" ? (
              <p className="dialog__text">Administrator accounts can't be locked, reset or deleted from here.</p>
            ) : (
              <div className="user-details__actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setDetailsId(null);
                    setPendingReset(detailsUser);
                  }}
                >
                  Reset password
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void run(() => setUserLocked(detailsUser.id, detailsUser.status !== "locked"))}
                >
                  {detailsUser.status === "locked" ? "Unlock account" : "Lock account"}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => {
                    setDetailsId(null);
                    setPendingDelete(detailsUser);
                  }}
                >
                  Delete account…
                </button>
              </div>
            )}
            <div className="dialog__buttons">
              <button type="button" className="button" onClick={() => setDetailsId(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingReset && (
        <Modal onClose={closeResetDialog}>
          <form
            className="dialog"
            role="dialog"
            aria-labelledby="reset-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const target = pendingReset;
              const password = resetPassword;
              closeResetDialog();
              void run(() => resetUserPassword(target.id, password));
            }}
          >
            <h2 id="reset-title" className="dialog__title">
              Reset password for {pendingReset.username}
            </h2>
            <p className="dialog__text">
              Choose a new password and pass it to them. They'll be signed out everywhere and can change it themselves
              afterwards.
            </p>
            <input
              className="input"
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="New password (10+ characters)"
              aria-label="New password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              autoFocus
              required
            />
            <div className="dialog__buttons">
              <button type="button" className="button" onClick={closeResetDialog}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={resetPassword.length < MIN_PASSWORD_LENGTH}>
                Reset password
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <Modal onClose={closeDeleteDialog}>
          <div
            className="dialog"
            role="alertdialog"
            aria-labelledby="delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-title" className="dialog__title">
              Delete {pendingDelete.username}?
            </h2>
            <p className="dialog__text">
              They will be signed out and lose access immediately. This can't be undone.
            </p>
            <label className="admin__toggle">
              <input type="checkbox" checked={deletePhotos} onChange={(event) => setDeletePhotos(event.target.checked)} />
              <span>
                <strong>Also permanently delete their photos</strong>
                <span className="admin__hint">
                  {deletePhotos
                    ? `Everything in "${pendingDelete.username}" will be erased.`
                    : `Their photos are kept on disk in a hidden folder (.deleted-${pendingDelete.username}-…).`}
                </span>
              </span>
            </label>
            <div className="dialog__buttons">
              <button type="button" className="button" onClick={closeDeleteDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={busy}
                onClick={() => {
                  const target = pendingDelete;
                  const erase = deletePhotos;
                  closeDeleteDialog();
                  void run(() => deleteUser(target.id, erase));
                }}
              >
                {deletePhotos ? "Delete account and photos" : "Delete account"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
