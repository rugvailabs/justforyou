/**
 * /admin - protected and admin-only.
 *
 * Middleware checks the cached role cookie; requireAdmin() then re-checks
 * is_admin against GET /api/v1/me, which is the value that actually counts.
 */

import Link from "next/link";

import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage(): Promise<JSX.Element> {
  const user = await requireAdmin("/admin");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-slate-600">
        Signed in as <strong>{user.name}</strong> - administrator.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm underline">
        Home
      </Link>
    </main>
  );
}
