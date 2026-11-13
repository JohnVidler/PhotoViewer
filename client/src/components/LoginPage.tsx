import { useState, type FormEvent } from "react";
import { logIn, register, setupAdmin } from "../api";
import { useAuth } from "../auth";
import type { AuthStatus } from "../types";

type Mode = "login" | "register";

interface LoginPageProps {
  status: AuthStatus;
}

const MIN_PASSWORD_LENGTH = 10;

export default function LoginPage({ status }: LoginPageProps) {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // First run is always a setup form; otherwise the visitor chooses between signing in and creating an account.
  const setup = status.setupRequired;
  const creating = setup || mode === "register";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (creating) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError("The two passwords don't match.");
        return;
      }
    }

    setBusy(true);
    try {
      if (setup) {
        await setupAdmin(username, password, setupCode);
      } else if (creating) {
        await register(username, password);
      } else {
        await logIn(username, password);
      }
      // The server set the session cookie; re-reading the status moves the app on to the library.
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
  }

  const heading = setup ? "Set up PhotoViewer" : creating ? "Create an account" : "Sign in";
  const blurb = setup
    ? "No accounts exist yet. Create the administrator account. You'll need the setup code printed in the server log."
    : creating
      ? "Choose a username and password. Your photos are kept in a private library only you can see."
      : "Sign in to browse and manage your photos.";

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <span className="sidebar__logo auth-card__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
            <circle cx="9" cy="10" r="1.75" fill="currentColor" />
            <path d="M4 17L9.5 12.5L13 15.5L16 13L20 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="auth-card__title">{heading}</h1>
        <p className="auth-card__blurb">{blurb}</p>

        <div className="auth-form">
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete={creating ? "new-password" : "current-password"}
            required
          />
          {creating && (
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Confirm password"
              aria-label="Confirm password"
              autoComplete="new-password"
              required
            />
          )}
          {setup && (
            <input
              className="input"
              value={setupCode}
              onChange={(event) => setSetupCode(event.target.value)}
              placeholder="Setup code"
              aria-label="Setup code"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}

          {error && (
            <p className="auth-card__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button button--primary auth-card__action" disabled={busy}>
            {setup ? "Create administrator account" : creating ? "Create account" : "Sign in"}
          </button>
        </div>

        {!setup && creating && (
          <button type="button" className="auth-card__switch" onClick={() => switchMode("login")}>
            Already have an account? Sign in
          </button>
        )}
        {!setup && !creating && status.signupsEnabled && (
          <button type="button" className="auth-card__switch" onClick={() => switchMode("register")}>
            New here? Create an account
          </button>
        )}
        {!setup && !creating && !status.signupsEnabled && (
          <p className="auth-card__note">New accounts are closed. Ask an administrator to add you.</p>
        )}
      </form>
    </div>
  );
}
