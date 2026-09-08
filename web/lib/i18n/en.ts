/**
 * English strings.
 *
 * This file is the source of truth for the key set: fr.ts is typed against it,
 * so a key added here and forgotten there is a compile error rather than a
 * French page with an English word in the middle of it.
 *
 * Only the shell is translated at this stage - header, footer, and the buttons
 * that appear on every page. Page bodies follow as each page is restyled.
 */

export const en = {
  common: {
    brand: "JustDial CA",
    tagline: "Find local businesses across Canada",
    search: "Search",
    searchPlaceholderWhat: "Plumbers, dentists, restaurants…",
    searchPlaceholderWhere: "City or postal code",
    nearMe: "Near me",
    signIn: "Sign in",
    signOut: "Sign out",
    dashboard: "Dashboard",
    messages: "Messages",
    admin: "Admin",
    browse: "Browse",
    listYourBusiness: "List your business",
    loading: "Loading…",
    retry: "Try again",
    cancel: "Cancel",
    close: "Close",
    openMenu: "Open menu",
    language: "Language",
  },
  listing: {
    showNumber: "Show number",
    enquire: "Enquire",
    call: "Call",
    directions: "Directions",
    website: "Website",
    verified: "Verified",
    verifiedHint: "Identity checked by our team",
    sponsored: "Sponsored",
    open: "Open now",
    closed: "Closed",
    closesAt: "Closes {time}",
    opensAt: "Opens {time}",
    opensDay: "Opens {day} {time}",
    noHours: "Hours not listed",
    noReviews: "No reviews yet",
    reviews: "{count} reviews",
    oneReview: "1 review",
    away: "{distance} away",
  },
  footer: {
    forCustomers: "For customers",
    forBusinesses: "For businesses",
    company: "Company",
    browseCategories: "Browse categories",
    howItWorks: "How it works",
    addListing: "Add your business",
    pricing: "Pricing",
    ownerSignIn: "Business sign-in",
    about: "About",
    privacy: "Privacy",
    terms: "Terms",
    accessibility: "Accessibility",
    rights: "All rights reserved.",
    madeIn: "Built in Canada. Prices in CAD.",
  },
  empty: {
    noResults: "No listings match that",
    noResultsBody: "Try a broader search, or clear a filter or two.",
    clearFilters: "Clear filters",
  },
} as const;

/**
 * The shape every locale must fill.
 *
 * `as const` above gives each English string a literal type, which is what
 * makes a mistyped key a compile error - but it would also demand that the
 * French file repeat the English words. This widens the leaves back to
 * `string` while keeping the key structure exact, so fr.ts must supply every
 * key and may supply any text.
 */
type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>;
};

export type Dictionary = Translated<typeof en>;
