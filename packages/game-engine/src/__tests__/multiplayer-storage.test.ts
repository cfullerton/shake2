import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiplayerActionEnvelope,
  createMultiplayerRoom,
  createMultiplayerStorageRecords,
  createNumericBid,
  createPassBid,
  getMultiplayerReconnectView,
  joinMultiplayerRoom,
  replayFortyTwoEvents,
  restoreMultiplayerSessionFromRecords,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type SeatIndex
} from "../index.ts";

test("multiplayer storage records split public snapshots from private hands", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = createMultiplayerStorageRecords(session);

  assert.equal(records.room.pk, "ROOM#room-1");
  assert.equal(records.room.sk, "META");
  assert.equal(records.snapshot.pk, "GAME#game-1");
  assert.equal(records.snapshot.sk, "SNAPSHOT#LATEST");
  assert.equal(records.events.length, 2);
  assert.deepEqual(
    records.events.map((record) => record.sk),
    ["EVENT#1", "EVENT#2"]
  );

  assert.equal(records.snapshot.payload.snapshot.phase, "dealt");

  if (records.snapshot.payload.snapshot.phase !== "dealt") {
    throw new Error("Expected dealt public snapshot.");
  }

  assert.equal("hands" in records.snapshot.payload.snapshot, false);
  assert.deepEqual(records.snapshot.payload.snapshot.handCounts, {
    0: 7,
    1: 7,
    2: 7,
    3: 7
  });
  assert.equal(records.privateHands.length, 4);
  assert.deepEqual(
    records.privateHands.map((record) => record.sk),
    [
      "PRIVATE_HAND#0",
      "PRIVATE_HAND#1",
      "PRIVATE_HAND#2",
      "PRIVATE_HAND#3"
    ]
  );
  assert.equal(records.privateHands.every((record) => record.hand.length === 7), true);
});

test("multiplayer storage restores a full authoritative session", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = createMultiplayerStorageRecords(session);
  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));

  assert.deepEqual(restored.room, session.room);
  assert.deepEqual(restored.events, session.events);
  assert.deepEqual(restored.snapshot, session.snapshot);
  assert.deepEqual(
    replayFortyTwoEvents(restored.initialSnapshot, restored.events),
    restored.snapshot
  );
});

test("multiplayer reconnect view returns latest redacted snapshot and accepted pending actions", () => {
  const context = createTestContext();
  const session = submitSeatBid(
    createStartedSession(context),
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const records = createMultiplayerStorageRecords(session, {
    actionExpiresAt: 1_800_000_000
  });
  const reconnect = unwrapResult(
    getMultiplayerReconnectView(
      records,
      "player-1",
      {
        connectionStatus: "reconnecting",
        gameId: "game-1",
        lastAppliedEventSequence: 0,
        pendingActionIds: ["bid-1", "missing-action"],
        snapshotVersion: 0
      }
    )
  );

  assert.equal(reconnect.requiresSnapshotRefresh, true);
  assert.equal(reconnect.serverLastEventSequence, session.snapshot.lastEventSequence);
  assert.deepEqual(reconnect.acceptedPendingActionIds, ["bid-1"]);
  assert.deepEqual(reconnect.rejectedPendingActions, []);
  assert.deepEqual(reconnect.unknownPendingActionIds, ["missing-action"]);
  assert.equal(reconnect.view.viewerSeat, 1);
  assert.equal(reconnect.view.snapshot.snapshot.phase, "bidding");

  if (reconnect.view.snapshot.snapshot.phase !== "bidding") {
    throw new Error("Expected bidding reconnect snapshot.");
  }

  assert.equal("hands" in reconnect.view.snapshot.snapshot, false);
  assert.equal(reconnect.view.snapshot.snapshot.viewerHand?.length, 7);
  assert.deepEqual(
    records.idempotency.map((record) => ({
      accepted: record.accepted,
      actionId: record.actionId,
      actorId: record.actorId,
      expiresAt: record.expiresAt
    })),
    [
      {
        accepted: true,
        actionId: "bid-1",
        actorId: "player-1",
        expiresAt: 1_800_000_000
      }
    ]
  );
});

test("multiplayer reconnect view reports rejected pending actions", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createNumericBid(29),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "bad-bid",
      actorId: "player-1"
    },
    context
  );
  const rejected = submitMultiplayerGameAction(session, action, context);

  assert.equal(rejected.ok, false);

  const records = createMultiplayerStorageRecords(rejected.session);
  const reconnect = unwrapResult(
    getMultiplayerReconnectView(
      records,
      "player-1",
      {
        connectionStatus: "reconnecting",
        gameId: "game-1",
        lastAppliedEventSequence: rejected.session.snapshot.lastEventSequence,
        pendingActionIds: ["bad-bid"],
        snapshotVersion: rejected.session.snapshot.snapshotVersion
      }
    )
  );

  assert.equal(reconnect.requiresSnapshotRefresh, false);
  assert.deepEqual(reconnect.acceptedPendingActionIds, []);
  assert.deepEqual(reconnect.rejectedPendingActions, [
    {
      actionId: "bad-bid",
      errorCode: "INVALID_BID"
    }
  ]);
  assert.deepEqual(reconnect.unknownPendingActionIds, []);
});

test("multiplayer storage restore rejects missing private hands", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = createMultiplayerStorageRecords(session);
  const brokenRecords: MultiplayerStoredGameRecords = {
    ...records,
    privateHands: records.privateHands.filter((record) => record.seatIndex !== 3)
  };
  const restored = restoreMultiplayerSessionFromRecords(brokenRecords);

  assert.equal(restored.ok, false);

  if (!restored.ok) {
    assert.equal(restored.error.code, "GAME_NOT_FOUND");
  }
});

test("multiplayer storage restore rejects forged trusted event records", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = createMultiplayerStorageRecords(session);
  const forgedRecords: MultiplayerStoredGameRecords = {
    ...records,
    events: records.events.map((record) => {
      if (record.envelope.event.type !== "fortyTwo.hand.dealt") {
        return record;
      }

      const duplicatedDomino = record.envelope.event.payload.hands[0][0];

      if (!duplicatedDomino) {
        throw new Error("Expected dealt domino.");
      }

      const forgedPayload = {
        ...record.envelope.event.payload,
        hands: {
          ...record.envelope.event.payload.hands,
          1: [
            duplicatedDomino,
            ...record.envelope.event.payload.hands[1].slice(1)
          ]
        }
      };

      return {
        ...record,
        envelope: {
          ...record.envelope,
          event: {
            ...record.envelope.event,
            payload: forgedPayload
          }
        },
        payload: forgedPayload
      };
    })
  };
  const restored = restoreMultiplayerSessionFromRecords(forgedRecords);

  assert.equal(restored.ok, false);

  if (!restored.ok) {
    assert.equal(restored.error.code, "INVALID_DOMINO");
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

function submitSeatBid(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  bid: ReturnType<typeof createNumericBid> | ReturnType<typeof createPassBid>,
  actionId: string,
  context: EngineContext
): MultiplayerGameSession {
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid,
          seat
        },
        type: "fortyTwo.bid.submit"
      },
      actionId,
      actorId: playerIdForSeat(seat)
    },
    context
  );

  return unwrapSubmit(
    submitMultiplayerGameAction(session, action, context)
  ).session;
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

function unwrapSubmit(
  result: MultiplayerSubmitActionResult
): Extract<MultiplayerSubmitActionResult, { readonly ok: true }> {
  if (!result.ok) {
    throw result.error;
  }

  return result;
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
