import { useEffect, useState } from "react";
import { fetchSharedWithMe, ITEMS_CHANGED_EVENT } from "../api";
import type { SharedFolder } from "../types";

/**
 * The albums other people have shared with the signed-in user. Refreshed when the window regains focus (a share may
 * have been added meanwhile) and after the user's own changes. Returns null until the first load.
 */
export function useSharedWithMe(enabled = true): SharedFolder[] | null {
  const [folders, setFolders] = useState<SharedFolder[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    function load() {
      fetchSharedWithMe()
        .then((next) => {
          if (!cancelled) {
            setFolders(next);
          }
        })
        .catch(() => undefined);
    }

    load();
    window.addEventListener("focus", load);
    window.addEventListener(ITEMS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener(ITEMS_CHANGED_EVENT, load);
    };
  }, [enabled]);

  return folders;
}
