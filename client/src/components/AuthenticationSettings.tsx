import { useState } from "react";
import { useAuth } from "../auth";
import ChangePasswordDialog from "./ChangePasswordDialog";

interface AuthenticationSettingsProps {
  onOpenSidebar: () => void;
}

export default function AuthenticationSettings({ onOpenSidebar }: AuthenticationSettingsProps) {
  const { status } = useAuth();
  const user = status?.user ?? null;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [changed, setChanged] = useState(false);

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
                <strong>Signed in as {user.username}</strong>
                <span className="admin__hint">{user.role === "admin" ? "Administrator" : "Member"}</span>
              </div>
            </div>
          </section>
        )}

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
