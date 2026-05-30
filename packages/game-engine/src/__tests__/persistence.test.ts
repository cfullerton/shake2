import assert from "node:assert/strict";
import test from "node:test";

import {
  awardMarks,
  createScorekeeperGame,
  parsePersistedScorekeeperGames,
  SCOREKEEPER_STORAGE_SCHEMA_VERSION,
  serializePersistedScorekeeperGames
} from "../index.js";

const createdAt = "2026-05-29T12:00:00.000Z";

test("serializes scorekeeper games in a versioned envelope", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1"
  });
  const rawValue = serializePersistedScorekeeperGames(
    [game],
    "2026-05-29T12:05:00.000Z"
  );
  const parsedEnvelope = JSON.parse(rawValue) as {
    schemaVersion?: number;
    savedAt?: string;
    games?: unknown[];
  };

  assert.equal(parsedEnvelope.schemaVersion, SCOREKEEPER_STORAGE_SCHEMA_VERSION);
  assert.equal(parsedEnvelope.savedAt, "2026-05-29T12:05:00.000Z");
  assert.deepEqual(parsePersistedScorekeeperGames(rawValue), [game]);
});

test("migrates legacy raw game arrays", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1"
  });

  assert.deepEqual(parsePersistedScorekeeperGames(JSON.stringify([game])), [game]);
});

test("returns no games for corrupt or unsupported persistence data", () => {
  assert.deepEqual(parsePersistedScorekeeperGames("{not-json"), []);
  assert.deepEqual(
    parsePersistedScorekeeperGames(
      JSON.stringify({
        schemaVersion: 999,
        games: []
      })
    ),
    []
  );
  assert.deepEqual(
    parsePersistedScorekeeperGames(
      JSON.stringify({
        schemaVersion: SCOREKEEPER_STORAGE_SCHEMA_VERSION,
        games: [{ id: "broken-game" }]
      })
    ),
    []
  );
});

test("accepts legacy score entries without dealer values", () => {
  const game = awardMarks(
    createScorekeeperGame({
      createdAt,
      id: "game-1"
    }),
    {
      createdAt: "2026-05-29T12:05:00.000Z",
      id: "entry-1",
      marks: 1,
      teamId: "northSouth"
    }
  );
  const historyWithoutDealer = game.history.map(({ dealer: _dealer, ...entry }) => entry);
  const legacyGame = {
    ...game,
    history: historyWithoutDealer
  };

  const parsedGames = parsePersistedScorekeeperGames(JSON.stringify([legacyGame]));

  assert.equal(parsedGames.length, 1);
  assert.equal(parsedGames[0]?.history[0]?.dealer, undefined);
});
