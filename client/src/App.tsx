import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import AdminPage from "./components/AdminPage";
import AuthenticationSettings from "./components/AuthenticationSettings";
import { ActionNotice } from "./components/DropStrips";
import BrowsePage from "./components/BrowsePage";
import LoginPage from "./components/LoginPage";
import Sidebar, { SETTINGS_ROUTE } from "./components/Sidebar";

export default function App() {
  const { status, error, refresh } = useAuth();
  const location = useLocation();
  const current = decodeURIComponent(location.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
  const publicPath = current.startsWith(".public/") ? current : null;

  if (error && !status) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__blurb">Could not reach the server.</p>
          <button type="button" className="button button--primary" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return <div className="state-message">Loading…</div>;
  }

  if (!status.user) {
    // Public links work without an account; everything else asks for sign-in.
    return publicPath ? <PublicView relPath={publicPath} /> : <LoginPage status={status} />;
  }

  return <Library isAdmin={status.user.role === "admin"} />;
}

function Library({ isAdmin }: { isAdmin: boolean }) {
  const location = useLocation();
  const relPath = decodeURIComponent(location.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Dot-prefixed names are hidden from the gallery, so settings routes can never collide with a real album.
  const isSettings = relPath === SETTINGS_ROUTE || relPath.startsWith(`${SETTINGS_ROUTE}/`);

  // On small screens the sidebar is a drawer; close it once the user navigates.
  useEffect(() => {
    setSidebarOpen(false);
  }, [relPath]);

  return (
    <div className="layout">
      <Sidebar currentPath={relPath} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="layout__content">
        {isSettings ? (
          <SettingsRoutes relPath={relPath} isAdmin={isAdmin} onOpenSidebar={() => setSidebarOpen(true)} />
        ) : (
          /* Keyed by folder so per-folder state (e.g. the open photo) resets on navigation. */
          <BrowsePage key={relPath} relPath={relPath} onOpenSidebar={() => setSidebarOpen(true)} />
        )}
      </div>
      <ActionNotice />
    </div>
  );
}

function SettingsRoutes({
  relPath,
  isAdmin,
  onOpenSidebar,
}: {
  relPath: string;
  isAdmin: boolean;
  onOpenSidebar: () => void;
}) {
  switch (relPath) {
    case `${SETTINGS_ROUTE}/authentication`:
      return <AuthenticationSettings onOpenSidebar={onOpenSidebar} />;
    case `${SETTINGS_ROUTE}/admin/users`:
      return isAdmin ? (
        <AdminPage onOpenSidebar={onOpenSidebar} />
      ) : (
        <div className="state-message state-message--error">You don't have access to this page.</div>
      );
    case SETTINGS_ROUTE:
    case `${SETTINGS_ROUTE}/admin`:
      return <Navigate to={`/${SETTINGS_ROUTE}/${relPath === SETTINGS_ROUTE ? "authentication" : "admin/users"}`} replace />;
    default:
      return <div className="state-message state-message--error">That settings page doesn't exist.</div>;
  }
}

/** What someone without an account sees at a public link: the shared album, read-only, with a way to sign in. */
function PublicView({ relPath }: { relPath: string }) {
  return (
    <div className="public-layout">
      <header className="public-bar">
        <span className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
              <circle cx="9" cy="10" r="1.75" fill="currentColor" />
              <path d="M4 17L9.5 12.5L13 15.5L16 13L20 16.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
          PhotoViewer
        </span>
        <a className="button" href="/">
          Sign in
        </a>
      </header>
      <div className="public-layout__content">
        <BrowsePage key={relPath} relPath={relPath} />
      </div>
      <ActionNotice />
    </div>
  );
}
