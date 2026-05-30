import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SCOREKEEPER_STORAGE_SCHEMA_VERSION,
  createScorekeeperGame,
  serializePersistedScorekeeperGames
} from "@shake2/game-engine";

import {
  GAMES_STORAGE_KEY,
  loadPersistedGames,
  savePersistedGames
} from "../gameStorage";

const testGame = createScorekeeperGame({
  createdAt: "2026-05-29T12:00:00.000Z",
  dealer: "north",
  id: "game-storage-test",
  name: "Storage Test",
  targetMarks: 7
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("gameStorage", () => {
  it("saves and loads a versioned scorekeeper envelope", async () => {
    await savePersistedGames([testGame]);

    const rawValue = await AsyncStorage.getItem(GAMES_STORAGE_KEY);
    const savedValue = JSON.parse(rawValue ?? "{}") as {
      schemaVersion?: number;
      games?: unknown[];
    };

    expect(savedValue.schemaVersion).toBe(SCOREKEEPER_STORAGE_SCHEMA_VERSION);
    expect(savedValue.games).toHaveLength(1);
    await expect(loadPersistedGames()).resolves.toEqual([testGame]);
  });

  it("loads legacy raw game arrays", async () => {
    await AsyncStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify([testGame]));

    await expect(loadPersistedGames()).resolves.toEqual([testGame]);
  });

  it("drops corrupt or unsupported local data", async () => {
    await AsyncStorage.setItem(GAMES_STORAGE_KEY, "{bad-json");
    await expect(loadPersistedGames()).resolves.toEqual([]);

    await AsyncStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({
        games: [testGame],
        savedAt: "2026-05-29T12:00:00.000Z",
        schemaVersion: SCOREKEEPER_STORAGE_SCHEMA_VERSION + 1
      })
    );
    await expect(loadPersistedGames()).resolves.toEqual([]);
  });

  it("surfaces AsyncStorage write failures", async () => {
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("AsyncStorage unavailable"));

    await expect(savePersistedGames([testGame])).rejects.toThrow(
      "AsyncStorage unavailable"
    );
  });

  it("loads values produced by the engine serializer", async () => {
    await AsyncStorage.setItem(
      GAMES_STORAGE_KEY,
      serializePersistedScorekeeperGames([testGame], "2026-05-29T12:01:00.000Z")
    );

    await expect(loadPersistedGames()).resolves.toEqual([testGame]);
  });
});
