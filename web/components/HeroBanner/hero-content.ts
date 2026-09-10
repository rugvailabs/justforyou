/**
 * Everything the hero says, as data.
 *
 * Slides and cards live here rather than as JSX so changing a headline, a
 * destination or the order is an edit to this file and nothing else. The types
 * are what stop that being a free-for-all: a slide without alt text or a card
 * with a title and no image will not compile.
 *
 * On the card destinations: these point at /[province]/[city]/[category],
 * which is a real route. Note the slug is `salons`, not `hair-salons` - the
 * category is "Salons & Spas" in the taxonomy, and a card linking to a slug
 * that does not exist would 404 however good it looked.
 */

export interface HeroSlide {
  /** Stable across reorderings - used as the React key and in analytics. */
  id: string;
  headline: string;
  subhead: string;
  cta: { label: string; href: string };
  image: { src: string; alt: string };
}

export interface HeroCard {
  id: string;
  title: string;
  blurb: string;
  image: { src: string; alt: string };
  /**
   * Omitted on the placeholder card, which is what makes it render as a
   * <div> rather than an <a>. An anchor with no href is not a link - it is
   * an anchor a screen reader still announces and a keyboard still stops on.
   */
  href?: string;
}

export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    id: "verified",
    headline: "Every listing, identity checked",
    subhead:
      "A business appears in search only after a reviewer has confirmed it is real.",
    cta: { label: "Browse the directory", href: "/search" },
    image: {
      src: "/hero/slide-1.svg",
      // Describes what the image conveys, not what it depicts - the artwork is
      // abstract, and "concentric circles" helps nobody.
      alt: "",
    },
  },
  {
    id: "near-me",
    headline: "Find what is closest to you",
    subhead:
      "Search by trade, filter by city and rating, or sort by distance from where you are.",
    cta: { label: "Search near me", href: "/search?sort=distance" },
    image: { src: "/hero/slide-2.svg", alt: "" },
  },
  {
    id: "list-yours",
    headline: "List your business, free",
    subhead:
      "Add your listing, pass the two checks, and start taking enquiries from the directory.",
    cta: { label: "Add your business", href: "/dashboard/new-listing" },
    image: { src: "/hero/slide-3.svg", alt: "" },
  },
] as const;

export const HERO_CARDS: readonly HeroCard[] = [
  {
    id: "restaurants",
    title: "Restaurants",
    blurb: "Places to eat across Vancouver",
    href: "/bc/vancouver/restaurants",
    image: { src: "/hero/card-restaurants.svg", alt: "" },
  },
  {
    id: "salons",
    title: "Salons & Spas",
    blurb: "Hair, nails, skincare and massage",
    // `salons` is the real category slug; `hair-salons` does not exist.
    href: "/bc/vancouver/salons",
    image: { src: "/hero/card-salons.svg", alt: "" },
  },
  {
    id: "electricians",
    title: "Electricians",
    blurb: "Wiring, panels, lighting and EV chargers",
    href: "/bc/vancouver/electricians",
    image: { src: "/hero/card-electricians.svg", alt: "" },
  },
  {
    id: "coming-soon",
    title: "More categories coming soon",
    blurb: "Ten trades listed today, with more on the way",
    // No href on purpose: renders as a <div>, not a link. See HeroCard.
    image: { src: "/hero/card-restaurants.svg", alt: "" },
  },
] as const;

/** How long a slide is shown before the next one, in milliseconds. */
export const SLIDE_INTERVAL_MS = 4000;

/** How long the slide takes to move. Must match the CSS duration below. */
export const SLIDE_TRANSITION_MS = 600;
