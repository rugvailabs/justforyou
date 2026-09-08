"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(form);
      router.push("/consent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Create your account</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Name</span>
          <input
            type="text"
            required
            value={form.name}
            onChange={set("name")}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

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
            minLength={8}
            maxLength={72}
            value={form.password}
            onChange={set("password")}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">At least 8 characters.</span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-gray-700">
            Phone <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <input
            type="tel"
            value={form.phone}
            onChange={set("phone")}
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
