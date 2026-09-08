/**
 * New listing. Server Component: it fetches the category list, then hands off
 * to the client form.
 */

import Link from "next/link";

import BusinessForm from "@/components/BusinessForm";
import { getCategories } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewListingPage(): Promise<JSX.Element> {
  await requireBusinessOwner("/dashboard/new-listing");
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to your listings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          List your business
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          New listings are reviewed before they appear in public search.
        </p>
      </header>
      <BusinessForm mode="create" categories={categories} />
    </div>
  );
}
