import { useState, type FormEvent } from "react";
import { setDisplayName } from "../api";
import { useAuth } from "../auth";
import ChangePasswordDialog from "./ChangePasswordDialog";

interface AuthenticationSettingsProps {
  onOpenSidebar: () => void;
}

export default function AuthenticationSettings({ onOpenSidebar }: AuthenticationSettingsProps) {
  const { status, refresh } = useAuth();
  const user = status?.user ?? null;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Edits live in `name` until saved; until the first edit the box shows the saved value.
  const nameValue = name ?? user?.displayName ?? "";

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setNameMessage(null);
    try {
      await setDisplayName(nameValue);
      await refresh();
      setName(null);
      setNameMessage({ text: nameValue.trim() === "" ? "Your display name was removed." : "Your display name was saved.", error: false });
    } catch (failure) {
      setNameMessage({ text: failure instanceof Error ? failure.message : "That didn't work.", error: true });
    } finally {
      setSavingName(false);
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
          <h1 className="page__title">Authentication</h1>
          <nav className="breadcrumbs" aria-label="Settings path">
            <span>Settings</span>
            <span className="breadcrumbs__separator">/</span>
            <span className="breadcrumbs__current">Authentication</span>
          </nav>
        </div>
      </header>

      <main>
        {user && (
          <section className="admin__card settings-card">
            <div className="settings-card__row">
              <div>
                <strong>Signed in as {user.displayName ?? user.username}</strong>
                <span className="admin__hint">
                  {user.displayName ? `@${user.username} · ` : ""}
                  {user.role === "admin" ? "Administrator" : "Member"}
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="admin__card settings-card">
          <form className="settings-card__row" onSubmit={(event) => void saveName(event)}>
            <div>
              <strong>Display name</strong>
              <span className="admin__hint">
                Shown to people you share albums with, next to your username. Leave it empty to show just your username.
              </span>
              {nameMessage && (
                <span className={nameMessage.error ? "auth-card__error" : "settings-card__success"} role={nameMessage.error ? "alert" : "status"}>
                  {nameMessage.text}
                </span>
              )}
            </div>
            <div className="share__row">
              <input
                className="input"
                value={nameValue}
                onChange={(event) => setName(event.target.value)}
                placeholder={user?.username ?? "Display name"}
                aria-label="Display name"
                maxLength={50}
                autoComplete="nickname"
              />
              <button type="submit" className="button" disabled={savingName || nameValue.trim() === (user?.displayName ?? "")}>
                Save
              </button>
            </div>
          </form>
        </section>

        <section className="admin__card settings-card">
          <div className="settings-card__row">
            <div>
              <strong>Password</strong>
              <span className="admin__hint">
                Change the password you sign in with. Your other devices will be signed out.
              </span>
              {changed && <span className="settings-card__success">Your password was changed.</span>}
            </div>
            <button type="button" className="button" onClick={() => setPasswordOpen(true)}>
              Change password
            </button>
          </div>
        </section>
      </main>

      {passwordOpen && (
        <ChangePasswordDialog
          onClose={() => setPasswordOpen(false)}
          onChanged={() => setChanged(true)}
        />
      )}
    </div>
  );
}
