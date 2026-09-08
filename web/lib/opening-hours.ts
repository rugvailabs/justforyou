/**
 * Is this business open right now?
 *
 * Reads the shape the backend actually stores (app/models/business.py):
 *
 *     {"mon": [["09:00", "17:00"]], "sat": [], ...}
 *
 * A day that is absent or empty means closed. A range whose end is before its
 * start crosses midnight - a bar closing at 02:00 is open at 01:00 on the
 * following day, and treating that as a malformed range would mark half the
 * restaurants in the directory closed all evening.
 *
 * The one thing this cannot do is know the business's timezone: the backend
 * stores wall-clock strings with no zone, so "open now" is computed against
 * the viewer's clock. That is right for the common case - somebody in
 * Vancouver looking at Vancouver businesses - and wrong for a Toronto viewer
 * browsing Vancouver. Fixing it properly needs a timezone on the listing.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type OpeningHours = Record<string, [string, string][]>;

export type OpenState =
  | { status: "open"; until: string }
  | { status: "closing-soon"; until: string }
  | { status: "closed"; opensAt: string; opensDay: string | null }
  | { status: "closed"; opensAt: null; opensDay: null }
  | { status: "unknown" };

/** "09:30" -> 570 minutes past midnight. NaN-safe: bad input yields null. */
function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Formatted the way the locale expects: 5:00 p.m. in en-CA, 17:00 in fr-CA. */
export function formatTime(value: string, locale = "en-CA"): string {
  const minutes = toMinutes(value);
  if (minutes === null) return value;
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dayName(index: number, locale = "en-CA"): string {
  // 2024-01-07 was a Sunday, so index maps straight onto the week.
  const date = new Date(2024, 0, 7 + index);
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
}

/** Minutes until closing, below which "open" becomes "closing soon". */
const CLOSING_SOON_MINUTES = 60;

export function getOpenState(
  hours: OpeningHours | null | undefined,
  now: Date = new Date(),
  locale = "en-CA",
): OpenState {
  if (!hours || Object.keys(hours).length === 0) return { status: "unknown" };

  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const rangesFor = (dayIndex: number): [string, string][] => {
    const key = DAY_KEYS[((dayIndex % 7) + 7) % 7];
    const value = hours[key];
    return Array.isArray(value) ? value : [];
  };

  // Yesterday's ranges can still be running if they crossed midnight.
  for (const [start, end] of rangesFor(today - 1)) {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (from === null || to === null || to >= from) continue;
    if (nowMinutes < to) {
      return {
        status: to - nowMinutes <= CLOSING_SOON_MINUTES ? "closing-soon" : "open",
        until: formatTime(end, locale),
      };
    }
  }

  for (const [start, end] of rangesFor(today)) {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (from === null || to === null) continue;
    const crossesMidnight = to < from;
    const isOpen = crossesMidnight
      ? nowMinutes >= from
      : nowMinutes >= from && nowMinutes < to;
    if (isOpen) {
      const minutesLeft = crossesMidnight ? Infinity : to - nowMinutes;
      return {
        status: minutesLeft <= CLOSING_SOON_MINUTES ? "closing-soon" : "open",
        until: formatTime(end, locale),
      };
    }
  }

  // Closed: find the next opening, today or within the coming week.
  for (let offset = 0; offset < 8; offset += 1) {
    const dayIndex = today + offset;
    for (const [start] of rangesFor(dayIndex)) {
      const from = toMinutes(start);
      if (from === null) continue;
      if (offset === 0 && from <= nowMinutes) continue;
      return {
        status: "closed",
        opensAt: formatTime(start, locale),
        opensDay: offset === 0 ? null : dayName(dayIndex % 7, locale),
      };
    }
  }

  // Hours exist but nothing parses, or the business is never open.
  return { status: "closed", opensAt: null, opensDay: null };
}
