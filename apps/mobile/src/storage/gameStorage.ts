import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  parsePersistedScorekeeperGames,
  serializePersistedScorekeeperGames,
  type ScorekeeperGame
} from "@shake2/game-engine";

export const GAMES_STORAGE_KEY = "@shake2/scorekeeper-games/v1";

export async function loadPersistedGames(): Promise<ScorekeeperGame[]> {
  const rawGames = await AsyncStorage.getItem(GAMES_STORAGE_KEY);
  return parsePersistedScorekeeperGames(rawGames);
}

export async function savePersistedGames(
  games: readonly ScorekeeperGame[]
): Promise<void> {
  await AsyncStorage.setItem(GAMES_STORAGE_KEY, serializePersistedScorekeeperGames(games));
}
