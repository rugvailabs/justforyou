/**
 * The leads inbox for one listing, newest first.
 *
 * Read-only, and the phone number is the point: a lead an owner can call back
 * with one tap is worth more than one they have to copy out. Call-clicks carry
 * no message by design - they record that somebody asked for the number - so
 * they are labelled rather than shown as an empty enquiry.
 */

import React, { useCallback, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Button from "../components/Button";
import Card from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { getEnquiries } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { color, radius, space, type } from "../theme";
import type { OwnerStackParamList } from "../navigation/types";
import type { EnquiryOut, EnquiryType } from "../lib/types";

type Props = NativeStackScreenProps<OwnerStackParamList, "Leads">;

const FILTERS: { value: EnquiryType | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "quote", label: "Quotes" },
  { value: "callback", label: "Callbacks" },
  { value: "call_click", label: "Call clicks" },
  { value: "chat", label: "Chat" },
];

const TYPE_LABEL: Record<EnquiryType, string> = {
  call_click: "Tapped to call",
  callback: "Callback request",
  quote: "Quote request",
  chat: "Started a chat",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-CA", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default function LeadsScreen({ route }: Props): React.JSX.Element {
  const { businessId, name } = route.params;
  const [filter, setFilter] = useState<EnquiryType | undefined>(undefined);

  const { data, error, loading, refreshing, reload } = useAsync<EnquiryOut[]>(
    () => getEnquiries(businessId, { enquiry_type: filter, limit: 100 }),
    [businessId, filter],
  );

  const callBack = useCallback((phone: string) => {
    void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
  }, []);

  if (loading) return <Loading label="Loading leads…" />;
  if (error !== null) {
    return (
      <ErrorState
        error={error}
        fallback="Could not load leads for this listing."
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(item) => item.value ?? "all"}
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <Button
            size="sm"
            variant={filter === item.value ? "primary" : "secondary"}
            onPress={() => setFilter(item.value)}
            style={styles.chip}
          >
            {item.label}
          </Button>
        )}
      />

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={() => void reload(true)}
        ListEmptyComponent={
          <EmptyState
            title="No leads yet"
            body={`When somebody calls or asks ${name} for a quote, it lands here.`}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.head}>
              <Badge tone={item.enquiry_type === "call_click" ? "info" : "warn"}>
                {TYPE_LABEL[item.enquiry_type]}
              </Badge>
              <Text style={styles.when}>{formatWhen(item.created_at)}</Text>
            </View>

            {item.message !== null ? (
              <Text style={styles.message}>{item.message}</Text>
            ) : (
              <Text style={styles.muted}>
                No message - they asked for your number.
              </Text>
            )}

            <Text style={styles.contact}>
              {item.contact_name ?? (item.user_id !== null ? "Signed-in customer" : "Anonymous")}
              {item.contact_email !== null ? ` · ${item.contact_email}` : ""}
            </Text>

            {item.contact_phone !== null ? (
              <Button size="sm" variant="secondary" onPress={() => callBack(item.contact_phone as string)}>
                {`📞 ${item.contact_phone}`}
              </Button>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  filters: {
    flexGrow: 0,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  filterRow: { gap: space.sm, padding: space.md },
  chip: { borderRadius: radius.pill },
  content: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  card: { gap: space.sm },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  when: { fontSize: type.small.fontSize, color: color.subtle },
  message: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.body,
  },
  muted: { fontSize: type.small.fontSize, color: color.subtle, fontStyle: "italic" },
  contact: { fontSize: type.small.fontSize, color: color.muted },
});
