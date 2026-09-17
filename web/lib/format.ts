/**
 * Canadian formatting conventions, in one place.
 *
 * These are the details that make a directory read as local rather than as an
 * American product with the currency swapped. They are also the details that
 * drift if every component formats its own: one card showing "V6C 3E1" and
 * another "V6C3E1" is the kind of thing nobody files a bug about and everyone
 * notices.
 *
 * The data itself is not normalised - the seed carries "+1-604-555-0142" and
 * an owner can type anything into the dashboard - so every function here
 * takes whatever it is given and falls back to returning it unchanged rather
 * than mangling a value it does not recognise.
 */

/** The provinces and territories, in the order Canada Post lists them. */
export const PROVINCES = [
  { code: "AB", en: "Alberta", fr: "Alberta" },
  { code: "BC", en: "British Columbia", fr: "Colombie-Britannique" },
  { code: "MB", en: "Manitoba", fr: "Manitoba" },
  { code: "NB", en: "New Brunswick", fr: "Nouveau-Brunswick" },
  { code: "NL", en: "Newfoundland and Labrador", fr: "Terre-Neuve-et-Labrador" },
  { code: "NS", en: "Nova Scotia", fr: "Nouvelle-Écosse" },
  { code: "NT", en: "Northwest Territories", fr: "Territoires du Nord-Ouest" },
  { code: "NU", en: "Nunavut", fr: "Nunavut" },
  { code: "ON", en: "Ontario", fr: "Ontario" },
  { code: "PE", en: "Prince Edward Island", fr: "Île-du-Prince-Édouard" },
  { code: "QC", en: "Quebec", fr: "Québec" },
  { code: "SK", en: "Saskatchewan", fr: "Saskatchewan" },
  { code: "YT", en: "Yukon", fr: "Yukon" },
] as const;

export type ProvinceCode = (typeof PROVINCES)[number]["code"];

const PROVINCE_CODES = new Set(PROVINCES.map((p) => p.code));

/** True for a real two-letter provincial code, so a bad value can be hidden. */
export function isProvinceCode(value: string | null | undefined): boolean {
  return typeof value === "string" && PROVINCE_CODES.has(value.toUpperCase() as ProvinceCode);
}

/**
 * "v6c3e1" -> "V6C 3E1".
 *
 * Canada Post writes postal codes as two groups of three with a single space.
 * Anything that is not six alphanumerics is handed back untouched: a partial
 * code someone is still typing should not be rearranged under them.
 */
export function formatPostalCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(cleaned)) return value.trim() || null;
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
}

/**
 * "+1-604-555-0142" -> "(604) 555-0142".
 *
 * The display form is the one Canadians read; the dialable form is separate
 * (see telHref). A number that is not ten digits - an extension, an
 * international line - is returned as given rather than forced into a shape it
 * does not fit.
 */
export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return value.trim() || null;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/**
 * E.164 for a tel: href - "+16045550142".
 *
 * Dialers are forgiving, but a href with spaces and brackets is not something
 * to rely on, and E.164 is what a phone actually wants.
 */
export function telHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length > 6) return `tel:+${digits}`;
  return null;
}

/**
 * Distance in the units the country uses: metres under a kilometre, one
 * decimal above it. "0.4 km" reads as a rounding artefact; "400 m" reads as a
 * walk.
 */
export function formatDistance(km: number | null | undefined, locale = "en-CA"): string | null {
  if (km === null || km === undefined || Number.isNaN(km)) return null;
  if (km < 1) {
    const metres = Math.round(km * 1000);
    return locale.startsWith("fr") ? `${metres} m` : `${metres} m`;
  }
  // Past 100 km a decimal is noise, and "12298.0 km" needs its separator.
  if (km >= 100) return `${Math.round(km).toLocaleString(locale)} km`;
  return `${km.toFixed(1)} km`;
}

/** Money is always stated with its currency: "19.99" alone means nothing. */
export function formatCad(
  amount: number | string | null | undefined,
  locale = "en-CA",
): string | null {
  if (amount === null || amount === undefined) return null;
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
  }).format(value);
}

/** "1,284" - grouped the way en-CA and fr-CA each expect. */
export function formatCount(value: number, locale = "en-CA"): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** One decimal, always: "4" reads as an integer count, "4.0" as a rating. */
export function formatRating(rating: number | null | undefined): string | null {
  if (rating === null || rating === undefined) return null;
  return rating.toFixed(1);
}

/**
 * "North Vancouver" -> "north-vancouver", for /[province]/[city]/[category].
 *
 * Lives here rather than in that route's page.tsx because a Next route file
 * may only export a fixed set of names (default, metadata, generateMetadata,
 * dynamic and friends). Exporting a helper from one compiles under `tsc` and
 * then fails the build, which is a slow way to find out.
 */
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The inverse: "north-vancouver" -> "North Vancouver". */
export function cityFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** "Vancouver, BC" - the city line every card and profile shows. */
export function formatLocality(
  city: string | null | undefined,
  province: string | null | undefined,
): string {
  const parts = [city?.trim(), province?.trim().toUpperCase()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(", ");
}

/** The full address block, postal code spaced correctly. */
export function formatAddress(business: {
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
}): string {
  const locality = formatLocality(business.city, business.province);
  const postal = formatPostalCode(business.postal_code);
  return [business.address?.trim(), [locality, postal].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

/** "8 Sept 2026" / "8 sept. 2026" - never a US month-first date. */
export function formatDate(iso: string, locale = "en-CA"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
