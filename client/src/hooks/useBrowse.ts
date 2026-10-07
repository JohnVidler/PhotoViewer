import { useEffect, useState } from "react";
import { fetchBrowse, subscribeToChanges } from "../api";
import type { BrowseResult } from "../types";

interface BrowseState {
  path: string;
  data: BrowseResult | null;
  error: string | null;
}

/**
 * Loads a folder listing and keeps it current: re-fetches in place (without returning
 * to the loading state) whenever the server reports the folder changed on disk.
 */
export function useBrowse(relPath: string): { data: BrowseResult | null; error: string | null } {
  const [state, setState] = useState<BrowseState>({ path: relPath, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let latestRequest = 0;

    function load() {
      const request = ++latestRequest;

      fetchBrowse(relPath)
        .then((data) => {
          if (!cancelled && request === latestRequest) {
            setState({ path: relPath, data, error: null });
          }
        })
        .catch(() => {
          if (!cancelled && request === latestRequest) {
            setState({ path: relPath, data: null, error: "Could not load this folder." });
          }
        });
    }

    load();

    const unsubscribe = subscribeToChanges((dirs) => {
      if (dirs.includes(relPath)) {
        load();
      }
    }, load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [relPath]);

  // Until the new folder arrives, don't show the previous folder's contents.
  return state.path === relPath ? state : { data: null, error: null };
}
