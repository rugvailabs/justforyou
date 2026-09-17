/**
 * Whether search engines may index the site.
 *
 * Off unless ALLOW_INDEXING=true. A test deployment carries seeded demo
 * listings and reviews that describe businesses which do not exist; indexed,
 * they would turn up in real searches. Set it to true only for the real launch.
 *
 * Read on the server (robots.txt and the root layout's metadata), so it is not
 * a NEXT_PUBLIC_ variable and changing it needs a redeploy.
 */
export const indexingAllowed = process.env.ALLOW_INDEXING === "true";
