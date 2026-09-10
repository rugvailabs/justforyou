"use client";

/**
 * The four category cards beside the slider.
 *
 * The fourth has no href, and that is expressed by rendering a <div> rather
 * than an <a> - not by an anchor with a missing href or a preventDefault on
 * the click. An anchor without an href is still announced as a link and still
 * takes focus, which is precisely the promise this card must not make.
 *
 * The three real ones point at /[province]/[city]/[category], which exists.
 * Styling is shared between both cases so the placeholder sits in the row
 * without looking broken - only the interactive affordances differ.
 */

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/cn";
import type { HeroCard } from "@/components/HeroBanner/hero-content";

const CARD_BASE =
  "flex w-[15rem] shrink-0 flex-col overflow-hidden rounded-card border border-line " +
  "bg-surface shadow-raised sm:w-auto";

export default function HeroCards({
  cards,
  onCardClick,
}: {
  cards: readonly HeroCard[];
  onCardClick: (title: string) => void;
}): JSX.Element {
  return (
    <ul
      className={cn(
        // Under 600px this is a scroll-snapping row; the parent grid switches
        // it to a 2x2 block above that. See HeroBanner for the breakpoints.
        "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "min-[600px]:grid min-[600px]:grid-cols-2 min-[600px]:overflow-visible",
      )}
    >
      {cards.map((card) => {
        const body = (
          <>
            <div className="relative h-20 w-full shrink-0 bg-surface-muted">
              <Image
                src={card.image.src}
                alt={card.image.alt}
                fill
                unoptimized
                sizes="15rem"
                className="object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 p-3">
              <span className="text-card-title text-ink">{card.title}</span>
              <span className="text-meta text-ink-subtle">{card.blurb}</span>
            </div>
          </>
        );

        return (
          <li key={card.id} className="snap-start">
            {card.href !== undefined ? (
              <Link
                href={card.href}
                onClick={() => onCardClick(card.title)}
                className={cn(
                  CARD_BASE,
                  "h-full transition-colors hover:border-brand-300 hover:bg-brand-50",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-ring",
                )}
              >
                {body}
              </Link>
            ) : (
              <div
                className={cn(CARD_BASE, "h-full cursor-default bg-surface-muted")}
                // Not a link, not a button, not focusable. It is a label.
                aria-disabled="true"
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
