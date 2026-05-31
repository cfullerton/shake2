import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiplayerAcceptedActionWritePlan,
  createMultiplayerActionEnvelope,
  createMultiplayerGameStartWritePlan,
  createMultiplayerNextHandWritePlan,
  createMultiplayerRejectedActionWritePlan,
  createMultiplayerRoom,
  createMultiplayerStorageRecords,
  createNumericBid,
  createPassBid,
  joinMultiplayerRoom,
  restoreMultiplayerSessionFromRecords,
  startMultiplayerGame,
  startNextMultiplayerHand,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type FortyTwoEventEnvelope,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerStartNextHandResult,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type MultiplayerWriteOperation,
  type MultiplayerWritePlan,
  type SeatIndex
} from "../index.ts";

test("game-start write plan includes room, initial events, public snapshot, and private hands", () => {
  const context = createTestContext();
  const readyRoom = createReadyRoom(context);
  const session = unwrapResult(
    startMultiplayerGame(
      readyRoom,
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1"
      },
      context
    )
  );
  const plan = createMultiplayerGameStartWritePlan(readyRoom, session);
  const records = recordsFromGameStartPlan(plan);
  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));

  assert.equal(plan.kind, "gameStart");
  assert.equal(countOperations(plan, "putRoom"), 1);
  assert.equal(countOperations(plan, "putEvent"), 2);
  assert.equal(countOperations(plan, "putSnapshot"), 1);
  assert.equal(countOperations(plan, "putPrivateHand"), 4);
  assert.equal(countOperations(plan, "putActionResult"), 0);
  assert.deepEqual(restored.snapshot, session.snapshot);
  assert.deepEqual(restored.events, session.events);

  const roomOperation = getSingleOperation(plan, "putRoom");
  assert.deepEqual(roomOperation.condition, {
    expectedGameId: null,
    expectedStatus: "ready",
    kind: "roomStateMatches",
    pk: "ROOM#room-1",
    sk: "META"
  });

  const snapshotOperation = getSingleOperation(plan, "putSnapshot");
  assert.equal(snapshotOperation.condition.kind, "mustNotExist");
  assert.equal("hands" in snapshotOperation.record.payload.snapshot, false);
});

test("accepted action write plan includes new events, updated snapshot, private hands, and idempotency", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    previousSession,
    {
      action: {
        payload: {
          bid: createPassBid(),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "bid-1",
      actorId: "player-1"
    },
    context
  );
  const result = unwrapSubmit(
    submitMultiplayerGameAction(previousSession, action, context)
  );
  const plan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result,
    {
      actionExpiresAt: 1_800_000_000
    }
  );
  const records = applyWritePlanToRecords(
    createMultiplayerStorageRecords(previousSession),
    plan
  );
  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));

  assert.equal(plan.kind, "acceptedAction");
  assert.equal(countOperations(plan, "putRoom"), 0);
  assert.equal(countOperations(plan, "putEvent"), 1);
  assert.equal(countOperations(plan, "putSnapshot"), 1);
  assert.equal(countOperations(plan, "putPrivateHand"), 4);
  assert.equal(countOperations(plan, "putActionResult"), 1);
  assert.deepEqual(restored.snapshot, result.session.snapshot);

  const snapshotOperation = getSingleOperation(plan, "putSnapshot");
  assert.deepEqual(snapshotOperation.condition, {
    expectedLastEventSequence: previousSession.snapshot.lastEventSequence,
    expectedSnapshotVersion: previousSession.snapshot.snapshotVersion,
    gameId: "game-1",
    kind: "snapshotMatches"
  });
  assert.equal("hands" in snapshotOperation.record.payload.snapshot, false);

  const actionResultOperation = getSingleOperation(plan, "putActionResult");
  assert.equal(actionResultOperation.record.actionId, "bid-1");
  assert.equal(actionResultOperation.record.accepted, true);
  assert.equal(actionResultOperation.record.expiresAt, 1_800_000_000);
  assert.equal(actionResultOperation.condition.kind, "mustNotExist");
});

test("rejected action write plan stores rejection idempotency without mutating game state", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    previousSession,
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
  const result = submitMultiplayerGameAction(previousSession, action, context);

  assert.equal(result.ok, false);

  if (result.ok) {
    throw new Error("Expected rejected action.");
  }

  const plan = createMultiplayerRejectedActionWritePlan(previousSession, result);
  const records = applyWritePlanToRecords(
    createMultiplayerStorageRecords(previousSession),
    plan
  );
  const restored = unwrapResult(restoreMultiplayerSessionFromRecords(records));
  const restoredResult = restored.actionResults["bad-bid"];

  assert.equal(plan.kind, "rejectedAction");
  assert.equal(countOperations(plan, "putEvent"), 0);
  assert.equal(countOperations(plan, "putSnapshot"), 0);
  assert.equal(countOperations(plan, "putPrivateHand"), 0);
  assert.equal(countOperations(plan, "putActionResult"), 1);
  assert.deepEqual(restored.snapshot, previousSession.snapshot);
  assert.equal(restoredResult?.ok, false);

  if (restoredResult?.ok === false) {
    assert.equal(restoredResult.error.code, "INVALID_BID");
  }
});

