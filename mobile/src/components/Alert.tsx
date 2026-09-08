/**
 * The web app's Alert: an inline banner, not a toast.
 *
 * A toast disappears while someone is still reading it and takes the error
 * with it. This sits where the problem is, stays until the problem is fixed,
 * and announces itself to a screen reader when it appears.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, radius, space, type } from "../theme";

type Tone = "error" | "warning" | "success" | "info";

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
}

export default function Alert({
  children,
  tone = "error",
  title,
}: Props): React.JSX.Element {
  return (
    <View
      style={[styles.box, TONE_VIEW[tone]]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      {title !== undefined ? (
        <Text style={[styles.title, TONE_TEXT[tone]]}>{title}</Text>
      ) : null}
      {typeof children === "string" ? (
        <Text style={[styles.body, TONE_TEXT[tone]]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const TONE_VIEW = StyleSheet.create({
  error: { backgroundColor: color.badBg, borderColor: color.badLine },
  warning: { backgroundColor: color.warnBg, borderColor: color.warnLine },
  success: { backgroundColor: color.goodBg, borderColor: color.goodLine },
  info: { backgroundColor: color.wash, borderColor: color.hairline },
});

const TONE_TEXT = StyleSheet.create({
  error: { color: color.badText },
  warning: { color: color.warnText },
  success: { color: color.goodText },
  info: { color: color.body },
});

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  title: { fontSize: type.label.fontSize, fontWeight: "600" },
  body: { fontSize: type.small.fontSize, lineHeight: type.small.lineHeight },
});
