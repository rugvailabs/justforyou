/**
 * "Near me" as a search intent.
 *
 * People type the phrase into the What box ("plumber near me") as often as
 * they press the button, and the backend's free-text match would look for a
 * listing literally containing "near me" and find nothing. So the phrase is
 * recognised here, stripped from the query, and turned into the same request
 * the button makes: `near=me`, which the search page resolves to the
 * browser's position.
 */

/** Radius applied to a "near me" search, in km. Matches the mobile app. */
export const NEAR_ME_RADIUS_KM = 25;

const NEAR_ME_PHRASE =
  /(?:^|\s)(?:near\s*(?:me|by)|nearby|nearest|around\s+me|close\s+(?:to\s+)?me|in\s+my\s+area|pr[eè]s\s+de\s+(?:moi|chez\s+moi))(?=\s|$)/gi;

/**
 * Split a free-text query into the service being asked for and whether the
 * person asked for it near them. "near me" alone leaves no query at all.
 */
export function splitNearMe(q: string | undefined): {
  query: string | undefined;
  nearMe: boolean;
} {
  if (q === undefined) return { query: undefined, nearMe: false };
  const stripped = q.replace(NEAR_ME_PHRASE, " ").replace(/\s+/g, " ").trim();
  const nearMe = stripped !== q.replace(/\s+/g, " ").trim();
  return { query: stripped || undefined, nearMe };
}
