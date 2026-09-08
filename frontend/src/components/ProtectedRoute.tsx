"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";

/**
 * Client-side guard for pages that need `user` loaded before they render.
 *
 * middleware.ts already blocks logged-out visitors before the page is served;
 * this is the second line, covering the case where the cookie exists but the
 * backend rejects it (revoked account, wrong signing key, clock skew).
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-gray-500">Redirecting to sign in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
