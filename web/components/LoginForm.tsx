"use client";

/**
 * Email + password sign-in / sign-up.
 *
 * The brief specified a phone -> OTP flow, but the backend has no OTP
 * endpoints (no /auth/otp/request, no /auth/otp/verify, and no "otp" anywhere
 * in the source). Auth is email + a bcrypt password via /login and /signup,
 * so that is what this drives.
 *
 * Credentials are posted to our own /api/auth/session route, which performs
 * the FastAPI exchange server-side and sets the httpOnly cookies. The browser
 * never sees the JWT.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { UserResponse } from "@/lib/types";

type Mode = "login" | "signup";

interface SessionSuccess {
  user: UserResponse;
}

export default function LoginForm({ next }: { next: string }): JSX.Element {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? {
                mode,
                name,
                email,
                password,
                phone: phone || null,
                role: isOwner ? "business_owner" : "customer",
              }
            : { mode, email, password },
        ),
      });

      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Sign-in failed (HTTP ${res.status}).`;
        setError(detail);
        return;
      }

      const user = (payload as SessionSuccess | null)?.user;
      // Land admins on /admin, everyone else on the requested page.
      const target = next || (user?.is_admin ? "/admin" : "/");

      // refresh() re-runs the Server Components so they see the new cookie.
      router.replace(target);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`rounded px-3 py-1 ${
            mode === "login" ? "bg-slate-900 text-white" : "border border-slate-300"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
          className={`rounded px-3 py-1 ${
            mode === "signup" ? "bg-slate-900 text-white" : "border border-slate-300"
          }`}
        >
          Create account
        </button>
      </div>

      {mode === "signup" ? (
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          type="password"
          required
          // The backend enforces 8-72 characters on signup.
          minLength={mode === "signup" ? 8 : undefined}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </label>

      {mode === "signup" ? (
        <label className="block">
          <span className="text-sm font-medium">
            Phone <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            type="tel"
            value={phone}
            maxLength={32}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
      ) : null}

      {mode === "signup" ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isOwner}
            onChange={(e) => setIsOwner(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-slate-700">
            I want to list a business
            <span className="block text-xs text-slate-500">
              Gives you access to the owner dashboard.
            </span>
          </span>
        </label>
      ) : null}

      {error !== null ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting
          ? "Working..."
          : mode === "signup"
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
