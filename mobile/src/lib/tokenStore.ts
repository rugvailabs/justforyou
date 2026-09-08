/**
 * Where the JWT lives on a phone.
 *
 * The web app keeps the token in an httpOnly cookie precisely so that page
 * JavaScript cannot read it. A phone has no cookie jar with that property, and
 * AsyncStorage is a plain file inside the app sandbox - readable on a rooted
 * or jailbroken device, and swept up by some backup tooling. The equivalent
 * trust boundary here is the OS keystore: Keychain on iOS, EncryptedSharedPre-
 * ferences (Keystore-backed) on Android, which is what expo-secure-store wraps.
 *
 * Reads are cached in memory because every authenticated request needs the
 * token and a keystore round trip is not free.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "jd_access_token";

/** Mirrors the cookie name the web app uses, for anyone grepping both apps. */
export const ACCESS_TOKEN_KEY = KEY;

let cached: string | null | undefined;

/**
 * expo-secure-store has no web implementation - it throws on import use. Expo
 * web only exists here as a development convenience, so it falls back to
 * localStorage and is explicitly not a supported target for real accounts.
 */
const webStore = {
  get: (): string | null => {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  },
  set: (value: string): void => {
    try {
      globalThis.localStorage?.setItem(KEY, value);
    } catch {
      /* private mode: the session simply does not survive a reload */
    }
  },
  remove: (): void => {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
  },
};

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;

  if (Platform.OS === "web") {
    cached = webStore.get();
    return cached;
  }

  try {
    cached = await SecureStore.getItemAsync(KEY);
  } catch {
    // A corrupt keystore entry must not brick the app: treat it as signed out.
    cached = null;
  }
  return cached;
}

export async function setToken(token: string): Promise<void> {
  cached = token;
  if (Platform.OS === "web") {
    webStore.set(token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token, {
    // Available after first unlock, so a backgrounded app can still refresh.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearToken(): Promise<void> {
  cached = null;
  if (Platform.OS === "web") {
    webStore.remove();
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* already gone */
  }
}

/** Test seam: drops the in-memory copy without touching the keystore. */
export function resetTokenCache(): void {
  cached = undefined;
}
