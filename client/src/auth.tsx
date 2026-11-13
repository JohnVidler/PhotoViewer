import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchAuthStatus, signOut as requestSignOut, UNAUTHORIZED_EVENT } from "./api";
import type { AuthStatus } from "./types";

interface AuthContextValue {
  status: AuthStatus | null;
  error: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchAuthStatus());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    await requestSignOut();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    // A 401 from any API call means the session ended; re-check so the login screen appears.
    window.addEventListener(UNAUTHORIZED_EVENT, refresh);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, refresh);
  }, [refresh]);

  const value = useMemo(() => ({ status, error, refresh, signOut }), [status, error, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
