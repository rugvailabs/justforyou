"use client";

/**
 * A chat thread with polling.
 *
 * Delivery is polling rather than a socket: every POLL_MS the client asks for
 * messages after the highest id it holds, so each tick is a cheap indexed
 * lookup that usually returns an empty array. Ids are monotonic within a
 * thread, so this needs no clock agreement between client and server.
 *
 * Three things keep polling from being a nuisance:
 *   - it stops while the tab is hidden, so a backgrounded thread costs nothing
 *   - a failed tick is swallowed and retried on the next one; a blip must not
 *     throw an error banner over a working conversation
 *   - the sent message is appended from the POST response, so your own message
 *     appears immediately rather than on the next tick
 */

import { useCallback, useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import type { ChatMessage } from "@/lib/types";

const POLL_MS = 4000;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThread({
  conversationId,
  initialMessages,
}: {
  conversationId: number;
  initialMessages: ChatMessage[];
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref as well as state: the poll closure must read the current
  // high-water mark without being re-created on every message.
  const lastIdRef = useRef<number>(
    initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].id : 0,
  );

  /** Append only ids we do not already hold - a retry must not duplicate. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return current;
      const next = [...current, ...fresh].sort((a, b) => a.id - b.id);
      lastIdRef.current = next[next.length - 1].id;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/chat?conversation_id=${conversationId}&after_id=${lastIdRef.current}`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { messages?: ChatMessage[] };
        if (!cancelled && body.messages) merge(body.messages);
      } catch {
        // A dropped tick is not worth telling the user about; the next one
        // will pick the messages up.
      }
    }

    const timer = window.setInterval(poll, POLL_MS);
    // Catch up immediately when the tab comes back, rather than waiting a tick.
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [conversationId, merge]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, body }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : `Could not send that (HTTP ${res.status}).`,
        );
        return;
      }

      const sent = (payload as { message?: ChatMessage }).message;
      if (sent) merge([sent]);
      setDraft("");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex max-h-[60vh] min-h-[240px] flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-slate-500">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.mine
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {message.body}
              </div>
              <span className="mt-0.5 text-xs text-slate-500">
                {message.mine ? "You" : message.sender_name} ·{" "}
                {formatTime(message.created_at)}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error !== null ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder="Write a message…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
        <Button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
