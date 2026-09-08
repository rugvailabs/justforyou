/**
 * /login - the only unauthenticated entry point.
 *
 * Two distinct cases arrive here, and conflating them causes a redirect loop:
 *
 *   - Signed out: render the form. `next` is carried on the form submit.
 *   - Signed in but refused (a non-admin who asked for /admin): middleware
 *     sends them here with ?forbidden=1. Honouring `next` would bounce them
 *     straight back to /admin, which bounces back here, forever. So we explain
 *     the refusal instead and never redirect to `next`.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/LoginForm";
import OtpLoginForm from "@/components/OtpLoginForm";
import Card from "@/components/ui/Card";
import LogoutButton from "@/components/LogoutButton";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; forbidden?: string };
}): JSX.Element {
  // Only accept internal paths - an open redirect otherwise.
  const raw = searchParams.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  const forbidden = searchParams.forbidden === "1";

  const session = getSession();

  if (session !== null) {
    // Signed in and allowed: nothing to do here.
    if (!forbidden) redirect(next || "/");

    // Signed in but not permitted. Dead end by design - no `next` redirect.
    return (
      <main className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-2xl font-semibold">Not authorised</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have access to{" "}
          <code className="rounded bg-slate-200 px-1">{next || "that page"}</code>.
          Sign in with an administrator account to continue.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Home
          </Link>
          <LogoutButton />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Use your phone number, or your email and password.
      </p>

      <Card className="mb-6">
        <OtpLoginForm next={next} />
      </Card>

      {/* Email/password is kept, not replaced: most accounts have no phone
          number on file and would otherwise be locked out. */}
      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Use email and password instead
        </summary>
        <div className="mt-4">
          <LoginForm next={next} />
        </div>
      </details>
    </main>
  );
}
