/**
 * /chat/[id] - one thread.
 *
 * Server Component fetches the history so the first paint is complete and
 * needs no spinner; ChatThread takes over for live updates.
 *
 * A thread the caller is not part of 404s rather than 403s - the existence of
 * other people's conversations is itself private.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import ChatThread from "@/components/ChatThread";
import { ApiError, getConversation } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { ConversationDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  await requireUser(`/chat/${params.id}`);

  const conversationId = Number(params.id);
  if (!Number.isInteger(conversationId) || conversationId < 1) notFound();

  let conversation: ConversationDetail;
  try {
    conversation = await getConversation(conversationId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // The socket goes straight to the API origin - Next cannot usefully proxy a
  // WebSocket - so derive ws:// from the same base URL the server calls.
  const wsBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1")
    .replace(/\/api\/v1\/?$/, "")
    .replace(/^http/, "ws");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-5">
        <Link href="/chat" className="text-sm underline">
          ← All messages
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          {conversation.other_party_name}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {conversation.my_role === "owner" ? (
            <>Customer enquiry about {conversation.business_name}</>
          ) : (
            <>
              Your conversation with{" "}
              <Link
                href={`/business/${conversation.business_slug}`}
                className="underline"
              >
                {conversation.business_name}
              </Link>
            </>
          )}
        </p>
      </header>

      <ChatThread
        conversationId={conversation.id}
        initialMessages={conversation.messages}
        wsBase={wsBase}
      />
    </div>
  );
}
