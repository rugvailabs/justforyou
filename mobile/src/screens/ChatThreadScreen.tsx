/**
 * One conversation, live over a WebSocket.
 *
 * Same server, same protocol and same ticket dance as the web thread: POST for
 * a 60-second ticket scoped to this conversation, open ws://…/ws/conversations/
 * {id}?ticket=…, expect {type:"ready"} then {type:"message"} frames, and send
 * {body} up. React Native ships a WebSocket, so no library is involved.
 *
 * Two things a phone forces that a browser tab does not:
 *
 *   - The socket dies every time the app is backgrounded. Reconnecting is the
 *     normal case, not the exception, so every failure path - a refused ticket,
 *     a dropped socket, a network error - goes through the same scheduler with
 *     the same backoff. (The web version had a bug here: one path returned
 *     without scheduling a retry and the thread simply never came back.)
 *   - The history is re-read after every reconnect, using the id of the last
 *     message we hold. Ids are monotonic within a thread, so nothing is missed
 *     and nothing is duplicated while the socket was away.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Alert from "../components/Alert";
import Button from "../components/Button";
import { ErrorState, Loading, errorMessage } from "../components/States";
import {
  getConversation,
  getNewMessages,
  getWsTicket,
  markConversationRead,
  sendMessage,
} from "../lib/api";
import { WS_BASE_URL } from "../lib/config";
import { color, radius, space, TOUCH_TARGET, type } from "../theme";
import type { ChatStackParamList } from "../navigation/types";
import type { ChatMessage } from "../lib/types";

type Props = NativeStackScreenProps<ChatStackParamList, "Thread">;

type Connection = "connecting" | "online" | "reconnecting" | "offline";

/** Backoff between reconnect attempts, in ms. Stops growing at 15s. */
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000];

