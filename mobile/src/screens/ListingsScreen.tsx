/**
 * The owner's listings - the read half of web/app/dashboard.
 *
 * No create or edit form: that stays on the web for phase one, and a dashboard
 * that pretends otherwise would be worse than one that says so. What an owner
 * needs on a phone is the thing that changes hour to hour - whether a listing
 * is live, and who has been in touch.
 */

import React, { useCallback } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Card from "../components/Card";
import RatingStars from "../components/RatingStars";
import { StatusBadge, statusHint } from "../components/Badge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { getMyBusinesses } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { color, space, type } from "../theme";
import type { OwnerStackParamList } from "../navigation/types";
import type { BusinessOwnerItem } from "../lib/types";

type Props = NativeStackScreenProps<OwnerStackParamList, "Listings">;

export default function ListingsScreen({ navigation }: Props): React.JSX.Element {
  const { data, error, loading, refreshing, reload } = useAsync<BusinessOwnerItem[]>(
    getMyBusinesses,
    [],
  );

  // A moderator's decision can land while the app is open, so returning to
  // this screen re-reads rather than showing yesterday's status.
  useFocusEffect(
    useCallback(() => {
      void reload(true);
    }, [reload]),
  );

  if (loading) return <Loading label="Loading your listings…" />;
  if (error !== null) {
    return (
      <ErrorState
        error={error}
        fallback="Could not load your listings."
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
          title="No listings yet"
          body="Add your business on the web and it will show up here once it is submitted."
        />
      }
      renderItem={({ item }) => (
        <Card
          style={styles.card}
          onPress={() =>
            navigation.navigate("Leads", { businessId: item.id, name: item.name })
          }
          accessibilityLabel={`${item.name}, ${item.status}. Open leads.`}
        >
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <StatusBadge status={item.status} />
          </View>

          <Text style={styles.meta}>
            {item.city}, {item.province}
          </Text>

          <RatingStars rating={item.rating} reviewCount={item.review_count} size="sm" />

          <Text style={styles.hint}>{statusHint(item.status)}</Text>

          {/* The moderator's note is the whole reason a rejected listing is
              actionable, so it is shown here rather than a tap away. */}
          {item.moderation_note !== null &&
          (item.status === "rejected" || item.status === "suspended") ? (
            <View style={styles.note}>
              <Text style={styles.noteLabel}>Moderator's note</Text>
              <Text style={styles.noteBody}>{item.moderation_note}</Text>
            </View>
          ) : null}

          <Text style={styles.cta}>View leads →</Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  card: { gap: space.xs },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: { flex: 1, fontSize: type.heading.fontSize, fontWeight: "600", color: color.ink },
  meta: { fontSize: type.small.fontSize, color: color.subtle },
  hint: { fontSize: type.small.fontSize, color: color.muted },
  note: {
    marginTop: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: color.warnLine,
    gap: 2,
  },
  noteLabel: { fontSize: type.micro.fontSize, fontWeight: "600", color: color.subtle },
  noteBody: { fontSize: type.small.fontSize, color: color.body },
  cta: { marginTop: space.xs, fontSize: type.small.fontSize, fontWeight: "600", color: color.ink },
});
