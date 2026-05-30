import assert from "node:assert/strict";
import test from "node:test";

import {
  createGameAction,
  createGameEvent,
  createGameSnapshot,
  GAME_CONTRACT_SCHEMA_VERSION,
  isGameAction,
  isGameEvent,
  isGameSnapshot
} from "../index.ts";

const now = "2026-05-29T12:00:00.000Z";

test("creates versioned game actions", () => {
  const action = createGameAction({
    actionId: "action-1",
    actorId: "actor-1",
    gameId: "game-1",
    payload: {
      marks: 1,
      teamId: "northSouth"
    },
    submittedAt: now,
    type: "scorekeeper.marks.award"
  });

  assert.equal(action.schemaVersion, GAME_CONTRACT_SCHEMA_VERSION);
  assert.equal(isGameAction(action), true);
});

test("creates versioned game events", () => {
  const event = createGameEvent({
    actionId: "action-1",
    actorId: "actor-1",
    eventId: "event-1",
    gameId: "game-1",
    occurredAt: now,
    payload: {
      handNumber: 1,
      marks: 1,
      teamId: "northSouth"
    },
    sequence: 1,
    type: "scorekeeper.marks.awarded"
  });

  assert.equal(event.schemaVersion, GAME_CONTRACT_SCHEMA_VERSION);
  assert.equal(isGameEvent(event), true);
});

test("creates versioned game snapshots", () => {
  const snapshot = createGameSnapshot({
    createdAt: now,
    gameId: "game-1",
    lastEventSequence: 1,
    snapshotId: "snapshot-1",
    state: {
      handNumber: 2
    }
  });

  assert.equal(snapshot.schemaVersion, GAME_CONTRACT_SCHEMA_VERSION);
  assert.equal(isGameSnapshot(snapshot), true);
});

test("rejects unsupported contract versions", () => {
  assert.equal(
    isGameAction({
      actionId: "action-1",
      actorId: "actor-1",
      gameId: "game-1",
      payload: {},
      schemaVersion: 999,
      submittedAt: now,
      type: "scorekeeper.score.undo"
    }),
    false
  );
});
