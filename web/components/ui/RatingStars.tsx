/**
 * Five-star rating readout.
 *
 * `rating` is nullable on the API because NULL means "no reviews yet", which
 * is not the same as 0.0. That case renders as text rather than five empty
 * stars, which would read as a genuinely terrible score.
 *
 * The stars are decorative: the accessible name comes from a single aria-label
 * on the wrapper, so a screen reader hears "Rated 4.7 out of 5 from 218
 * reviews" instead of five separate glyphs.
 */

const FULL = "★";
const EMPTY = "☆";

export default function RatingStars({
  rating,
  reviewCount,
  showCount = true,
  className = "",
}: {
  rating: number | null;
  reviewCount?: number;
  showCount?: boolean;
  className?: string;
}): JSX.Element {
  if (rating === null) {
    return (
      <span className={`text-sm text-slate-500 ${className}`.trim()}>
        No reviews yet
      </span>
    );
  }

  // Clamp defensively: a bad value should not render six stars.
  const value = Math.max(0, Math.min(5, rating));
  const rounded = Math.round(value);

  const label =
    reviewCount === undefined
      ? `Rated ${value.toFixed(1)} out of 5`
      : `Rated ${value.toFixed(1)} out of 5 from ${reviewCount} reviews`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`.trim()}
      aria-label={label}
    >
      <span aria-hidden="true" className="text-amber-500">
        {FULL.repeat(rounded)}
        <span className="text-slate-300">{EMPTY.repeat(5 - rounded)}</span>
      </span>
      <span aria-hidden="true" className="text-sm font-medium text-slate-900">
        {value.toFixed(1)}
      </span>
      {showCount && reviewCount !== undefined ? (
        <span aria-hidden="true" className="text-sm text-slate-500">
          ({reviewCount.toLocaleString("en-CA")})
        </span>
      ) : null}
    </span>
  );
}
