/**
 * /about
 *
 * Written to describe what this actually is right now, not what a directory
 * aspires to be. Every number and claim on this page is checkable against the
 * running app; nothing here says "millions of businesses".
 */

import type { Metadata } from "next";
import Link from "next/link";

import Prose from "@/components/ds/Prose";

export const metadata: Metadata = {
  title: "About",
  description:
    "What justforyou is, how listings get in, and what the verified badge means.",
};

export default function AboutPage(): JSX.Element {
  return (
    <Prose
      title="About"
      lede="A directory of Canadian businesses that people can actually reach."
      updated="2026-09-10"
    >
      <p>
        justforyou lists local businesses so somebody looking for a plumber at
        nine on a Sunday evening can find one, see whether they are open, and
        get through to them. That is the whole product. The listing is not the
        end of the journey - the phone call is.
      </p>

      <h2>How a business gets listed</h2>
      <p>
        Anyone can <Link href="/dashboard/new-listing">add their business</Link>,
        free. Nothing appears in public search until it has passed two separate
        checks, and both have to clear:
      </p>
      <ul>
        <li>
          <strong>Listing review.</strong> A person reads what was submitted -
          the name, the category, the description - and approves or rejects it
          with a reason the owner can read.
        </li>
        <li>
          <strong>Business verification.</strong> The owner sends identity
          documents, and a reviewer confirms the business behind the listing is
          real.
        </li>
      </ul>
      <p>
        They are deliberately separate, because they can fail for different
        reasons and an owner needs to know which one is holding them up. A
        listing that has passed review but not verification is not in search,
        and its owner is told exactly that.
      </p>

      <h2>What the verified badge means</h2>
      <p>
        It means a reviewer looked at that business&apos;s documents and
        confirmed the business exists. It is not a rating, an endorsement, or a
        statement that the work will be good - only that the business is real.
        Because verification gates public search, every listing you can find
        through search has passed it.
      </p>

      <h2>Ratings and reviews</h2>
      <p>
        Reviews are written by people with accounts, one per business, and the
        business owner can reply once to each. Owners cannot delete reviews or
        review themselves. A business with no reviews shows as unrated rather
        than as zero stars - those are different things, and a directory that
        renders one as the other teaches people not to trust either.
      </p>

      <h2>What this does not do</h2>
      <p>
        It does not take bookings, process payments, sell goods, or stand
        between you and the business. When you contact somebody through this
        site, you are contacting them - we record that the enquiry happened so
        the owner can follow it up, and that is the extent of our involvement.
      </p>

      <h2>Still being built</h2>
      <p>
        This is an early-stage product and some of it is visibly unfinished:
        there are no listing photos yet, and the French side of the site has
        its dictionary in place but no routing. Where something is missing, the
        page says so rather than filling the gap with a placeholder.
      </p>
    </Prose>
  );
}
