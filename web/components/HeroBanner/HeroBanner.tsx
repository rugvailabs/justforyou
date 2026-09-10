"use client";

/**
 * Homepage hero: an auto-advancing promo slider beside four category cards.
 *
 * This component owns the index and the timer; HeroSlider and HeroCards are
 * presentational. Keeping the state in one place is what lets every pause
 * condition below be a single boolean rather than a timer that three different
 * handlers race to clear.
 *
 * AUTOPLAY STOPS in four situations, and each is a different kind of waste:
 *
 *   hover            the reader is looking at this slide
 *   tab hidden       nobody is looking at anything (visibilitychange)
 *   scrolled away    still rendered, still costing paints (IntersectionObserver)
 *   reduced motion   movement the reader has asked the OS not to show
 *
 * The first three pause. The fourth disables autoplay outright and turns the
 * transition off, so the arrows and dots still work but nothing ever moves on
 * its own - "reduce" is a request about motion, not about the interval.
 *
 * SSR: the first slide's markup renders on the server, so there is no flash of
 * empty content. Only the timer and the listeners are client-side.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import HeroCards from "@/components/HeroBanner/HeroCards";
import HeroSlider from "@/components/HeroBanner/HeroSlider";
import {
  HERO_CARDS,
  HERO_SLIDES,
  SLIDE_INTERVAL_MS,
} from "@/components/HeroBanner/hero-content";

/**
 * Analytics hook point.
 *
 * Deliberately a no-op beyond a log: wiring a real provider is a decision
 * about consent and vendors, not something to smuggle in behind a hero banner.
 * Everything a provider would need is already in the argument.
 */
export function trackHeroClick(target: string): void {
  // eslint-disable-next-line no-console
  console.log("[hero] click", target);
}

export default function HeroBanner(): JSX.Element {
  const slides = HERO_SLIDES;
  const [current, setCurrent] = useState(0);

  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const rootRef = useRef<HTMLElement>(null);

  /* --- reduced motion, watched rather than read once ------------------- */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (): void => setReducedMotion(query.matches);
    sync();
    // Toggling the OS setting takes effect without a reload.
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /* --- tab visibility --------------------------------------------------- */
  useEffect(() => {
    const sync = (): void => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /* --- scrolled out of view --------------------------------------------- */
  useEffect(() => {
    const node = rootRef.current;
    if (node === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      // Any sliver on screen counts as watching; nothing is 0.
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const advance = useCallback(
    (delta: number) => {
      setCurrent((index) => (index + delta + slides.length) % slides.length);
    },
    [slides.length],
  );

  const playing = !hovered && visible && onScreen && !reducedMotion;

  /* --- the timer -------------------------------------------------------- */
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => advance(1), SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, advance]);

  /* --- preload the next slide's image ----------------------------------- */
  // next/image lazy-loads everything after the first, so without this the
  // slide arriving in 4s starts fetching as it becomes visible and pops in.
  useEffect(() => {
    const next = slides[(current + 1) % slides.length];
    const img = new window.Image();
    img.src = next.image.src;
  }, [current, slides]);

  /* --- keyboard --------------------------------------------------------- */
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      advance(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      advance(-1);
    }
  }

  return (
    <section
      ref={rootRef}
      aria-label="Featured"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Pausing on focus too: a keyboard user reading a slide should not have
      // it change under them any more than a mouse user hovering it.
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={onKeyDown}
      className={[
        "mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6",
        // Under 1100px the cards sit below the slider; at or above it they sit
        // beside it and take only the width they need.
        "min-[1100px]:grid-cols-[1fr_auto]",
      ].join(" ")}
      // One height token for both columns, so the cards line up with the
      // slider rather than each choosing its own size.
      style={{ ["--hero-h" as string]: "20rem" }}
    >
      <div className="min-w-0 [height:var(--hero-h)]">
        <HeroSlider
          slides={slides}
          current={current}
          animate={!reducedMotion}
          onSelect={setCurrent}
          onNext={() => advance(1)}
          onPrevious={() => advance(-1)}
          onSlideClick={(index) => trackHeroClick(`slide:${slides[index].id}`)}
        />
      </div>

      <div className="min-[1100px]:w-[32rem] min-[1100px]:[height:var(--hero-h)]">
        <HeroCards cards={HERO_CARDS} onCardClick={trackHeroClick} />
      </div>

      {/* Announces the slide that is now showing. Outside the slider so a
          re-render of the slides cannot take the live region with it. */}
      <p aria-live="polite" className="sr-only">
        {slides[current].headline}, slide {current + 1} of {slides.length}
      </p>
    </section>
  );
}
