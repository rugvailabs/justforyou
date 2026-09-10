/**
 * /contact - customer care, feedback and bug reports in one place.
 *
 * The form is a client island inside a Suspense boundary, because it reads
 * ?kind= with useSearchParams and that opts the whole route into client-side
 * rendering otherwise.
 */

import type { Metadata } from "next";
import { Suspense } from "react";

import Prose from "@/components/ds/Prose";
import SupportForm from "@/components/ds/SupportForm";
import { Skeleton } from "@/components/ds/feedback";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Ask a question, send feedback, or report a bug. We reply by email.",
};

export default function ContactPage(): JSX.Element {
  return (
    <Prose
      title="Contact us"
      lede="A question, something you think we got wrong, or something plainly broken - all three land in the same place."
      updated="2026-09-10"
    >
      <p>
        We reply by email to the address you give. There is no phone line: this
        is a small team, and an unanswered number would be worse than not
        offering one.
      </p>

      <p>
        <strong>Chasing a business, not us?</strong> If you are waiting on a
        quote or a callback, contact the business from its own listing - the
        enquiry goes straight to the owner&apos;s inbox. We cannot answer for
        them or make them reply.
      </p>

      <div className="not-prose mt-6">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
          <SupportForm />
        </Suspense>
      </div>
    </Prose>
  );
}
