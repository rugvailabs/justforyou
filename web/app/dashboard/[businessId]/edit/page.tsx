/**
 * Edit a listing.
 *
 * Ownership is enforced by the backend (403 for somebody else's listing, 404
 * for one that does not exist). This page's job is to turn those into
 * something sensible rather than a crash: both send the owner back to
 * /dashboard with a reason in the query string.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import BusinessForm from "@/components/BusinessForm";
import StatusBadge from "@/components/StatusBadge";
import { ApiError, getCategories, getMyBusiness } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type { BusinessDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  await requireBusinessOwner(`/dashboard/${params.businessId}/edit`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  try {
    listing = await getMyBusiness(businessId);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      // Somebody else's listing. Do not leak whether it exists.
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to your listings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {listing.name}
          </h1>
          <StatusBadge status={listing.status} showHint />
        </div>
      </header>
      <BusinessForm mode="edit" categories={categories} listing={listing} />
    </div>
  );
}