test("accepted action write plan rejects forged event streams before persistence", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    previousSession,
    {
      action: {
        payload: {
          bid: createPassBid(),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "forged-bid",
      actorId: "player-1"
    },
    context
  );
  const result = unwrapSubmit(
    submitMultiplayerGameAction(previousSession, action, context)
  );
  const forgedEvents = result.events.map((event) => {
    if (event.event.type !== "fortyTwo.bid.submitted") {
      return event;
    }

    return {
      ...event,
      event: {
        ...event.event,
        payload: {
          ...event.event.payload,
          bidding: {
            ...event.event.payload.bidding,
            status: "complete"
          }
        }
      }
    } as FortyTwoEventEnvelope;
  });
  const forgedResult = {
    ...result,
    events: forgedEvents
  };

  assert.throws(
    () => createMultiplayerAcceptedActionWritePlan(previousSession, forgedResult),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("game-start write plan rejects forged initial event streams before persistence", () => {
  const context = createTestContext();
  const readyRoom = createReadyRoom(context);
  const session = unwrapResult(
    startMultiplayerGame(
      readyRoom,
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1"
      },
      context
    )
  );
  const forgedSession: MultiplayerGameSession = {
    ...session,
    events: session.events.map((event) => {
      if (event.event.type !== "fortyTwo.hand.dealt") {
        return event;
      }

      const duplicatedDomino = event.event.payload.hands[0][0];

      if (!duplicatedDomino) {
        throw new Error("Expected dealt domino.");
      }

      return {
        ...event,
        event: {
          ...event.event,
          payload: {
            ...event.event.payload,
            hands: {
              ...event.event.payload.hands,
              1: [
                duplicatedDomino,
                ...event.event.payload.hands[1].slice(1)
              ]
            }
          }
        }
      };
    })
  };

  assert.throws(
    () => createMultiplayerGameStartWritePlan(readyRoom, forgedSession),
    {
      code: "INVALID_DOMINO"
    }
  );
});

test("accepted action private-hand writes are guarded by previous snapshot expectations", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = unwrapSubmit(
    submitMultiplayerGameAction(
      previousSession,
      createMultiplayerActionEnvelope(
        previousSession,
        {
          action: {
            payload: {
              bid: createPassBid(),
              seat: 1
            },
            type: "fortyTwo.bid.submit"
          },
          actionId: "guarded-bid",
          actorId: "player-1"
        },
        context
      ),
      context
    )
  );
  const plan = createMultiplayerAcceptedActionWritePlan(previousSession, result);
  const privateHandOperations = plan.operations.filter(
    (operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: "putPrivateHand" }
    > => operation.kind === "putPrivateHand"
  );

  assert.equal(privateHandOperations.length, 4);

  for (const operation of privateHandOperations) {
    assert.deepEqual(operation.condition, {
      expectedLastEventSequence: previousSession.snapshot.lastEventSequence,
      expectedSnapshotVersion: previousSession.snapshot.snapshotVersion,
      gameId: previousSession.snapshot.gameId,
      kind: "snapshotMatches"
    });
  }
});

test("next-hand write plan appends a server deal and replaces private hands", () => {
  const context = createTestContext();
  const previousSession = createPostHandSession(context);
  const result = unwrapResult(
    startNextMultiplayerHand(
      previousSession,
      {
        actorId: "player-0"
      },
      context
    )
  );
  const plan = createMultiplayerNextHandWritePlan(previousSession, result);

  assert.equal(plan.kind, "nextHand");
  assert.equal(countOperations(plan, "putEvent"), 1);
  assert.equal(countOperations(plan, "putSnapshot"), 1);
  assert.equal(countOperations(plan, "putPrivateHand"), 4);
  assert.equal(countOperations(plan, "putActionResult"), 0);
  assert.deepEqual(
    result.events.map((event) => event.event.type),
    ["fortyTwo.hand.dealt"]
  );

  const snapshotOperation = getSingleOperation(plan, "putSnapshot");
  assert.deepEqual(snapshotOperation.condition, {
    expectedLastEventSequence: previousSession.snapshot.lastEventSequence,
    expectedSnapshotVersion: previousSession.snapshot.snapshotVersion,
    gameId: previousSession.snapshot.gameId,
    kind: "snapshotMatches"
  });

  const privateHandOperations = plan.operations.filter(
    (operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: "putPrivateHand" }
    > => operation.kind === "putPrivateHand"
  );

  for (const operation of privateHandOperations) {
    assert.deepEqual(operation.condition, snapshotOperation.condition);
    assert.equal(operation.record.handNumber, 2);
  }
});

test("next-hand write plan rejects forged non-deal result streams", () => {
  const context = createTestContext();
  const previousSession = createPostHandSession(context);
  const result = unwrapResult(
    startNextMultiplayerHand(
      previousSession,
      {
        actorId: "player-0"
      },
      context
    )
  );
  const forgedResult: MultiplayerStartNextHandResult = {
    ...result,
    events: []
  };

  assert.throws(
    () => createMultiplayerNextHandWritePlan(previousSession, forgedResult),
    {
      code: "INVALID_ACTION"
    }
  );
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

function createPostHandSession(context: EngineContext): MultiplayerGameSession {
  const session = createStartedSession(context);
  const state = session.snapshot.snapshot;

  if (state.phase !== "dealt") {
    throw new Error("Expected started session to be dealt.");
  }

  return {
    ...session,
    snapshot: {
      ...session.snapshot,
      generatedAt: context.now(),
      lastEventSequence: 30,
      snapshot: {
        createdAt: state.createdAt,
        dealer: 1,
        gameId: state.gameId,
        handNumber: 2,
        marks: state.marks,
        mode: state.mode,
        phase: "setup",
        players: state.players,
        rules: state.rules,
        schemaVersion: state.schemaVersion,
        teams: state.teams,
        updatedAt: context.now()
      },
      snapshotVersion: 30
    }
  };
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

function recordsFromGameStartPlan(
  plan: MultiplayerWritePlan
): MultiplayerStoredGameRecords {
  const room = getSingleOperation(plan, "putRoom").record;
  const snapshot = getSingleOperation(plan, "putSnapshot").record;
  const events = plan.operations
    .filter((operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: "putEvent" }
    > => operation.kind === "putEvent")
    .map((operation) => operation.record);
  const privateHands = plan.operations
    .filter((operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: "putPrivateHand" }
    > => operation.kind === "putPrivateHand")
    .map((operation) => operation.record);
  const idempotency = plan.operations
    .filter((operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: "putActionResult" }
    > => operation.kind === "putActionResult")
    .map((operation) => operation.record);

  return {
    events,
    idempotency,
    privateHands,
    room,
    snapshot
  };
}

function applyWritePlanToRecords(
  records: MultiplayerStoredGameRecords,
  plan: MultiplayerWritePlan
): MultiplayerStoredGameRecords {
  let nextRecords: MultiplayerStoredGameRecords = {
    events: [...records.events],
    idempotency: [...records.idempotency],
    privateHands: [...records.privateHands],
    room: records.room,
    snapshot: records.snapshot
  };

  for (const operation of plan.operations) {
    switch (operation.kind) {
      case "putRoom":
        nextRecords = {
          ...nextRecords,
          room: operation.record
        };
        break;
      case "putEvent":
        nextRecords = {
          ...nextRecords,
          events: [
            ...nextRecords.events,
            operation.record
          ]
        };
        break;
      case "putSnapshot":
        nextRecords = {
          ...nextRecords,
          snapshot: operation.record
        };
        break;
      case "putPrivateHand":
        nextRecords = {
          ...nextRecords,
          privateHands: replaceRecord(
            nextRecords.privateHands,
            operation.record,
            (record) => record.sk === operation.record.sk
          )
        };
        break;
      case "putActionResult":
        nextRecords = {
          ...nextRecords,
          idempotency: replaceRecord(
            nextRecords.idempotency,
            operation.record,
            (record) => record.actionId === operation.record.actionId
          )
        };
        break;
    }
  }

  return nextRecords;
}

function replaceRecord<TRecord>(
  records: readonly TRecord[],
  replacement: TRecord,
  matches: (record: TRecord) => boolean
): readonly TRecord[] {
  const existingIndex = records.findIndex(matches);

  if (existingIndex === -1) {
    return [
      ...records,
      replacement
    ];
  }

  return records.map((record, index) =>
    index === existingIndex ? replacement : record
  );
}

function getSingleOperation<TKind extends MultiplayerWriteOperation["kind"]>(
  plan: MultiplayerWritePlan,
  kind: TKind
): Extract<MultiplayerWriteOperation, { readonly kind: TKind }> {
  const operations = plan.operations.filter(
    (operation): operation is Extract<
      MultiplayerWriteOperation,
      { readonly kind: TKind }
    > => operation.kind === kind
  );

  assert.equal(operations.length, 1);

  const operation = operations[0];

  if (!operation) {
    throw new Error(`Missing ${kind} operation.`);
  }

  return operation;
}

function countOperations(
  plan: MultiplayerWritePlan,
  kind: MultiplayerWriteOperation["kind"]
): number {
  return plan.operations.filter((operation) => operation.kind === kind).length;
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
