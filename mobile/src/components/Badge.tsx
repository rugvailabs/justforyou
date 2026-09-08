/**
 * Small status pills, and the listing-status one the dashboard leans on.
 *
 * The colours are the web app's: amber for waiting, emerald for live, red for
 * rejected, slate for suspended. A pill also carries its meaning as text - a
 * colour alone is not a label.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, radius, space, type } from "../theme";
import type { BusinessStatus } from "../lib/types";

type Tone = "neutral" | "info" | "good" | "warn" | "bad";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: Tone;
}): React.JSX.Element {
  return (
    <View style={[styles.pill, TONE_VIEW[tone]]}>
      <Text style={[styles.text, TONE_TEXT[tone]]}>{children}</Text>
    </View>
  );
}

const STATUS: Record<BusinessStatus, { label: string; tone: Tone; hint: string }> = {
  pending: {
    label: "Pending review",
    tone: "warn",
    hint: "Waiting on a moderator. Not in public search yet.",
  },
  approved: {
    label: "Live",
    tone: "good",
    hint: "Visible in public search.",
  },
  rejected: {
    label: "Rejected",
    tone: "bad",
    hint: "Not visible. See the moderator's note.",
  },
  suspended: {
    label: "Suspended",
    tone: "neutral",
    hint: "Taken out of search. See the moderator's note.",
  },
};

export function StatusBadge({
  status,
}: {
  status: BusinessStatus;
}): React.JSX.Element {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** The sentence under a status, for screens with room to explain. */
export function statusHint(status: BusinessStatus): string {
  return STATUS[status].hint;
}

const TONE_VIEW = StyleSheet.create({
  neutral: { backgroundColor: color.wash, borderColor: color.hairline },
  info: { backgroundColor: color.wash, borderColor: color.line },
  good: { backgroundColor: color.goodBg, borderColor: color.goodLine },
  warn: { backgroundColor: color.warnBg, borderColor: color.warnLine },
  bad: { backgroundColor: color.badBg, borderColor: color.badLine },
});

const TONE_TEXT = StyleSheet.create({
  neutral: { color: color.muted },
  info: { color: color.body },
  good: { color: color.goodText },
  warn: { color: color.warnText },
  bad: { color: color.badText },
});

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  text: { fontSize: type.micro.fontSize, fontWeight: "600" },
});
