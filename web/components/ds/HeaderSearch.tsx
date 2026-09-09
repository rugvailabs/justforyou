"use client";

/**
 * The split What / Where search in the header.
 *
 * It submits to the real /search route with the real query parameters the
 * backend already understands - `q` and `city` - rather than a mock handler.
 * Anything blank is left out of the URL entirely: `?q=&city=` is a different
 * request from `?q=`, and the empty one would pin a filter nobody set.
 *
 * A plain <form method="get"> would submit `q=&city=` for empty fields and
 * cannot preserve the other filters the search page holds, so this builds the
 * URL and pushes it.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ds/primitives";
import { tFor, type Locale } from "@/lib/i18n";

export default function HeaderSearch({
  locale = "en",
}: {
  locale?: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();
  const params = useSearchParams();

  // Seeded from the URL so the header reflects the search you are looking at.
  const [what, setWhat] = useState(params.get("q") ?? "");
  const [where, setWhere] = useState(params.get("city") ?? "");

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const next = new URLSearchParams();
    const q = what.trim();
    const city = where.trim();
    if (q) next.set("q", q);
    if (city) next.set("city", city);
    const query = next.toString();
    router.push(query ? `/search?${query}` : "/search");
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="flex w-full items-stretch rounded-input border border-line-strong bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          value={what}
          onChange={(event) => setWhat(event.target.value)}
          placeholder={t("common.searchPlaceholderWhat")}
          aria-label={t("common.searchPlaceholderWhat")}
          className="h-10 w-full min-w-0 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <div className="hidden w-px shrink-0 bg-line sm:block" aria-hidden="true" />

      {/* Fixed width rather than an equal share: What is the field people
          type into, and an even split squeezed Where until its placeholder
          was cut off by the submit button. */}
      <div className="hidden min-w-0 shrink-0 items-center gap-2 px-3 sm:flex sm:w-52">
        <MapPin className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          value={where}
          onChange={(event) => setWhere(event.target.value)}
          placeholder={t("common.searchPlaceholderWhere")}
          aria-label={t("common.searchPlaceholderWhere")}
          className="h-10 w-full min-w-0 bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <Button type="submit" size="sm" className="m-1 shrink-0">
        <Search aria-hidden="true" />
        <span className="hidden sm:inline">{t("common.search")}</span>
        <span className="sr-only sm:hidden">{t("common.search")}</span>
      </Button>
    </form>
  );
}
