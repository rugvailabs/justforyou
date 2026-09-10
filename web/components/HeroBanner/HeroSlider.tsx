"use client";

/**
 * The sliding half of the hero. Presentational: every piece of state it needs
 * is passed in, and every interaction is reported up to HeroBanner, which owns
 * the timer and the current index.
 *
 * The mechanism is a flex row of full-width slides translated by
 * -index * 100%. That keeps all three in the DOM and in one paint layer, so
 * moving between them is a single compositor transform rather than a mount.
 *
 * Drag is handled through pointer events, one code path for mouse, touch and
 * pen, rather than the usual pair of touchstart/mousedown handlers that drift
 * apart. setPointerCapture is what makes a drag that leaves the element still
 * end correctly.
 */

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import {
  SLIDE_TRANSITION_MS,
  type HeroSlide,
} from "@/components/HeroBanner/hero-content";

/** Past this many pixels, a pointer gesture counts as a swipe, not a click. */
const SWIPE_THRESHOLD_PX = 50;

export default function HeroSlider({
  slides,
  current,
  animate,
  onSelect,
  onNext,
  onPrevious,
  onSlideClick,
}: {
  slides: readonly HeroSlide[];
  current: number;
  /** False under prefers-reduced-motion: slides swap rather than travel. */
  animate: boolean;
  onSelect: (index: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onSlideClick: (index: number) => void;
}): JSX.Element {
  const dragStart = useRef<number | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    // Ignore secondary buttons, and let a real click on the CTA through.
    if (event.button !== 0) return;
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;

    const travelled = event.clientX - start;
    if (Math.abs(travelled) < SWIPE_THRESHOLD_PX) return;
    if (travelled < 0) onNext();
    else onPrevious();
  }

  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-card border border-line bg-brand-700"
      // The carousel semantics live here, on the thing that actually rotates.
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotions"
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(-${current * 100}%)`,
          transition: animate ? `transform ${SLIDE_TRANSITION_MS}ms ease` : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
      >
        {slides.map((slide, index) => {
          const active = index === current;
          return (
            <div
              key={slide.id}
              className="relative h-full w-full shrink-0"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}`}
              // A slide that is off-screen is still in the DOM; hiding it from
              // the accessibility tree keeps a screen reader on the one shown.
              aria-hidden={!active}
            >
              <Image
                src={slide.image.src}
                alt={slide.image.alt}
                fill
                // SVG artwork: served as-is rather than through the optimiser,
                // which both avoids needing dangerouslyAllowSVG and is the
                // right call for vectors, where there is nothing to resize.
                unoptimized
                // The first slide is the LCP element on this page.
                priority={index === 0}
                sizes="(max-width: 1100px) 100vw, 60vw"
                className="object-cover"
              />

              <div className="relative flex h-full flex-col justify-center gap-3 p-6 sm:p-10">
                <h2 className="max-w-lg text-balance text-[1.5rem] font-bold leading-tight text-ink-inverse sm:text-[2rem]">
                  {slide.headline}
                </h2>
                <p className="max-w-md text-pretty text-body text-brand-100">
                  {slide.subhead}
                </p>
                <div>
                  <Button
                    asChild
                    variant="secondary"
                    // Off-screen slides must not be tab stops.
                    tabIndex={active ? undefined : -1}
                  >
                    <Link
                      href={slide.cta.href}
                      onClick={() => onSlideClick(index)}
                      // A drag that ends on the CTA should not also navigate.
                      draggable={false}
                    >
                      {slide.cta.label}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- arrows --------------------------------------------------- */}
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous slide"
        className={cn(
          "absolute left-2 top-1/2 -translate-y-1/2 rounded-pill bg-surface/90 p-2",
          "text-ink shadow-raised transition-colors hover:bg-surface",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          "focus-visible:outline-ring",
        )}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next slide"
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 rounded-pill bg-surface/90 p-2",
          "text-ink shadow-raised transition-colors hover:bg-surface",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          "focus-visible:outline-ring",
        )}
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>

      {/* --- dots ----------------------------------------------------- */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === current ? "true" : undefined}
            className={cn(
              "h-2 rounded-pill transition-all",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              "focus-visible:outline-ring",
              index === current
                ? "w-6 bg-ink-inverse"
                : "w-2 bg-ink-inverse/50 hover:bg-ink-inverse/80",
            )}
          />
        ))}
      </div>
    </div>
  );
}
