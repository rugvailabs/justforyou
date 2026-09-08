"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  apiGet,
  apiPost,
  type TokenResponse,
  type UserResponse,
} from "@/lib/api";

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  user: UserResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<UserResponse>;
  signup: (input: SignupInput) => Promise<UserResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<UserResponse | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Load the current user, or null when nobody is signed in.
 *
 * Deliberately free of setState so it can be awaited inside an effect without
 * tripping React's set-state-in-effect rule.
 */
async function fetchMe(): Promise<UserResponse | null> {
  try {
    return await apiGet<UserResponse>("/me");
  } catch (err) {
    // A 401 just means "not signed in", which is not an error worth logging.
    if (!(err instanceof ApiError) || !err.isUnauthorized) {
      console.error("Failed to load the current user", err);
    }
    return null;
  }
}

/**
 * Hand the JWT to a route handler so it can be stored as an httpOnly cookie.
 * Client code cannot set httpOnly cookies itself.
 */
async function persistToken(token: string): Promise<void> {
  const res = await fetch("/api/auth/set-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Could not store the session cookie");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      setUser(me);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (): Promise<UserResponse | null> => {
    const me = await fetchMe();
    setUser(me);
    return me;
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<UserResponse> => {
      const { access_token } = await apiPost<TokenResponse>("/login", {
        email,
        password,
      });
      await persistToken(access_token);
      const me = await apiGet<UserResponse>("/me");
      setUser(me);
      return me;
    },
    [],
  );

  const signup = useCallback(async (input: SignupInput): Promise<UserResponse> => {
    const { access_token } = await apiPost<TokenResponse>("/signup", {
      name: input.name,
      email: input.email,
      password: input.password,
      phone: input.phone?.trim() ? input.phone.trim() : null,
    });
    await persistToken(access_token);
    const me = await apiGet<UserResponse>("/me");
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await fetch("/api/auth/clear-token", {
      method: "POST",
      credentials: "same-origin",
    });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, signup, logout, refresh }),
    [user, isLoading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an <AuthProvider>");
  return ctx;
}
