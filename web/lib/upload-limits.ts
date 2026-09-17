/**
 * The largest verification document the site accepts, in megabytes.
 *
 * Documents pass through this app's server on their way to storage
 * (app/api/dashboard/verification/upload). Where that server is a Vercel
 * function, request bodies over about 4.5 MB are rejected before our code
 * runs, so a Vercel deployment sets NEXT_PUBLIC_MAX_DOCUMENT_MB=4 and people
 * see a clear message instead of a failed request. Elsewhere 10 MB.
 */
export const MAX_DOCUMENT_MB = Number(process.env.NEXT_PUBLIC_MAX_DOCUMENT_MB) || 10;

export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024;
