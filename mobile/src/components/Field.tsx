/**
 * A labelled text input.
 *
 * The web app replaced every hand-rolled input with one shared style because
 * each copy had reinvented the focus state, usually badly. Same idea here: the
 * focused border is a real, visible change rather than a one-pixel tint, which
 * matters more on a phone where the keyboard hides half the form.
 */

import React, { forwardRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { color, radius, space, TOUCH_TARGET, type } from "../theme";

interface Props extends TextInputProps {
  label?: string;
  /** Shown under the field, in red - a validation message, not a hint. */
  error?: string | null;
  /** Shown under the field in grey when there is no error. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const Field = forwardRef<TextInput, Props>(function Field(
  { label, error, hint, containerStyle, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label !== undefined ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={color.faint}
        style={[
          styles.input,
          focused && styles.focused,
          error ? styles.errored : null,
          style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        accessibilityLabel={label}
        {...rest}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint !== undefined ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export default Field;

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  label: {
    fontSize: type.label.fontSize,
    fontWeight: "600",
    color: color.body,
  },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: type.body.fontSize,
    color: color.ink,
  },
  focused: { borderColor: color.ink, borderWidth: 2 },
  errored: { borderColor: color.badText },
  error: { fontSize: type.small.fontSize, color: color.badText },
  hint: { fontSize: type.small.fontSize, color: color.subtle },
});
