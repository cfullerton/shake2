import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CognitoAuthSession } from "./auth";

export const MULTIPLAYER_SESSION_STORAGE_KEY = "@shake2/multiplayer-session/v1";

export async function saveMultiplayerSession(
  session: CognitoAuthSession
): Promise<void> {
  await AsyncStorage.setItem(
    MULTIPLAYER_SESSION_STORAGE_KEY,
    JSON.stringify(session)
  );
}

export async function loadMultiplayerSession(): Promise<CognitoAuthSession | null> {
  const raw = await AsyncStorage.getItem(MULTIPLAYER_SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearMultiplayerSession(): Promise<void> {
  await AsyncStorage.removeItem(MULTIPLAYER_SESSION_STORAGE_KEY);
}

function isValidSession(value: unknown): value is CognitoAuthSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.accessToken === "string" &&
    typeof record.expiresAt === "number" &&
    typeof record.idToken === "string" &&
    typeof record.tokenType === "string" &&
    typeof record.username === "string"
  );
}
