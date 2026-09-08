/**
 * Who is signed in, for the whole app.
 *
 * The web app has no equivalent of this file: there, every request carries the
 * session cookie and each server component asks for the user it needs. A phone
 * app is one long-lived process, so the session is held once, in memory, and
 * the token that backs it lives in the keystore between launches.
 *
 * `role` matters beyond display: the tab bar grows a Business tab for an owner,
 * and it must not flash into existence after the first render, so the app shows
 * a splash until the stored token has been checked against /me.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError, getMe, setUnauthorizedHandler } from "./api";
import { clearToken, getToken, setToken } from "./tokenStore";
import type { UserResponse } from "./types";

type Status = "loading" | "signedOut" | "signedIn";

interface Session {
  status: Status;
  user: UserResponse | null;
  /** True for role "business_owner". Admins moderate on the web, not here. */
  isOwner: boolean;
  /** Store the token, fetch the user, and flip the tab bar. */
  signIn: (accessToken: string) => Promise<UserResponse>;
  signOut: () => Promise<void>;
  /** Re-read /me - after editing a profile, or pulling to refresh. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<UserResponse | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await clearToken();
    if (!mounted.current) return;
    setUser(null);
    setStatus("signedOut");
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const stored = await getToken();
    if (!stored) {
      if (mounted.current) {
        setUser(null);
        setStatus("signedOut");
      }
      return;
    }

    try {
      const me = await getMe(stored);
      if (!mounted.current) return;
      setUser(me);
      setStatus("signedIn");
    } catch (error) {
      // 401 means the stored token has expired - the usual case after a night
      // on the home screen. Anything else (no signal, backend down) leaves the
      // token alone: signing the user out because a train went into a tunnel
      // would be worse than showing them a retry.
      if (error instanceof ApiError && error.isUnauthorized) {
        await signOut();
        return;
      }
      if (mounted.current) setStatus("signedOut");
    }
  }, [signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any 401 from any screen lands here, so an expired token cannot leave the
  // UI showing owner tabs it can no longer load.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!mounted.current) return;
      setUser(null);
      setStatus("signedOut");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (accessToken: string): Promise<UserResponse> => {
    await setToken(accessToken);
    const me = await getMe(accessToken);
    if (mounted.current) {
      setUser(me);
      setStatus("signedIn");
    }
    return me;
  }, []);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      isOwner: user?.role === "business_owner",
      signIn,
      signOut,
      refresh: load,
    }),
    [status, user, signIn, signOut, load],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return session;
}
