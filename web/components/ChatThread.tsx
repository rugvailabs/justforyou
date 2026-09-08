"use client";

/**
 * A chat thread over a WebSocket.
 *
 * Connection flow: ask our own route handler for a 60-second ticket, open the
 * socket with it, then stream. The access token never touches the browser -
 * it stays in the httpOnly cookie, and the ticket is scoped to one
 * conversation so a leak is worth a minute of one thread.
 *
 * The connection state is always visible. A chat that has quietly stopped
 * delivering, while still accepting typing, is worse than one that plainly
 * says it is offline - so "connecting", "reconnecting" and "offline" are all
 * shown, and the composer is disabled when there is nowhere to send.
 *
 * Reconnection backs off (1s, 2s, 4s… capped) and gives up after a handful of
 * tries rather than hammering a backend that is evidently down. History is
 * never lost: it lives in the database and a reload re-reads it over REST.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import type { ChatMessage } from "@/lib/types";

type Status = "connecting" | "online" | "reconnecting" | "offline";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15_000;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_TEXT: Record<Status, string> = {
  connecting: "Connecting…",
  online: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Offline — messages cannot be sent",
};

const STATUS_STYLE: Record<Status, string> = {
  connecting: "bg-slate-100 text-slate-600",
  online: "bg-emerald-50 text-emerald-700",
  reconnecting: "bg-amber-50 text-amber-800",
  offline: "bg-red-50 text-red-700",
};

export default function ChatThread({
  conversationId,
  initialMessages,
  wsBase,
}: {
  conversationId: number;
  initialMessages: ChatMessage[];
  /** e.g. ws://localhost:8000 - derived server-side from the API URL. */
  wsBase: string;
}): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState<Status>("connecting");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const closedByUsRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  /** Append unseen ids only, so a reconnect replaying nothing is harmless. */
  const merge = useCallback((incoming: ChatMessage) => {
    setMessages((current) =>
      current.some((m) => m.id === incoming.id)
        ? current
        : [...current, incoming].sort((a, b) => a.id - b.id),
    );
  }, []);

  /**
   * Schedule another attempt, or give up.
   *
   * Every failure funnels through here - a refused ticket, an unreachable
   * backend, a dropped socket. Handling only socket-close meant a backend
   * blip during the ticket fetch offlined the chat permanently, because that
   * path returned without ever scheduling a retry.
   */
  const retryRef = useRef<() => void>(() => {});

  const connect = useCallback(async (): Promise<void> => {
    if (closedByUsRef.current) return;

    try {
      const res = await fetch("/api/chat/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (!res.ok) {
        // 401/403/404 are permanent for this viewer; retrying cannot fix
        // them. Anything else (502 when the API is down, say) is worth
        // another go.
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setStatus("offline");
          setError("You do not have access to this conversation.");
          return;
        }
        retryRef.current();
        return;
      }
      const { ticket } = (await res.json()) as { ticket: string };

      const socket = new WebSocket(
        `${wsBase}/ws/conversations/${conversationId}?ticket=${encodeURIComponent(ticket)}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
        setStatus("online");
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as
            | { type: "ready"; user_id: number }
            | (ChatMessage & { type: "message" });

          if (payload.type === "ready") {
            setMyUserId(payload.user_id);
            return;
          }
          if (payload.type === "message") {
            // `mine` is not on the wire - the socket broadcasts one payload to
            // both sides - so it is derived from who this viewer is.
            merge({ ...payload, mine: payload.sender_id === myUserIdRef.current });
          }
        } catch {
          // A malformed frame is not worth tearing the connection down for.
        }
      };

      socket.onclose = () => {
        if (closedByUsRef.current) return;
        socketRef.current = null;
        retryRef.current();
      };

      socket.onerror = () => {
        // onclose always follows, and that is where retry is handled.
      };
    } catch {
      // Network failure reaching our own route handler.
      retryRef.current();
    }
  }, [conversationId, merge, wsBase]);

  // Wired after connect exists, so the two can reference each other without a
  // circular useCallback dependency.
  useEffect(() => {
    retryRef.current = () => {
      if (closedByUsRef.current) return;
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_ATTEMPTS) {
        setStatus("offline");
        setError(
          "Lost the live connection. Reload the page to try again - nothing you sent has been lost.",
        );
        return;
      }
      setStatus("reconnecting");
      const delay = Math.min(
        BASE_BACKOFF_MS * 2 ** (attemptsRef.current - 1),
        MAX_BACKOFF_MS,
      );
      window.setTimeout(() => void connect(), delay);
    };
  }, [connect]);

  // Read the current user id inside the socket callback without making the
  // callback depend on it (which would tear the socket down on first message).
  const myUserIdRef = useRef<number | null>(null);
  useEffect(() => {
    myUserIdRef.current = myUserId;
  }, [myUserId]);

  useEffect(() => {
    closedByUsRef.current = false;
    void connect();
    return () => {
      closedByUsRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const body = draft.trim();
    const socket = socketRef.current;

    if (!body) return;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      setError("Not connected — your message was not sent.");
      return;
    }

    socket.send(JSON.stringify({ body }));
    // The server echoes it back to the room, so it is not appended here;
    // that keeps one source of truth for ids and timestamps.
    setDraft("");
    setError(null);
  }

  const canSend = status === "online";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
          role="status"
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              status === "online" ? "bg-emerald-500" : "bg-current"
            }`}
          />
          {STATUS_TEXT[status]}
        </span>
      </div>

      <div
        className="flex max-h-[55vh] min-h-[240px] flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-slate-500">No messages yet. Say hello.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
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
            disabled={!canSend}
            placeholder={canSend ? "Write a message…" : "Waiting for connection…"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
          />
        </label>
        <Button type="submit" disabled={!canSend || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
