import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ScorekeeperGame } from "@shake2/game-engine";

const GAMES_STORAGE_KEY = "@shake2/scorekeeper-games/v1";

export async function loadPersistedGames(): Promise<ScorekeeperGame[]> {
  const rawGames = await AsyncStorage.getItem(GAMES_STORAGE_KEY);

  if (!rawGames) {
    return [];
  }

  const parsed = JSON.parse(rawGames) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isPersistedGame);
}

export async function savePersistedGames(
  games: readonly ScorekeeperGame[]
): Promise<void> {
  await AsyncStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games));
}

function isPersistedGame(value: unknown): value is ScorekeeperGame {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeGame = value as Partial<ScorekeeperGame>;

  return (
    typeof maybeGame.id === "string" &&
    typeof maybeGame.name === "string" &&
    typeof maybeGame.targetMarks === "number" &&
    typeof maybeGame.updatedAt === "string" &&
    Array.isArray(maybeGame.history)
  );
}
