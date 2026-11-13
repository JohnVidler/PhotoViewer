import { useState, type FormEvent } from "react";
import { changePassword } from "../api";
import Modal from "./Modal";

interface ChangePasswordDialogProps {
  onClose: () => void;
  /** Called once the password has been changed successfully. */
  onChanged?: () => void;
}

const MIN_PASSWORD_LENGTH = 10;

export default function ChangePasswordDialog({ onClose, onChanged }: ChangePasswordDialogProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
      onChanged?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-labelledby="password-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2 id="password-title" className="dialog__title">
          Change password
        </h2>

        {done ? (
          <>
            <p className="dialog__text">Your password has been changed. Other devices have been signed out.</p>
            <div className="dialog__buttons">
              <button type="button" className="button button--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              className="input"
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              placeholder="Current password"
              aria-label="Current password"
              autoComplete="current-password"
              autoFocus
              required
            />
            <input
              className="input"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              placeholder="New password"
              aria-label="New password"
              autoComplete="new-password"
              required
            />
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirm new password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              required
            />
            {error && (
              <p className="auth-card__error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog__buttons">
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={busy}>
                Change password
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
