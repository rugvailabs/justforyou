"use client";

/**
 * The homepage search: What / Where, plus a real "near me".
 *
 * Larger sibling of HeaderSearch, and the same contract - it builds a real
 * /search URL with the parameters the backend already understands. "Near me"
 * adds `near=me`; the search page asks the browser for the position and applies
 * the radius (see NearMeLocator). Typing "plumber near
 * me" into What does the same.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";

import { Button } from "@/components/ds/primitives";
import { tFor, type Locale } from "@/lib/i18n";

export default function HeroSearch({
  locale = "en",
  /** Shown under the field as a hint - the seed's centre of gravity. */
  cityPlaceholder = "Vancouver",
}: {
  locale?: Locale;
  cityPlaceholder?: string;
}): JSX.Element {
  const t = tFor(locale);
  const router = useRouter();

  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");

  function buildUrl(extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    if (what.trim()) params.set("q", what.trim());
    if (where.trim()) params.set("city", where.trim());
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    router.push(buildUrl());
  }

  // The position itself is asked for on /search (NearMeLocator), so every
  // near-me entry point shares one permission flow and one error message.
  function searchNearMe(): void {
    router.push(buildUrl({ near: "me" }));
  }

  return (
    <div>
      <form
        onSubmit={onSubmit}
        role="search"
        className="flex flex-col gap-2 rounded-card border border-line-strong bg-surface p-2 shadow-raised sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search className="size-5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <input
            value={what}
            onChange={(event) => setWhat(event.target.value)}
            placeholder={t("common.searchPlaceholderWhat")}
            aria-label={t("common.searchPlaceholderWhat")}
            className="h-11 w-full min-w-0 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>

        <div className="h-px w-full bg-line sm:h-8 sm:w-px" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:max-w-[16rem]">
          <MapPin className="size-5 shrink-0 text-ink-subtle" aria-hidden="true" />
          <input
            value={where}
            onChange={(event) => setWhere(event.target.value)}
            placeholder={cityPlaceholder}
            aria-label={t("common.searchPlaceholderWhere")}
            className="h-11 w-full min-w-0 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={searchNearMe}
            className="flex-1 sm:flex-none"
          >
            <LocateFixed aria-hidden="true" />
            {t("common.nearMe")}
          </Button>
          <Button type="submit" size="lg" className="flex-1 sm:flex-none">
            {t("common.search")}
          </Button>
        </div>
      </form>
    </div>
  );
}
