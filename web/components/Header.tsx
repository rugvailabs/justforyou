/**
 * Shared site header.
 *
 * Now a thin delegate to the design-system SiteHeader. Kept as a module so the
 * Step 1-8 pages that import it pick up the new header without each one being
 * edited - this pass is meant to change how the app looks, not to rewrite
 * pages, and those come next one at a time.
 *
 * `children` was a slot for page-specific actions under the nav. Only the
 * dashboard ever passed one, and the new header is sticky, so anything placed
 * there would scroll under it; it is rendered below the header instead.
 */

import SiteHeader from "@/components/ds/SiteHeader";

export default function Header({
  children,
}: {
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <>
      {/* Full-bleed: the header spans the viewport even inside a page's
          max-w container, which is what makes it read as a site chrome. */}
      <div className="mb-8 -mx-6 -mt-10">
        {/* @ts-expect-error Async Server Component in a sync parent - allowed
            in the App Router, not yet expressible in the type system. */}
        <SiteHeader />
      </div>
      {children}
    </>
  );
}
