/**
 * Sign in with a phone number and a one-time code.
 *
 * Same two steps and the same rules as the web form: the request response is
 * identical for known and unknown numbers, the resend button is disabled for
 * the cooldown the server hands back, and the four failure modes are told
 * apart by HTTP status rather than by parsing the message - 404 no code was
 * requested, 410 expired, 400 wrong, 429 too many tries.
 *
 * On success the token goes to the OS keystore, which is the whole difference
 * between this screen and its web counterpart.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import { errorMessage } from "../components/States";
import { ApiError, requestOtp, verifyOtp } from "../lib/api";
import { useSession } from "../lib/session";
import { color, space, type } from "../theme";
import type { AccountStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AccountStackParamList, "Login">;

/** The backend wants 10 digits, or 11 starting with 1. Check before spending a code. */
function phoneProblem(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits === "") return "Enter your phone number.";
  if (digits.length === 10) return null;
  if (digits.length === 11 && digits.startsWith("1")) return null;
  return "That does not look like a Canadian number. Use 10 digits, e.g. 604 555 0142.";
}

export default function LoginScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { signIn } = useSession();
  const reason = route.params?.reason;

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // The server enforces the real limit; this only keeps the button honest.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const codeInput = useRef<React.ComponentRef<typeof Field>>(null);

  const sendCode = useCallback(
    async (resend: boolean): Promise<void> => {
      const problem = phoneProblem(phone);
      if (problem !== null) {
        setError(problem);
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const accepted = await requestOtp(phone.trim());
        setCooldown(accepted.resend_after || 30);
        setStep("code");
        setNotice(
          resend
            ? "A new code is on its way."
            : "We sent a 6-digit code to that number.",
        );
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 429) {
          // Already sent one recently: move to the code step rather than
          // stranding someone who has the code sitting on their lock screen.
          setStep("code");
          setCooldown(30);
          setNotice("A code was already sent. Check your messages.");
        } else {
          setError(errorMessage(cause, "Could not send a code."));
        }
      } finally {
        setBusy(false);
      }
    },
    [phone],
  );

  const submitCode = useCallback(async (): Promise<void> => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const token = await verifyOtp(phone.trim(), digits, name);
      await signIn(token.access_token);
      // The session flip re-renders the tab bar; drop the login screen so Back
      // does not return to a form that no longer applies.
      navigation.goBack();
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 410) {
          setError("That code has expired. Ask for a new one.");
        } else if (cause.status === 404) {
          setError("No code was requested for that number. Send one first.");
        } else if (cause.status === 429) {
          setError("Too many attempts. Ask for a new code.");
        } else if (cause.status === 400) {
          setError("That code is not right. Check the digits and try again.");
        } else {
          setError(errorMessage(cause, "Could not verify that code."));
        }
      } else {
        setError("Could not verify that code.");
      }
    } finally {
      setBusy(false);
    }
  }, [code, phone, name, signIn, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.lede}>
          Use your phone number. We will text you a 6-digit code.
        </Text>

        {reason !== undefined ? <Alert tone="info">{reason}</Alert> : null}

        <Card style={styles.card}>
          <View style={styles.steps}>
            <Text style={[styles.step, step === "phone" && styles.stepOn]}>
              1 · Your number
            </Text>
            <Text style={styles.stepDash}>—</Text>
            <Text style={[styles.step, step === "code" && styles.stepOn]}>
              2 · Enter code
            </Text>
          </View>

          {step === "phone" ? (
            <>
              <Field
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 604 555 0142"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => void sendCode(false)}
              />
              {error !== null ? <Alert tone="error">{error}</Alert> : null}
              <Button block busy={busy} onPress={() => void sendCode(false)}>
                Send me a code
              </Button>
            </>
          ) : (
            <>
              <Text style={styles.sentTo}>
                Code sent to {phone.trim()}.{" "}
                <Text
                  style={styles.link}
                  onPress={() => {
                    setStep("phone");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Change number
                </Text>
              </Text>

              <Field
                ref={codeInput}
                label="6-digit code"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                // Lets iOS and Android offer the code straight from the SMS.
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => void submitCode()}
              />

              <Field
                label="Your name"
                hint="Only used if this number is new here."
                value={name}
                onChangeText={setName}
                placeholder="Optional"
                autoComplete="name"
              />

              {notice !== null && error === null ? (
                <Alert tone="info">{notice}</Alert>
              ) : null}
              {error !== null ? <Alert tone="error">{error}</Alert> : null}

              <Button block busy={busy} onPress={() => void submitCode()}>
                Verify and sign in
              </Button>
              <Button
                variant="ghost"
                block
                disabled={busy || cooldown > 0}
                onPress={() => void sendCode(true)}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </Button>
            </>
          )}
        </Card>

        <Text style={styles.footnote}>
          Owner and admin accounts still sign in with an email and password on
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
  steps: { flexDirection: "row", alignItems: "center", gap: space.sm },
  step: {
    fontSize: type.small.fontSize,
    fontWeight: "600",
    color: color.subtle,
    backgroundColor: color.wash,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  stepOn: { color: color.onInk, backgroundColor: color.ink },
  stepDash: { color: color.line },
  sentTo: { fontSize: type.small.fontSize, color: color.muted },
  link: { color: color.ink, textDecorationLine: "underline" },
  footnote: { fontSize: type.small.fontSize, color: color.subtle },
});
