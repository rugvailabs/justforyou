/**
 * /dashboard - protected. Middleware turns away anyone without a live cookie;
 * requireUser() then confirms with the backend before anything renders.
 */

import Link from "next/link";

import { requireUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<JSX.Element> {
  const user = await requireUser("/dashboard");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Signed in as <strong>{user.name}</strong> ({user.email})
      </p>

      <dl className="mt-6 space-y-1 text-sm text-slate-700">
        <div>
          <dt className="inline font-medium">User id: </dt>
          <dd className="inline">{user.id}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Preferred contact: </dt>
          <dd className="inline">{user.preferred_contact_method}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Admin: </dt>
          <dd className="inline">{user.is_admin ? "yes" : "no"}</dd>
        </div>
      </dl>

      <div className="mt-8 flex gap-3">
        <Link href="/" className="text-sm underline">
          Home
        </Link>
        <LogoutButton />
      </div>
    </main>
  );
}
