/**
 * The t() helper.
 *
 * Deliberately tiny: a dictionary lookup by dotted key with {placeholder}
 * interpolation, and no runtime dependency. A full i18n library brings routing,
 * pluralisation rules and a provider tree, none of which this app can use yet -
 * and adopting one later is easier from a typed dictionary than from a mixed
 * bag of hardcoded strings.
 *
 * The locale is a parameter rather than global state, because the pages that
 * read it are Server Components: there is no client context to hold it, and
 * threading it explicitly is what will let /fr routes work later without
 * rewriting every call site.
 */

import { en, type Dictionary } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";

export type Locale = "en" | "fr";

export const LOCALES: Locale[] = ["en", "fr"];
export const DEFAULT_LOCALE: Locale = "en";

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

/** The BCP-47 tag Intl wants, which is not the same as our short locale. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-CA",
  fr: "fr-CA",
};

export function dictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}

type Values = Record<string, string | number>;

/**
 * Look up "listing.showNumber" and fill any {placeholders}.
 *
 * A missing key returns the key itself rather than an empty string: a visible
 * "listing.showNumber" in the UI gets fixed, a blank space does not.
 */
export function translate(
  locale: Locale,
  key: string,
  values?: Values,
): string {
  const parts = key.split(".");
  let node: unknown = dictionary(locale);
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) return key;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") return key;
  if (!values) return node;
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Bind a locale once: `const t = tFor("fr"); t("common.signIn")`. */
export function tFor(locale: Locale = DEFAULT_LOCALE) {
  return (key: string, values?: Values): string => translate(locale, key, values);
}
