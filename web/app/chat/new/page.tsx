/**
 * /chat/new?business=X - open (or reopen) the thread and go straight to it.
 *
 * A Server Component that redirects rather than a page anyone sees: the
 * "Start chat" button on a listing links here, and the get-or-create endpoint
 * means pressing it twice lands on the same thread.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, startConversation } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: { business?: string };
}): Promise<JSX.Element> {
  const businessId = Number(searchParams.business);
  if (!Number.isInteger(businessId) || businessId < 1) notFound();

  // Chat needs an account on both sides, so send a signed-out visitor to
  // login and bring them back here.
  const user = await getCurrentUser();
  if (user === null) {
    redirect(`/login?next=${encodeURIComponent(`/chat/new?business=${businessId}`)}`);
  }

  try {
    const conversation = await startConversation(businessId);
    redirect(`/chat/${conversation.id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      // Owner pressed their own listing's button.
      return (
        <div className="mx-auto max-w-lg px-6 py-16">
          <Card>
            <h1 className="font-semibold text-slate-900">That is your listing</h1>
            <p className="mt-1 text-sm text-slate-600">
              You cannot start a chat with a business you own. Customer messages
              arrive in your inbox.
            </p>
            <div className="mt-4 flex gap-2">
              <ButtonLink href="/chat">Go to messages</ButtonLink>
              <ButtonLink href="/dashboard" variant="secondary">
                Dashboard
              </ButtonLink>
            </div>
          </Card>
        </div>
      );
    }
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // redirect() throws, so this is unreachable; it satisfies the return type.
  return <Link href="/chat">Messages</Link>;
}
