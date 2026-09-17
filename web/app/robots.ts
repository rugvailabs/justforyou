/**
 * /robots.txt - see lib/indexing.ts. The root layout also marks every page
 * noindex, because robots.txt only asks crawlers not to fetch; a page linked
 * from elsewhere can still be indexed without it.
 */

import type { MetadataRoute } from "next";

import { indexingAllowed } from "@/lib/indexing";

export default function robots(): MetadataRoute.Robots {
  return indexingAllowed
    ? { rules: { userAgent: "*", allow: "/" } }
    : { rules: { userAgent: "*", disallow: "/" } };
}
