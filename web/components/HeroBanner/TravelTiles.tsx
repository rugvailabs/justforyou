"use client";

/**
 * The curated travel row.
 *
 * Reuses HeroCards rather than introducing a second tile component: the
 * scroll-snap row, the 2-up grid, the focus rings and the not-a-link case are
 * already solved there and solving them twice is how two implementations drift
 * apart. The only thing this adds is a heading and the honesty line under it.
 *
 * Five tiles, of which two are real. See TRAVEL_TILES for why the other three
 * are labelled rather than linked.
 */

import HeroCards from "@/components/HeroBanner/HeroCards";
import { trackHeroClick } from "@/components/HeroBanner/HeroBanner";
import { TRAVEL_TILES } from "@/components/HeroBanner/hero-content";

export default function TravelTiles(): JSX.Element {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6" aria-labelledby="travel-heading">
      <h2 id="travel-heading" className="text-section-heading text-ink">
        Travel &amp; getting around
      </h2>
      <p className="mt-1 text-meta text-ink-subtle">
        Hotels and car hire are listed today. Flights, buses and trains need a
        booking partner before they can be more than a label.
      </p>

      <div className="mt-3 min-[600px]:[&>ul]:grid-cols-3 min-[900px]:[&>ul]:grid-cols-5">
        <HeroCards
          cards={TRAVEL_TILES}
          onCardClick={(title) => trackHeroClick(`travel:${title}`)}
        />
      </div>
    </section>
  );
}
