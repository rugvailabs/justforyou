/**
 * /terms
 *
 * DRAFT. Written to describe what the product actually does, and marked
 * unmistakably as not yet reviewed by a lawyer - see the notice at the top,
 * which is rendered, not a code comment. Publishing invented legal text
 * dressed as final terms would be worse than having no page.
 */

import type { Metadata } from "next";
import Link from "next/link";

import Prose from "@/components/ds/Prose";
import { Alert } from "@/components/ds/feedback";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using JustDial CA, for visitors and for business owners.",
};

export default function TermsPage(): JSX.Element {
  return (
    <Prose
      title="Terms of use"
      lede="What you can expect from this directory, and what we expect from you."
      updated="2026-09-10"
    >
      <div className="not-prose">
        <Alert tone="warning" title="Draft - not yet legally reviewed">
          This describes how the product actually behaves today and has not been
          checked by a lawyer. Do not rely on it as a binding agreement until it
          has been.
        </Alert>
      </div>

      <h2>Using the directory</h2>
      <p>
        Browsing and searching is open to anyone. You need an account to leave a
        review or to message a business, and you need to register with an email
        address and a password.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>One account per person, and you are responsible for what happens under it.</li>
        <li>Give us an email address you actually read - it is how we reach you.</li>
        <li>
          Do not register on behalf of somebody else, or claim a business you do
          not represent. Verification exists to catch this.
        </li>
      </ul>

      <h2>Listings</h2>
      <p>
        If you list a business, you are stating that it exists, that you are
        entitled to represent it, and that what you have written about it is
        accurate. We review listings before they appear publicly and verify the
        business behind them; we can reject or suspend a listing, and if we do,
        you are told why.
      </p>
      <p>
        You keep ownership of what you upload. You give us permission to display
        it in the directory and in search results, which is the only reason we
        are holding it.
      </p>

      <h2>Reviews</h2>
      <ul>
        <li>Review only businesses you have genuinely dealt with.</li>
        <li>One review per business. Owners can reply once; they cannot delete reviews.</li>
        <li>
          Do not post anything false, abusive, or that identifies somebody who
          did not consent to it.
        </li>
        <li>
          We can remove a review that breaks these rules. We do not remove one
          because a business asked us to.
        </li>
      </ul>

      <h2>What we do not promise</h2>
      <p>
        We do not vouch for the quality, price, punctuality or licensing of any
        business listed here. Verification confirms a business is real - nothing
        more. Any arrangement you make with a business is between you and them,
        and we are not a party to it.
      </p>
      <p>
        We also do not promise the site is always available or always correct.
        This is an early-stage product and parts of it are unfinished.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using the site at any time and ask us to delete your
        account - see the <Link href="/privacy">privacy policy</Link>. We can
        suspend an account that is being used to abuse the directory or the
        people on it.
      </p>

      <h2>Changes</h2>
      <p>
        When these terms change, the date at the top of this page changes with
        them.
      </p>
    </Prose>
  );
}
