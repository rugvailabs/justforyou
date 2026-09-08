/**
 * The web app's Button, as a Pressable.
 *
 * Same three variants and the same slate palette, with one change: every
 * button is at least 44pt tall. The web's 32px control is comfortable for a
 * cursor and too small for a thumb, and this is the screen size where that
 * stops being a detail.
 */

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, radius, space, TOUCH_TARGET, type } from "../theme";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

interface Props {
  children: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Shows a spinner and blocks presses. */
  busy?: boolean;
  /** Fills the row it sits in - the usual shape for a form's submit. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  busy = false,
  block = false,
  style,
  accessibilityLabel,
}: Props): React.JSX.Element {
  const inactive = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        VARIANT_VIEW[variant],
        block && styles.block,
        // No hover on a phone, so the pressed state carries the whole
        // affordance and is worth more contrast than the web's :hover.
        pressed && !inactive && PRESSED_VIEW[variant],
        inactive && styles.inactive,
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? color.onInk : color.ink}
          />
        ) : null}
        <Text style={[styles.label, VARIANT_TEXT[variant]]} numberOfLines={1}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const VARIANT_VIEW: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: color.ink },
  secondary: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  },
  ghost: { backgroundColor: "transparent" },
};

const PRESSED_VIEW: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: color.body },
  secondary: { backgroundColor: color.wash },
  ghost: { backgroundColor: color.wash },
};

const VARIANT_TEXT = StyleSheet.create({
  primary: { color: color.onInk },
  secondary: { color: color.ink },
  ghost: { color: color.body },
});

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  sm: { paddingHorizontal: space.md, minHeight: TOUCH_TARGET },
  md: { paddingHorizontal: space.lg },
  block: { alignSelf: "stretch" },
  inactive: { opacity: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { fontSize: type.body.fontSize, fontWeight: "600" },
});
