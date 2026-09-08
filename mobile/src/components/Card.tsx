/**
 * The web app's Card: white surface, hairline border, rounded-md corners.
 *
 * Pass `onPress` to make the whole card the touch target - on a phone a row
 * that is only tappable on its title is a row people miss.
 */

import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color, radius, space } from "../theme";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export default function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
}: Props): React.JSX.Element {
  if (onPress === undefined) {
    return <View style={[styles.card, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.lg,
  },
  pressed: { backgroundColor: color.canvas },
});