export default function ChatThreadScreen({ route }: Props): React.JSX.Element {
  const { conversationId } = route.params;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const alive = useRef(true);
  // Read inside callbacks that must not be rebuilt on every message.
  const lastId = useRef(0);
  // The REST shapes carry `mine`, resolved server-side against the caller.
  // Socket frames have no viewer, so the id from the ready frame supplies it.
  const myUserId = useRef<number | null>(null);

  const append = useCallback((incoming: ChatMessage) => {
    setMessages((current) => {
      if (current.some((message) => message.id === incoming.id)) return current;
      lastId.current = Math.max(lastId.current, incoming.id);
      return [...current, incoming];
    });
  }, []);

  /** Everything that can go wrong funnels here, so a retry is never skipped. */
  const scheduleRetry = useCallback((connect: () => void) => {
    if (!alive.current) return;
    const delay = RETRY_DELAYS[Math.min(attempt.current, RETRY_DELAYS.length - 1)];
    attempt.current += 1;
    setConnection("reconnecting");
    retryTimer.current = setTimeout(connect, delay);
  }, []);

  const connect = useCallback(() => {
    if (!alive.current) return;

    void (async () => {
      try {
        // Catch up first: whatever arrived while the socket was down is in the
        // REST history, and the ids tell us exactly where we stopped.
        if (lastId.current > 0) {
          const missed = await getNewMessages(conversationId, lastId.current);
          missed.forEach(append);
        }

        const { ticket } = await getWsTicket(conversationId);
        if (!alive.current) return;

        const socket = new WebSocket(
          `${WS_BASE_URL}/ws/conversations/${conversationId}?ticket=${encodeURIComponent(ticket)}`,
        );
        socketRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(String(event.data)) as
              | { type: "ready"; user_id: number }
              | ({ type: "message" } & Omit<ChatMessage, "mine">);
            if (frame.type === "ready") {
              myUserId.current = frame.user_id;
              attempt.current = 0;
              setConnection("online");
              return;
            }
            if (frame.type === "message") {
              append({ ...frame, mine: frame.sender_id === myUserId.current });
            }
          } catch {
            // A frame we cannot parse is not worth tearing the socket down for.
          }
        };

        socket.onerror = () => {
          // onclose always follows; retrying here too would double the backoff.
        };

        socket.onclose = () => {
          socketRef.current = null;
          if (!alive.current) return;
          scheduleRetry(connect);
        };
      } catch (cause) {
        // A refused ticket lands here. The web version returned at this point
        // and left the thread permanently dead; this schedules like any other
        // failure, and the REST history keeps the thread usable meanwhile.
        if (!alive.current) return;
        setSendError(errorMessage(cause, "Live updates are unavailable."));
        scheduleRetry(connect);
      }
    })();
  }, [conversationId, append, scheduleRetry]);

  // First load: history over REST, then the socket on top of it.
  useEffect(() => {
    alive.current = true;

    void (async () => {
      try {
        const thread = await getConversation(conversationId);
        if (!alive.current) return;
        setMessages(thread.messages);
        lastId.current = thread.messages.reduce(
          (highest, message) => Math.max(highest, message.id),
          0,
        );
        setLoading(false);
        void markConversationRead(conversationId).catch(() => undefined);
        connect();
      } catch (cause) {
        if (!alive.current) return;
        setLoadError(cause);
        setLoading(false);
      }
    })();

    return () => {
      alive.current = false;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      // 1000: a deliberate close, so the server reaps the room entry rather
      // than waiting for a timeout.
      socketRef.current?.close(1000);
      socketRef.current = null;
    };
  }, [conversationId, connect]);

  const send = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (body === "") return;

    setSendError(null);
    const socket = socketRef.current;

    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      // The server echoes the persisted message back to everyone in the room,
      // this client included, so there is nothing to insert locally.
      socket.send(JSON.stringify({ body }));
      setDraft("");
      return;
    }

    // Socket down: the REST endpoint writes the same row, so a reconnect is
    // never a prerequisite for talking.
    setSending(true);
    try {
      const message = await sendMessage(conversationId, body);
      append({ ...message, mine: true });
      setDraft("");
    } catch (cause) {
      setSendError(errorMessage(cause, "Could not send that message."));
    } finally {
      setSending(false);
    }
  }, [draft, conversationId, append]);

  if (loading) return <Loading label="Loading conversation…" />;
  if (loadError !== null) {
    return <ErrorState error={loadError} fallback="Could not open that conversation." />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <ConnectionBar state={connection} />

      <FlatList
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.mine && styles.bubbleRowMine]}>
            <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
              {!item.mine ? (
                <Text style={styles.sender}>{item.sender_name}</Text>
              ) : null}
              <Text style={item.mine ? styles.mineText : styles.theirsText}>
                {item.body}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No messages yet. Say what you need and when.
          </Text>
        }
      />

      {sendError !== null ? (
        <View style={styles.errorWrap}>
          <Alert tone="error">{sendError}</Alert>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={color.faint}
          multiline
          accessibilityLabel="Message"
          onSubmitEditing={() => void send()}
        />
        <Button
          onPress={() => void send()}
          busy={sending}
          disabled={draft.trim() === ""}
        >
          Send
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * A visible connection state, because "did my message send?" is the question
 * a chat has to answer without being asked.
 */
function ConnectionBar({ state }: { state: Connection }): React.JSX.Element | null {
  if (state === "online") return null;

  const text =
    state === "connecting"
      ? "Connecting…"
      : state === "reconnecting"
        ? "Reconnecting… messages you send will still go through."
        : "Offline. Messages will send when the connection returns.";

  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.barText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  bar: {
    backgroundColor: color.warnBg,
    borderBottomWidth: 1,
    borderBottomColor: color.warnLine,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  barText: { fontSize: type.small.fontSize, color: color.warnText },
  list: { padding: space.lg, gap: space.sm },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, padding: space.md, gap: 2 },
  mine: { backgroundColor: color.ink, borderBottomRightRadius: radius.sm },
  theirs: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    borderBottomLeftRadius: radius.sm,
  },
  mineText: { color: color.onInk, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  theirsText: { color: color.body, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  sender: { fontSize: type.micro.fontSize, fontWeight: "600", color: color.subtle },
  empty: {
    textAlign: "center",
    color: color.subtle,
    fontSize: type.small.fontSize,
    paddingVertical: space.xl,
  },
  errorWrap: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    padding: space.md,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: type.body.fontSize,
    color: color.ink,
    backgroundColor: color.surface,
  },
});
