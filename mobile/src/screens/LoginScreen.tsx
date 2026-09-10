/**
 * Sign in, or create an account, with an email and a password.
 *
 * This screen used to be a two-step phone/one-time-code flow, which was the
 * app's only way in. That is removed: there is one credential pair now, the
 * same one the web app uses, and a mobile number is a contact detail collected
 * at sign-up rather than a way to authenticate.
 *
 * On success the token goes to the OS keystore, which is the whole difference
 * between this screen and its web counterpart - the web app puts it in an
 * httpOnly cookie because a browser cannot keep a secret any other way.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import { errorMessage } from "../components/States";
import { ApiError, login, signup } from "../lib/api";
import { useSession } from "../lib/session";
import { color, radius, space, type } from "../theme";
import type { AccountStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AccountStackParamList, "Login">;

type Mode = "login" | "signup";

/** Checked here only to save a round trip; the backend enforces all of it. */
function problemWith(
  mode: Mode,
  fields: { name: string; email: string; password: string; phone: string },
): string | null {
  if (!fields.email.includes("@")) return "Enter your email address.";
  if (fields.password.length === 0) return "Enter your password.";
  if (mode === "login") return null;

  if (fields.name.trim() === "") return "Enter your name.";
  // 8-72 is what the backend accepts; bcrypt truncates past 72 bytes.
  if (fields.password.length < 8) return "Your password needs at least 8 characters.";
  if (fields.phone.replace(/\D/g, "").length < 10) {
    return "Enter your mobile number, 10 digits - e.g. 604 555 0142.";
  }
  return null;
}

export default function LoginScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { signIn } = useSession();
  const reason = route.params?.reason;

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordInput = useRef<TextInput>(null);

  const submit = useCallback(async (): Promise<void> => {
    const problem = problemWith(mode, { name, email, password, phone });
    if (problem !== null) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const token =
        mode === "signup"
          ? await signup({
              name: name.trim(),
              email: email.trim(),
              password,
              phone: phone.trim(),
              role: "customer",
            })
          : await login({ email: email.trim(), password });

      await signIn(token.access_token);
      // The session flip re-renders the tab bar; drop the login screen so Back
      // does not return to a form that no longer applies.
      navigation.goBack();
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) {
          setError("That email and password do not match an account.");
        } else if (cause.status === 409) {
          setError("An account already exists for that email. Sign in instead.");
        } else {
          setError(errorMessage(cause, "Could not sign you in."));
        }
      } else {
        setError("Could not reach the server. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [mode, name, email, password, phone, signIn, navigation]);

  const isSignup = mode === "signup";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{isSignup ? "Create an account" : "Sign in"}</Text>
        <Text style={styles.lede}>
          {isSignup
            ? "Your email and password are how you sign in. Your mobile number is how a business reaches you."
            : "Use the email and password you registered with."}
        </Text>

        {reason !== undefined ? <Alert tone="info">{reason}</Alert> : null}

        <Card style={styles.card}>
          {/* Two modes of one form: what you have typed survives the switch. */}
          <View style={styles.tabs}>
            {(
              [
                ["login", "Sign in"],
                ["signup", "Create account"],
              ] as [Mode, string][]
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === value }}
                onPress={() => {
                  setMode(value);
                  setError(null);
                }}
                style={[styles.tab, mode === value && styles.tabOn]}
              >
                <Text style={[styles.tabText, mode === value && styles.tabTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {isSignup ? (
            <Field
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Nadia Osei"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
          ) : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.ca"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordInput.current?.focus()}
          />

          <Field
            ref={passwordInput}
            label="Password"
            hint={isSignup ? "At least 8 characters." : undefined}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isSignup ? "new-password" : "current-password"}
            textContentType={isSignup ? "newPassword" : "password"}
            returnKeyType={isSignup ? "next" : "go"}
            onSubmitEditing={isSignup ? undefined : () => void submit()}
          />

          {isSignup ? (
            <Field
              label="Mobile number"
              // Said plainly: a required number on a sign-up form reads as
              // "we will text you a code", and that is what it is not.
              hint="For businesses to reach you. You sign in with your email and password, never a code sent here."
              value={phone}
              onChangeText={setPhone}
              placeholder="604 555 0142"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          ) : null}

          {error !== null ? <Alert tone="error">{error}</Alert> : null}

          <Button block busy={busy} onPress={() => void submit()}>
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </Card>

        <Text style={styles.footnote}>
          Owner and admin accounts use the same email and password here as on
          the web.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  title: { fontSize: type.title.fontSize, fontWeight: "700", color: color.ink },
  lede: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.muted,
  },
  card: { gap: space.md },
  tabs: { flexDirection: "row", gap: space.sm },
  tab: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
  },
  tabOn: { backgroundColor: color.ink, borderColor: color.ink },
  tabText: { fontSize: type.small.fontSize, fontWeight: "600", color: color.muted },
  tabTextOn: { color: color.onInk },
  footnote: { fontSize: type.small.fontSize, color: color.subtle },
});
