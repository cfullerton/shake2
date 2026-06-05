import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  createMultiplayerActionEnvelope,
  createMultiplayerRoom,
  createMultiplayerStorageRecords,
  createNumericBid,
  getMultiplayerReconnectView,
  joinMultiplayerRoom,
  parseFortyTwoActionEnvelope,
  parseMultiplayerStoredGameRecords,
  restoreMultiplayerSessionFromRecords,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type SeatIndex
} from "../index.ts";

test("multiplayer schema parses JSON-roundtripped storage records", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session));
  const parsed = parseMultiplayerStoredGameRecords(records);
  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));

  assert.equal(parsed.snapshot.gameId, "game-1");
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(restored.snapshot, session.snapshot);
});

test("multiplayer schema defaults legacy participants to human kind", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  for (const participant of Object.values(records.room.room.participants) as any[]) {
    delete participant.kind;
  }

  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));

  assert.equal(restored.room.participants["player-0"]?.kind, "human");
  assert.equal(restored.room.participants["player-1"]?.kind, "human");
});

test("multiplayer schema rejects public snapshots that expose hands", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  records.snapshot.payload.snapshot.hands = session.snapshot.snapshot.phase === "dealt"
    ? session.snapshot.snapshot.hands
    : {};

  assert.throws(
    () => parseMultiplayerStoredGameRecords(records),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("multiplayer schema rejects invalid room seat indexes", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  records.room.room.seats["1"].seat = 9;

  assert.throws(
    () => parseMultiplayerStoredGameRecords(records),
    {
      code: "INVALID_SEAT"
    }
  );
});

test("multiplayer schema rejects invalid private hand dominoes", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  records.privateHands[0].hand[0] = {
    high: 7,
    low: 0
  };

  assert.throws(
    () => parseMultiplayerStoredGameRecords(records),
    {
      code: "INVALID_DOMINO"
    }
  );
});

test("multiplayer schema rejects missing event envelope fields", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  records.events[0].envelope.eventId = "";

  assert.throws(
    () => parseMultiplayerStoredGameRecords(records),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("multiplayer schema rejects unsupported action schema versions", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createNumericBid(30),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actorId: "player-1"
    },
    context
  );

  assert.throws(
    () => parseFortyTwoActionEnvelope({
      ...action,
      schemaVersion: 999
    }),
    {
      code: "SCHEMA_VERSION_UNSUPPORTED"
    }
  );
});

test("multiplayer schema parses no-trump call actions", () => {
  const parsed = parseFortyTwoActionEnvelope({
    action: {
      payload: {
        trump: {
          kind: "none"
        }
      },
      type: "fortyTwo.trump.call"
    },
    actionId: "action-no-trump",
    actorId: "player-1",
    actorSeat: 1,
    clientCreatedAt: "2026-05-30T12:00:00.000Z",
    gameId: "game-1",
    knownLastEventSequence: 8,
    knownSnapshotVersion: 8,
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  });

  assert.deepEqual(parsed.action.payload, {
    trump: {
      kind: "none"
    }
  });
});

test("multiplayer schema parses mark bid actions", () => {
  const parsed = parseFortyTwoActionEnvelope({
    action: {
      payload: {
        bid: {
          kind: "marks",
          marks: 2
        },
        seat: 1
      },
      type: "fortyTwo.bid.submit"
    },
    actionId: "action-mark-bid",
    actorId: "player-1",
    actorSeat: 1,
    clientCreatedAt: "2026-05-30T12:00:00.000Z",
    gameId: "game-1",
    knownLastEventSequence: 2,
    knownSnapshotVersion: 2,
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  });

  assert.deepEqual(parsed.action.payload, {
    bid: {
      kind: "marks",
      marks: 2
    },
    seat: 1
  });
});

test("multiplayer schema rejects malformed action idempotency records", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session)) as any;

  records.idempotency.push({
    accepted: true,
    actionId: "accepted-without-events",
    actorId: "player-1",
    eventIds: [],
    gameId: "game-1",
    pk: "ACTION#accepted-without-events",
    sk: "RESULT",
    updatedAt: "2026-05-30T12:00:00.000Z"
  });

  assert.throws(
    () => parseMultiplayerStoredGameRecords(records),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("multiplayer action submission rejects malformed actions before command routing", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createNumericBid(30),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "malformed-action",
      actorId: "player-1"
    },
    context
  );
  const result = submitMultiplayerGameAction(
    session,
    {
      ...action,
      action: {
        ...action.action,
        payload: {
          ...action.action.payload,
          seat: 9
        }
      }
    },
    context
  );

  assert.equal(result.ok, false);
  assert.equal(result.duplicate, false);
  assert.deepEqual(result.session.actionResults, {});

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_SEAT");
  }
});

test("multiplayer reconnect rejects malformed client sync state", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = toJsonValue(createMultiplayerStorageRecords(session));
  const reconnect = getMultiplayerReconnectView(
    records,
    "player-1",
    {
      connectionStatus: "sleeping",
      gameId: "game-1",
      lastAppliedEventSequence: 0,
      snapshotVersion: 0
    }
  );

  assert.equal(reconnect.ok, false);

  if (!reconnect.ok) {
    assert.equal(reconnect.error.code, "INVALID_ACTION");
  }
});

function createStartedSession(context: EngineContext): MultiplayerGameSession {
  return unwrapResult(
    startMultiplayerGame(
      createReadyRoom(context),
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1"
      },
      context
    )
  );
}

function createReadyRoom(context: EngineContext): MultiplayerRoom {
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
    },
    context
  );

  for (const playerId of ["player-1", "player-2", "player-3"]) {
    room = unwrapResult(
      joinMultiplayerRoom(
        room,
        {
          displayName: `Player ${playerId.at(-1)}`,
          playerId
        },
        context
      )
    );
  }

  for (const seat of [0, 1, 2, 3] as const) {
    room = unwrapResult(
      takeMultiplayerSeat(
        room,
        {
          playerId: playerIdForSeat(seat),
          seat
        },
        context
      )
    );
  }

  return room;
}

function playerIdForSeat(seat: SeatIndex): string {
  return `player-${seat}`;
}

function unwrapResult<TValue>(result: MultiplayerResult<TValue>): TValue {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function toJsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function createTestContext(): EngineContext {
  let id = 0;
  let randomState = 42;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `test-id-${id}`;
    },
    now: () => {
      time += 1;
      return new Date(Date.UTC(2026, 4, 30, 12, 0, 0) + time * 1000)
        .toISOString();
    },
    random: () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 0x100000000;
    }
  };
}
