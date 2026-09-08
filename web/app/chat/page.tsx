/**
 * /chat - every thread the signed-in user is in, either side.
 *
 * One list for both roles: a customer sees the businesses they have messaged,
 * an owner sees the customers who have messaged them, and the server labels
 * each row from the viewer's perspective.
 */

import Link from "next/link";

import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { ApiError, getConversations } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import type { Conversation } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default async function ChatListPage(): Promise<JSX.Element> {
  await requireUser("/chat");

  let conversations: Conversation[] = [];
  let error: string | null = null;
  try {
    conversations = await getConversations();
  } catch (cause) {
    error =
      cause instanceof ApiError
        ? cause.isNetworkError
          ? "The API is not reachable. Is the backend running on port 8000?"
          : cause.message
        : "Could not load your messages.";
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Header />

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Messages</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Conversations with businesses you have contacted, and customers who have
        contacted you.
      </p>

      {error !== null ? (
        <Card className="border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : conversations.length === 0 ? (
        <Card>
          <h2 className="font-semibold text-slate-900">No messages yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Open a business listing and choose &ldquo;Start chat&rdquo; to ask a
            question.
          </p>
          <div className="mt-4">
            <ButtonLink href="/search">Browse listings</ButtonLink>
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/chat/${conversation.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {conversation.other_party_name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatWhen(conversation.last_message_at)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {conversation.last_message_preview ?? "No messages yet."}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    {conversation.my_role === "owner"
                      ? `About ${conversation.business_name}`
                      : "You contacted this business"}
                  </span>
                  {conversation.unread > 0 ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">
                      {conversation.unread} new
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
