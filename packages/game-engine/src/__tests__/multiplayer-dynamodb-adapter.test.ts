import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiplayerAcceptedActionWritePlan,
  createMultiplayerActionEnvelope,
  createMultiplayerDynamoDbTransactionWritePlan,
  createMultiplayerGameStartWritePlan,
  createMultiplayerRejectedActionWritePlan,
  createMultiplayerRoom,
  createNumericBid,
  createPassBid,
  joinMultiplayerRoom,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerDynamoDbTransactionItem,
  type MultiplayerDynamoDbTransactionWritePlan,
  type MultiplayerGameSession,
  type MultiplayerPrivateHandRecord,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerRoomRecord,
  type MultiplayerSubmitActionResult,
  type SeatIndex
} from "../index.ts";

const TABLE_NAME = "Shake2Multiplayer";

test("converts game-start write plans into deterministic transaction items", () => {
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
  const writePlan = createMultiplayerGameStartWritePlan(readyRoom, session);
  const first = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const second = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });

  assert.deepEqual(second, first);
  assert.equal(first.kind, "gameStart");
  assert.equal(first.gameId, "game-1");
  assert.equal(first.tableName, TABLE_NAME);
  assert.equal(first.transactItems.length, writePlan.operations.length);

  const roomPut = getRoomPut(first);

  assert.equal(roomPut.Put.ConditionExpression, "#pk = :pk AND #sk = :sk AND #status = :expectedStatus AND attribute_not_exists(#gameId)");
  assert.deepEqual(roomPut.Put.ExpressionAttributeValues, {
    ":expectedStatus": "ready",
    ":pk": "ROOM#room-1",
    ":sk": "META"
  });
});

test("represents duplicate action ID conflicts with idempotency put conditions", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBid(
    previousSession,
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const actionResultPut = getActionResultPut(transaction);

  assert.equal(actionResultPut.Put.Item.pk, "ACTION#bid-1");
  assert.equal(actionResultPut.Put.Item.sk, "RESULT");
  assert.equal(actionResultPut.Put.Item.accepted, true);
  assert.equal(actionResultPut.Put.ConditionExpression, "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
  assert.deepEqual(actionResultPut.Put.ExpressionAttributeNames, {
    "#pk": "pk",
    "#sk": "sk"
  });
  assert.equal(actionResultPut.Put.ExpressionAttributeValues, undefined);
});

test("represents stale snapshot/version conflicts on latest snapshot writes", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBid(
    previousSession,
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const snapshotPut = getSnapshotPut(transaction);

  assert.equal(snapshotPut.Put.ConditionExpression, "#pk = :pk AND #sk = :sk AND #gameId = :expectedGameId AND #snapshotVersion = :expectedSnapshotVersion AND #lastEventSequence = :expectedLastEventSequence");
  assert.deepEqual(snapshotPut.Put.ExpressionAttributeValues, {
    ":expectedGameId": "game-1",
    ":expectedLastEventSequence": previousSession.snapshot.lastEventSequence,
    ":expectedSnapshotVersion": previousSession.snapshot.snapshotVersion,
    ":pk": "GAME#game-1",
    ":sk": "SNAPSHOT#LATEST"
  });
});

test("represents duplicate event sequence conflicts on event appends", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBid(
    previousSession,
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const eventPuts = getEventPuts(transaction);

  assert.equal(eventPuts.length, 1);
  assert.equal(eventPuts[0]?.Put.Item.pk, "GAME#game-1");
  assert.equal(eventPuts[0]?.Put.Item.sk, "EVENT#3");
  assert.equal(eventPuts[0]?.Put.ConditionExpression, "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
});

test("represents room status mismatch conflicts on game start", () => {
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
  const writePlan = createMultiplayerGameStartWritePlan(readyRoom, session);
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const roomPut = getRoomPut(transaction);
  const roomRecord = roomPut.Put.Item as MultiplayerRoomRecord;

  assert.equal(roomRecord.status, "inGame");
  assert.equal(roomPut.Put.ConditionExpression, "#pk = :pk AND #sk = :sk AND #status = :expectedStatus AND attribute_not_exists(#gameId)");
  assert.deepEqual(roomPut.Put.ExpressionAttributeValues, {
    ":expectedStatus": "ready",
    ":pk": "ROOM#room-1",
    ":sk": "META"
  });
});

test("persists rejected actions as idempotency results without game mutations", () => {
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
    throw new Error("Expected rejected bid.");
  }

  const writePlan = createMultiplayerRejectedActionWritePlan(previousSession, result);
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const actionResultPut = getActionResultPut(transaction);

  assert.equal(transaction.kind, "rejectedAction");
  assert.equal(transaction.transactItems.length, 1);
  assert.equal(actionResultPut.Put.Item.pk, "ACTION#bad-bid");
  assert.equal(actionResultPut.Put.Item.accepted, false);
  assert.equal(actionResultPut.Put.Item.errorCode, "INVALID_BID");
  assert.equal(actionResultPut.Put.ConditionExpression, "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
});

test("keeps private hands out of public snapshot writes", () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBid(
    previousSession,
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const snapshotPut = getSnapshotPut(transaction);
  const privateHandPuts = getPrivateHandPuts(transaction);

  assert.equal(snapshotPut.Put.Item.sk, "SNAPSHOT#LATEST");
  assert.equal("hands" in snapshotPut.Put.Item.payload.snapshot, false);
  assert.equal("viewerHand" in snapshotPut.Put.Item.payload.snapshot, false);
  assert.equal(privateHandPuts.length, 4);
  assert.equal(
    privateHandPuts.every((put) =>
      Array.isArray((put.Put.Item as MultiplayerPrivateHandRecord).hand)
    ),
    true
  );
  assert.equal(privateHandPuts.every((put) => put.Put.ConditionExpression === undefined), true);
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

function submitSeatBid(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  bid: ReturnType<typeof createPassBid> | ReturnType<typeof createNumericBid>,
  actionId: string,
  context: EngineContext
): Extract<MultiplayerSubmitActionResult, { readonly ok: true }> {
  return unwrapSubmit(
    submitMultiplayerGameAction(
      session,
      createMultiplayerActionEnvelope(
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
      ),
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

function getRoomPut(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): MultiplayerDynamoDbTransactionItem {
  return getSinglePut(transaction, (item) => item.Put.Item.sk === "META");
}

function getSnapshotPut(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): MultiplayerDynamoDbTransactionItem {
  return getSinglePut(
    transaction,
    (item) => item.Put.Item.sk === "SNAPSHOT#LATEST"
  );
}

function getActionResultPut(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): MultiplayerDynamoDbTransactionItem {
  return getSinglePut(transaction, (item) =>
    String(item.Put.Item.pk).startsWith("ACTION#")
  );
}

function getEventPuts(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): readonly MultiplayerDynamoDbTransactionItem[] {
  return transaction.transactItems.filter((item) =>
    String(item.Put.Item.sk).startsWith("EVENT#")
  );
}

function getPrivateHandPuts(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): readonly MultiplayerDynamoDbTransactionItem[] {
  return transaction.transactItems.filter((item) =>
    String(item.Put.Item.sk).startsWith("PRIVATE_HAND#")
  );
}

function getSinglePut(
  transaction: MultiplayerDynamoDbTransactionWritePlan,
  predicate: (item: MultiplayerDynamoDbTransactionItem) => boolean
): MultiplayerDynamoDbTransactionItem {
  const matches = transaction.transactItems.filter(predicate);

  assert.equal(matches.length, 1);

  const match = matches[0];

  if (!match) {
    throw new Error("Missing transaction item.");
  }

  return match;
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
