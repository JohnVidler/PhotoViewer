import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import BrowsePage from "./components/BrowsePage";
import Sidebar from "./components/Sidebar";

export default function App() {
  const location = useLocation();
  const relPath = decodeURIComponent(location.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // On small screens the sidebar is a drawer; close it once the user navigates.
  useEffect(() => {
    setSidebarOpen(false);
  }, [relPath]);

  return (
    <div className="layout">
      <Sidebar currentPath={relPath} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="layout__content">
        {/* Keyed by folder so per-folder state (e.g. the open photo) resets on navigation. */}
        <BrowsePage key={relPath} relPath={relPath} onOpenSidebar={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
}
