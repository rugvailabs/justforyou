"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Clears the session cookies via the session route, then refreshes. */
export default function LogoutButton(): JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy || isPending}
      className="rounded border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
    >
      {busy || isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
