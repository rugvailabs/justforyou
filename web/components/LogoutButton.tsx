"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ds/primitives";

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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={signOut}
      disabled={busy || isPending}
    >
      {busy || isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
