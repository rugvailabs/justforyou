/**
 * App root: safe areas, the session, then the tab bar.
 *
 * The splash stays up until the stored token has been checked against /me,
 * because the tab bar's shape depends on the answer - an owner gets a Business
 * tab - and a tab appearing a beat after launch reads as a glitch.
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import { SessionProvider, useSession } from "./src/lib/session";
import { color } from "./src/theme";

function Gate(): React.JSX.Element {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={color.ink} />
      </View>
    );
  }

  return <RootNavigator />;
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.canvas,
  },
});
