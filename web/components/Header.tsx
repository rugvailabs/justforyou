/**
 * Shared site header.
 *
 * A Server Component: it reads the session directly, so no page has to pass
 * the user down and no client bundle grows to render a nav.
 *
 * Links are role-gated to match what the routes will actually allow. Showing
 * a plain customer a "Dashboard" link only to bounce them at the gate is a
 * worse experience than not offering it - the nav should never hand out a
 * link that fails.
 */

import Link from "next/link";

import LogoutButton from "@/components/LogoutButton";
import { ButtonLink } from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth";

export default async function Header({
  /** Rendered under the nav - a page-specific action or breadcrumb. */
  children,
}: {
  children?: React.ReactNode;
}): Promise<JSX.Element> {
  const user = await getCurrentUser();
  const isAdmin = user !== null && (user.is_admin || user.role === "admin");
  const isOwner = user !== null && (isAdmin || user.role === "business_owner");

  return (
    <header className="mb-8 border-b border-slate-200 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          JustDial CA
        </Link>

        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/search" className="px-2 py-1 text-slate-700 hover:underline">
            Browse
          </Link>

          {user === null ? (
            <ButtonLink href="/login" size="sm">
              Sign in
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/chat" variant="secondary" size="sm">
                Messages
              </ButtonLink>
              {isOwner ? (
                <ButtonLink href="/dashboard" variant="secondary" size="sm">
                  Dashboard
                </ButtonLink>
              ) : null}
              {isAdmin ? (
                <ButtonLink href="/admin" variant="secondary" size="sm">
                  Admin
                </ButtonLink>
              ) : null}
              <ButtonLink href="/account" variant="ghost" size="sm">
                {user.name}
              </ButtonLink>
              <LogoutButton />
            </>
          )}
        </nav>
      </div>

      {children !== undefined ? <div className="mt-3">{children}</div> : null}
    </header>
  );
}
