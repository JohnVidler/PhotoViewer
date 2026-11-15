import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createInviteLink, enablePublicLink, fetchShares, removeInviteLink, removeShare, setSharePermission, shareWithUser } from "../api";
import { baseName } from "../hooks/itemActions";
import type { ShareState } from "../types";
import Modal from "./Modal";

interface ShareDialogProps {
  /** Path of one of the user's own albums. */
  path: string;
  onClose: () => void;
}

/**
 * Sharing settings for one album. Only the owner ever sees this: people an album is shared with can't change who
 * else has access, or their own permission.
 */
export default function ShareDialog({ path, onClose }: ShareDialogProps) {
  const [state, setState] = useState<ShareState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [confirmingPublic, setConfirmingPublic] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteWrite, setInviteWrite] = useState(false);
  const [inviteUses, setInviteUses] = useState("5");

  const name = baseName(path);

  const load = useCallback(async () => {
    try {
      setState(await fetchShares(path));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  // Runs a change, then reloads so the dialog always shows what the server has.
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (await run(() => shareWithUser(path, username, canWrite))) {
      setUsername("");
    }
  }

  const usesNumber = Number(inviteUses);
  const usesValid = Number.isInteger(usesNumber) && usesNumber >= 1 && usesNumber <= 1000;

  const publicUrl = state?.public ? `${window.location.origin}/.public/${state.public.token}` : "";

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be blocked (plain HTTP, permissions); the link is selectable in the box instead.
    }
  }

  return (
    <Modal onClose={onClose}>
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-labelledby="share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="share-title" className="dialog__title">
          Share “{name}”
        </h2>
        <p className="dialog__text">
          Sharing gives access to this album and everything in it. The photos stay where they are: there is only ever
          one copy, so changes made by anyone with edit access appear in your album too.
        </p>

        {loadError && <p className="auth-card__error">Could not load the sharing settings.</p>}
        {error && (
          <p className="auth-card__error" role="alert">
            {error}
          </p>
        )}

        <section className="share__section" aria-labelledby="share-people">
          <h3 id="share-people" className="share__heading">
            People
          </h3>

          {state && state.users.length === 0 && <p className="admin__hint">Not shared with anyone yet.</p>}
          {state?.users.map((person) => (
            <div key={person.id} className="share__row">
              <span className="share__who">{person.label}</span>
              <select
                className="input share__select"
                value={person.canWrite ? "write" : "read"}
                disabled={busy}
                aria-label={`What ${person.label} can do`}
                onChange={(event) => void run(() => setSharePermission(person.id, event.target.value === "write"))}
              >
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
              </select>
              <button type="button" className="button button--danger" disabled={busy} onClick={() => void run(() => removeShare(person.id))}>
                Remove
              </button>
            </div>
          ))}

          <form className="share__row share__add" onSubmit={(event) => void addPerson(event)}>
            <input
              className="input share__who"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              aria-label="Username to share with"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <select
              className="input share__select"
              value={canWrite ? "write" : "read"}
              aria-label="What they can do"
              onChange={(event) => setCanWrite(event.target.value === "write")}
            >
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
            </select>
            <button type="submit" className="button button--primary" disabled={busy || username.trim() === ""}>
              Share
            </button>
          </form>
          <p className="admin__hint">
            <strong>Can view</strong>: browse, download, and copy photos into their own library.{" "}
            <strong>Can edit</strong>: also upload, create albums, and move, rename and delete things in this album. Only
            you can change these settings.
          </p>
        </section>

        <section className="share__section" aria-labelledby="share-invite">
          <h3 id="share-invite" className="share__heading">
            Invite link
          </h3>
          <p className="admin__hint">
            Whoever opens the link signs in or creates an account, and the album is added to that account. The link
            stops working once it has been used the number of times you choose.
          </p>

          {state?.invites.map((invite) => {
            const url = `${window.location.origin}/.invite/${invite.token}`;
            const used = invite.uses >= invite.maxUses;
            return (
              <div key={invite.id} className="share__invite">
                <div className="share__row">
                  <input
                    className="input share__who"
                    value={url}
                    readOnly
                    aria-label="Invite link"
                    onFocus={(event) => event.target.select()}
                  />
                  <button type="button" className="button" onClick={() => void copyLink(url)}>
                    {copied === url ? "Copied" : "Copy"}
                  </button>
                  <button type="button" className="button button--danger" disabled={busy} onClick={() => void run(() => removeInviteLink(invite.id))}>
                    Delete
                  </button>
                </div>
                <p className="admin__hint">
                  {invite.canWrite ? "Can edit" : "Can view"} · {invite.uses} of {invite.maxUses} uses
                  {used ? " · used up, no new people can join" : ""}
                </p>
              </div>
            );
          })}

          <form
            className="share__row share__add"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => createInviteLink(path, inviteWrite, usesNumber));
            }}
          >
            <input
              className="input share__select"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={inviteUses}
              onChange={(event) => setInviteUses(event.target.value)}
              aria-label="How many times the link can be used"
              style={{ width: "5.5rem" }}
            />
            <span className="admin__hint">uses</span>
            <select
              className="input share__select"
              value={inviteWrite ? "write" : "read"}
              aria-label="What people who use the link can do"
              onChange={(event) => setInviteWrite(event.target.value === "write")}
            >
              <option value="read">Can view</option>
              <option value="write">Can edit</option>
            </select>
            <button type="submit" className="button button--primary" disabled={busy || !usesValid}>
              Create invite link
            </button>
          </form>
        </section>

        <section className="share__section" aria-labelledby="share-public">
          <h3 id="share-public" className="share__heading">
            Public link
          </h3>

          {state && !state.public && !confirmingPublic && (
            <>
              <p className="admin__hint">Anyone with the link can view this album, with or without an account.</p>
              <div>
                <button type="button" className="button" disabled={busy} onClick={() => setConfirmingPublic(true)}>
                  Share publicly…
                </button>
              </div>
            </>
          )}

          {state && !state.public && confirmingPublic && (
            <div className="share__warning" role="alert">
              <strong>Anyone with the link will be able to see this album.</strong>
              <p>
                Everyone who has the link, whether or not they have an account here, can see every photo in “{name}” and
                its sub-albums, and download full-size copies, including details stored inside the photos such as where
                they were taken. They can’t change anything.
              </p>
              <p>
                Anyone you give the link to can pass it on, so only use it for photos you’re happy to make public. You can
                switch the link off at any time, which stops it working straight away.
              </p>
              <div className="dialog__buttons">
                <button type="button" className="button" onClick={() => setConfirmingPublic(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => void run(() => enablePublicLink(path)).then(() => setConfirmingPublic(false))}
                >
                  I understand, share publicly
                </button>
              </div>
            </div>
          )}

          {state?.public && (
            <>
              <p className="share__warning share__warning--on">
                This album is public. Anyone with this link can view it.
              </p>
              <div className="share__row">
                <input
                  className="input share__who"
                  value={publicUrl}
                  readOnly
                  aria-label="Public link"
                  onFocus={(event) => event.target.select()}
                />
                <button type="button" className="button" onClick={() => void copyLink(publicUrl)}>
                  {copied === publicUrl ? "Copied" : "Copy"}
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => void run(() => removeShare(state.public!.id))}
                >
                  Stop sharing publicly
                </button>
              </div>
            </>
          )}
        </section>

        <div className="dialog__buttons">
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
