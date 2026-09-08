/**
 * Every thread the signed-in user is part of, either side of it.
 *
 * The list refreshes whenever the tab regains focus rather than on a timer:
 * coming back from a thread is when the preview and unread count are wrong,
 * and polling a list nobody is looking at costs battery for nothing.
 */

import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Card from "../components/Card";
import Button from "../components/Button";
import { Badge } from "../components/Badge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { getConversations } from "../lib/api";
import { useSession } from "../lib/session";
import { useAsync } from "../lib/useAsync";
import { color, space, type } from "../theme";
import type { ChatStackParamList, RootTabParamList } from "../navigation/types";
import type { Conversation } from "../lib/types";

type Props = NativeStackScreenProps<ChatStackParamList, "Conversations">;

/** "2m", "4h", "Tue" - a phone list has no room for a full timestamp. */
function shortWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return new Date(then).toLocaleDateString("en-CA", { weekday: "short" });
}

export default function ChatListScreen({ navigation }: Props): React.JSX.Element {
  const { status } = useSession();
  const tabs = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const signedIn = status === "signedIn";

  const { data, error, loading, refreshing, reload } = useAsync<Conversation[]>(
    async () => (signedIn ? await getConversations() : []),
    [signedIn],
  );

  useFocusEffect(
    useCallback(() => {
      if (signedIn) void reload(true);
    }, [signedIn, reload]),
  );

  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <EmptyState
          title="Sign in to see your messages"
          body="Conversations are tied to your account, so they follow you between the app and the web."
          action={{
            label: "Sign in",
            onPress: () =>
              tabs.navigate("AccountTab", {
                screen: "Login",
                params: { reason: "Sign in to read and send messages." },
              }),
          }}
        />
      </View>
    );
  }

  if (loading) return <Loading label="Loading conversations…" />;
  if (error !== null) {
    return (
      <ErrorState
        error={error}
        fallback="Could not load your conversations."
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data ?? []}
      keyExtractor={(item) => String(item.id)}
      refreshing={refreshing}
      onRefresh={() => void reload(true)}
      ListEmptyComponent={
        <EmptyState
          title="No conversations yet"
          body="Open a listing and tap Message to start one."
          action={{
            label: "Browse listings",
            onPress: () => tabs.navigate("SearchTab", { screen: "Search" }),
          }}
        />
      }
      renderItem={({ item }) => (
        <Card
          onPress={() =>
            navigation.navigate("Thread", {
              conversationId: item.id,
              // The customer sees the business, the owner sees the customer.
              title:
                item.my_role === "customer"
                  ? item.business_name
                  : item.other_party_name,
            })
          }
          style={styles.row}
        >
          <View style={styles.rowHead}>
            <Text style={styles.title} numberOfLines={1}>
              {item.my_role === "customer"
                ? item.business_name
                : item.other_party_name}
            </Text>
            <Text style={styles.when}>{shortWhen(item.last_message_at)}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.last_message_preview ?? "No messages yet"}
          </Text>
          <View style={styles.rowFoot}>
            <Text style={styles.role}>
              {item.my_role === "customer"
                ? "You enquired"
                : `About ${item.business_name}`}
            </Text>
            {item.unread > 0 ? (
              <Badge tone="warn">{`${item.unread} unread`}</Badge>
            ) : null}
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  row: { gap: space.xs },
  rowHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: { flex: 1, fontSize: type.body.fontSize, fontWeight: "600", color: color.ink },
  when: { fontSize: type.small.fontSize, color: color.subtle },
  preview: { fontSize: type.small.fontSize, color: color.muted },
  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  role: { fontSize: type.micro.fontSize, color: color.subtle },
});
