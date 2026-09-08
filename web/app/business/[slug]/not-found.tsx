import Link from "next/link";

import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";

/** Rendered when notFound() fires for an unknown slug. */
export default function BusinessNotFound(): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-8">
        <Link href="/" className="text-lg font-semibold">
          JustDial CA
        </Link>
      </header>
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Listing not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          No business matches that address. It may have been removed, or the
          link may be mistyped.
        </p>
        <div className="mt-4 flex gap-2">
          <ButtonLink href="/search">Browse all listings</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
