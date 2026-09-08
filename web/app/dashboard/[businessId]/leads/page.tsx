/**
 * Leads inbox for one listing.
 *
 * This is where the click-to-call tracking on the public page becomes worth
 * something: every reveal of the phone number shows up here as a lead.
 *
 * Ownership is enforced by the backend (403 for somebody else's listing). The
 * page turns that into a redirect rather than a crash.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getEnquiries, getMyBusiness } from "@/lib/api";
import { requireBusinessOwner } from "@/lib/auth";
import type { BusinessDetail, EnquiryOut, EnquiryType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<EnquiryType, string> = {
  call_click: "Call",
  callback: "Callback",
  quote: "Quote",
  chat: "Chat",
};

const TYPE_STYLES: Record<EnquiryType, string> = {
  call_click: "bg-sky-50 text-sky-700 ring-sky-200",
  callback: "bg-amber-50 text-amber-800 ring-amber-200",
  quote: "bg-violet-50 text-violet-700 ring-violet-200",
  chat: "bg-slate-100 text-slate-700 ring-slate-200",
};

/** Absolute timestamp - an owner chasing a lead needs the date, not "2h ago". */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default async function LeadsPage({
  params,
}: {
  params: { businessId: string };
}): Promise<JSX.Element> {
  await requireBusinessOwner(`/dashboard/${params.businessId}/leads`);

  const businessId = Number(params.businessId);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  let listing: BusinessDetail;
  let leads: EnquiryOut[];
  try {
    // Sequential rather than parallel: if the ownership check fails there is
    // no point having fetched the leads.
    listing = await getMyBusiness(businessId);
    leads = await getEnquiries(businessId, { limit: 100 });
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      redirect("/dashboard?error=forbidden");
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const callClicks = leads.filter((l) => l.enquiry_type === "call_click").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm underline">
          ← Back to your listings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Leads for {listing.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {leads.length === 0
            ? "No enquiries yet."
            : `${leads.length} ${leads.length === 1 ? "enquiry" : "enquiries"}` +
              (callClicks > 0
                ? ` · ${callClicks} phone ${callClicks === 1 ? "reveal" : "reveals"}`
                : "")}
        </p>
      </header>

      {leads.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">No enquiries yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            {listing.status === "approved"
              ? "When someone reveals your phone number or sends a request from your listing, it will appear here."
              : "This listing is not publicly visible yet, so customers cannot contact it."}
          </p>
          <div className="mt-4">
            <ButtonLink href="/dashboard" variant="secondary" size="sm">
              Back to listings
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Message</th>
                <th className="py-2 pr-4 font-medium">Contact</th>
                <th className="py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_STYLES[lead.enquiry_type]}`}
                    >
                      {TYPE_LABELS[lead.enquiry_type]}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {lead.message ?? (
                      <span className="text-slate-400">
                        {lead.enquiry_type === "call_click"
                          ? "Revealed your phone number"
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-slate-900">{lead.contact_name ?? "—"}</div>
                    {lead.contact_phone !== null ? (
                      <a
                        href={`tel:${lead.contact_phone.replace(/[^\d+]/g, "")}`}
                        className="text-slate-700 underline"
                      >
                        {lead.contact_phone}
                      </a>
                    ) : null}
                    {lead.contact_email !== null ? (
                      <div className="truncate text-slate-500">
                        {lead.contact_email}
                      </div>
                    ) : null}
                    {lead.user_id === null ? (
                      <div className="text-xs text-slate-400">Anonymous visitor</div>
                    ) : null}
                  </td>
                  <td className="py-3 whitespace-nowrap text-slate-600">
                    {formatWhen(lead.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
