"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      // Honour ?next= set by middleware, but only for in-app paths.
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Sign in</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">Password</span>
          <input
            type="password"
            required
            value={form.password}
            onChange={set("password")}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        {error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        No account yet?{" "}
        <Link href="/signup" className="underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
