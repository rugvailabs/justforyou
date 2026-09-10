/**
 * /privacy
 *
 * DRAFT, and marked as such on the page itself. The substance is accurate
 * because it was written from the actual schema - the tables listed below are
 * the tables this app really has - but a privacy policy is a legal document
 * and this one has not been reviewed.
 *
 * Quebec's Law 25 and PIPEDA are named because the backend already models
 * consent (app/models/consent.py, with the Law 25 language migration behind
 * it), so the commitments here are ones the code can actually keep.
 */

import type { Metadata } from "next";
import Link from "next/link";

import Prose from "@/components/ds/Prose";
import { Alert } from "@/components/ds/feedback";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What JustDial CA collects, why, how long it is kept, and how to get it deleted.",
};

export default function PrivacyPage(): JSX.Element {
  return (
    <Prose
      title="Privacy policy"
      lede="What we collect, why we have it, and how to make us delete it."
      updated="2026-09-10"
    >
      <div className="not-prose">
        <Alert tone="warning" title="Draft - not yet legally reviewed">
          The practices described here match what the software actually does,
          but this text has not been checked against PIPEDA or Quebec&apos;s
          Law 25 by a lawyer. Do not publish it as a binding policy until it
          has been.
        </Alert>
      </div>

      <h2>What we collect</h2>
      <p>Only what a directory needs to work:</p>
      <ul>
        <li>
          <strong>Your account.</strong> Name, email address, mobile number, and
          a hashed password. We never store the password itself.
        </li>
        <li>
          <strong>Your listings,</strong> if you own a business: everything on
          the listing, plus the verification documents you send us.
        </li>
        <li>
          <strong>What you send through the site.</strong> Enquiries to
          businesses, chat messages, reviews you write, and anything you send us
          through <Link href="/contact">contact</Link>.
        </li>
        <li>
          <strong>That an enquiry happened.</strong> When you reveal a phone
          number on a listing, we record that so the business owner can see the
          lead. We do not record the call - we cannot, and we do not want to.
        </li>
      </ul>
      <p>
        We do not sell any of it, and we do not use it for advertising.
      </p>

      <h2>Verification documents</h2>
      <p>
        Documents sent for business verification are stored separately from the
        public listing and are read only by a reviewer deciding that
        application. Licence and tax numbers never appear on a public page.
      </p>

      <h2>What is public</h2>
      <p>
        Reviews you write are public and carry your name. Listing details you
        publish are public - that is their purpose. Your email address, your
        mobile number and your verification documents are not, and are never
        shown on a listing.
      </p>

      <h2>Consent</h2>
      <p>
        We ask before we email or text you anything that is not a direct reply
        to something you sent. That consent is recorded, and you can withdraw it
        at any time without losing your account.
      </p>

      <h2>Your rights</h2>
      <p>
        Under PIPEDA, and under Law 25 if you are in Quebec, you can ask us to
        show you what we hold about you, correct it, or delete it. Write to{" "}
        <Link href="/contact">contact</Link> and we will act on it.
      </p>
      <p>
        Deleting your account removes your personal details. Reviews you wrote
        are kept but detached from you - the business you reviewed keeps a
        record it has already replied to, and the rating stays honest - so they
        show as written by a former user rather than disappearing.
      </p>

      <h2>How long we keep things</h2>
      <ul>
        <li>Your account and listings: until you delete them.</li>
        <li>Enquiries and chat messages: kept, because they are the record of a conversation both sides took part in.</li>
        <li>Verification documents: kept while the listing is verified, as the evidence for that decision.</li>
      </ul>

      <h2>Where it lives</h2>
      <p>
        This is a development deployment. Data is held in a Postgres database
        and an object store operated for this project, and is not shared with
        third parties. There is no analytics or advertising tracking on this
        site.
      </p>

      <h2>Getting in touch</h2>
      <p>
        Questions about any of this go to <Link href="/contact">contact</Link>.
      </p>
    </Prose>
  );
}
