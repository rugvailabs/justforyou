/**
 * Who you are signed in as, and the way out.
 *
 * View-only on purpose: editing a profile is a form, and phase one keeps forms
 * on the web. What this screen owes the user is the truth about their session -
 * which account, which role, and a sign-out that actually clears the keystore.
 */

import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Button from "../components/Button";
import Card from "../components/Card";
import { Badge } from "../components/Badge";
import { EmptyState, Loading } from "../components/States";
import { useSession } from "../lib/session";
import { API_BASE_URL } from "../lib/config";
import { color, space, type } from "../theme";
import type { AccountStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AccountStackParamList, "Account">;

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  business_owner: "Business owner",
  admin: "Admin",
};

export default function AccountScreen({ navigation }: Props): React.JSX.Element {
  const { status, user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const leave = useCallback(async (): Promise<void> => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  }, [signOut]);

  if (status === "loading") return <Loading label="Checking your session…" />;

  if (status !== "signedIn" || user === null) {
    return (
      <View style={styles.screen}>
        <EmptyState
          title="You are not signed in"
          body="Sign in with your phone number to message businesses and keep your enquiries in one place."
          action={{ label: "Sign in", onPress: () => navigation.navigate("Login") }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.name}>{user.name}</Text>
        <Badge tone={user.role === "business_owner" ? "good" : "info"}>
          {ROLE_LABEL[user.role] ?? user.role}
        </Badge>

        <View style={styles.rows}>
          <Row label="Email">{user.email}</Row>
          <Row label="Phone">{user.phone ?? "Not set"}</Row>
          <Row label="Contact by">{user.preferred_contact_method}</Row>
          <Row label="Member since">
            {new Date(user.created_at).toLocaleDateString("en-CA", {
              year: "numeric",
              month: "long",
            })}
          </Row>
        </View>
      </Card>

      {user.role === "business_owner" ? (
        <Card>
          <Text style={styles.cardTitle}>Your business</Text>
          <Text style={styles.muted}>
            The Business tab shows your listings and their leads. Creating and
            editing listings is on the web for now.
          </Text>
        </Card>
      ) : null}

      {user.role === "admin" ? (
        <Card>
          <Text style={styles.cardTitle}>Moderation</Text>
          <Text style={styles.muted}>
            Approving listings and removing reviews happens on the web, where a
            decision gets the whole listing in front of it.
          </Text>
        </Card>
      ) : null}

      <Button variant="secondary" block busy={signingOut} onPress={() => void leave()}>
        Sign out
      </Button>

      {/* Useful precisely when the app is pointed at the wrong machine, which
          is the first thing to check when everything says "cannot reach". */}
      <Text style={styles.footnote}>Connected to {API_BASE_URL}</Text>
    </ScrollView>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: { gap: space.sm },
  name: { fontSize: type.title.fontSize, fontWeight: "700", color: color.ink },
  cardTitle: {
    fontSize: type.heading.fontSize,
    fontWeight: "600",
    color: color.ink,
    marginBottom: space.xs,
  },
  rows: { marginTop: space.sm },
  row: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs },
  rowLabel: { width: 110, fontSize: type.small.fontSize, color: color.subtle },
  rowValue: { flex: 1, fontSize: type.small.fontSize, color: color.body },
  muted: {
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    color: color.subtle,
  },
  footnote: { fontSize: type.micro.fontSize, color: color.faint, textAlign: "center" },
});
