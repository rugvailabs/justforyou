/**
 * A rating, or an honest "no reviews yet".
 *
 * `rating` is null for a listing nobody has reviewed. The web app renders that
 * as words rather than five empty stars, because an unrated business and a
 * one-star business are not the same thing and must not look alike.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, space, type } from "../theme";

interface Props {
  rating: number | null;
  reviewCount?: number;
  /** Hide the "(12)" suffix - for tight rows where the count has its own slot. */
  showCount?: boolean;
  size?: "sm" | "md";
}

export default function RatingStars({
  rating,
  reviewCount,
  showCount = true,
  size = "md",
}: Props): React.JSX.Element {
  const starSize = size === "sm" ? 13 : 15;

  if (rating === null) {
    return (
      <Text style={styles.none} accessibilityRole="text">
        No reviews yet
      </Text>
    );
  }

  const rounded = Math.round(rating);
  const label =
    reviewCount === undefined
      ? `Rated ${rating.toFixed(1)} out of 5`
      : `Rated ${rating.toFixed(1)} out of 5 from ${reviewCount} reviews`;

  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Text style={[styles.stars, { fontSize: starSize }]} accessibilityElementsHidden>
        {"★".repeat(rounded)}
        <Text style={styles.empty}>{"☆".repeat(5 - rounded)}</Text>
      </Text>
      <Text style={[styles.value, { fontSize: starSize }]}>{rating.toFixed(1)}</Text>
      {showCount && reviewCount !== undefined ? (
        <Text style={styles.count}>({reviewCount})</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  stars: { color: color.star, letterSpacing: 1 },
  empty: { color: color.line },
  value: { color: color.body, fontWeight: "600" },
  count: { fontSize: type.small.fontSize, color: color.subtle },
  none: { fontSize: type.small.fontSize, color: color.subtle },
});
