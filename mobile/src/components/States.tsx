/**
 * The three things a screen shows when it has no content: loading, empty, or
 * broken.
 *
 * Step 7 on the web made these consistent, and the reasoning carries over: an
 * empty result and a failed request look identical if you only render "nothing
 * here", and the fix for one is not the fix for the other. Errors say what
 * went wrong and offer the retry; empty states say what would fill the space.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import Button from "./Button";
import { ApiError } from "../lib/api";
import { color, space, type } from "../theme";

export function Loading({ label = "Loading…" }: { label?: string }): React.JSX.Element {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={color.subtle} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {body !== undefined ? <Text style={styles.muted}>{body}</Text> : null}
      {action !== undefined ? (
        <Button variant="secondary" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

/**
 * Turn a thrown value into a sentence worth showing.
 *
 * "Could not reach the server" and "the server said no" need different
 * responses from the person reading them, so they get different wording.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return "Could not reach the server. Check your connection and try again.";
    }
    return error.message;
  }
  return fallback;
}

export function ErrorState({
  error,
  fallback = "Something went wrong.",
  onRetry,
}: {
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Could not load this</Text>
      <Text style={styles.muted}>{errorMessage(error, fallback)}</Text>
      {onRetry !== undefined ? (
        <Button variant="secondary" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  title: {
    fontSize: type.heading.fontSize,
    fontWeight: "600",
    color: color.ink,
    textAlign: "center",
  },
  muted: {
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    color: color.subtle,
    textAlign: "center",
  },
});
