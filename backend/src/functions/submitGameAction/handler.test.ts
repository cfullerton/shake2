import assert from "node:assert/strict";
import test from "node:test";

import {
  createSubmitGameActionHandler
} from "./handler.ts";
import {
  type CommitWritePlanInput,
  type LoadGameSnapshotInput,
  type LoadIdempotencyResultInput,
  type MultiplayerReconnectRecords,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import {
  createMultiplayerActionEnvelope,
  createMultiplayerRoom,
  createMultiplayerStorageRecords,
  createNumericBid,
  createPassBid,
  joinMultiplayerRoom,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameSession,
  type MultiplayerPrivateHandRecord,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerSnapshotRecord,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type SeatIndex
} from "../../game-engine.ts";
import {
  type SubmitGameActionAppSyncEvent
} from "../../types/index.ts";

const TABLE_NAME = "Shake2Multiplayer";

test("accepted action returns accepted response and commits through store", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const store = createMockStore(createMultiplayerStorageRecords(previousSession));
  const handler = createTestHandler(context, store.store);
  const action = createBidAction(previousSession, 1, createPassBid(), "bid-1", context);
  const response = await handler(createEvent(action, "player-1"));

  assert.equal(response.accepted, true);
  assert.equal(response.duplicate, false);
  assert.equal(response.committed, true);

  if (response.accepted) {
    assert.equal(response.events.length, 1);
    assert.equal(response.snapshot.snapshot.phase, "bidding");
    assert.equal(response.transaction?.kind, "acceptedAction");
  }

  assert.deepEqual(store.loadedGames, [
    {
      gameId: "game-1"
    }
  ]);
  assert.deepEqual(store.loadedIdempotency, [
    {
      actionId: "bid-1",
      gameId: "game-1"
    }
  ]);
  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0]?.writePlan.kind, "acceptedAction");
  assert.equal(store.commits[0]?.transaction.kind, "acceptedAction");
});

test("rejected action returns typed error response and commits rejection", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const store = createMockStore(createMultiplayerStorageRecords(previousSession));
  const handler = createTestHandler(context, store.store);
  const action = createBidAction(
    previousSession,
    1,
    createNumericBid(29),
    "bad-bid",
    context
  );
  const response = await handler(createEvent(action, "player-1"));

  assert.equal(response.accepted, false);
  assert.equal(response.duplicate, false);
  assert.equal(response.committed, true);

  if (!response.accepted) {
    assert.equal(response.error.code, "INVALID_BID");
    assert.equal(response.transaction?.kind, "rejectedAction");
    const persistedItems = response.transaction?.transactItems.map((item) =>
      item.Put.Item
    ) ?? [];

    assert.deepEqual(persistedItems.map((item) => item.sk), ["RESULT"]);
    assert.equal(persistedItems.some((item) => item.sk === "SNAPSHOT#LATEST"), false);
    assert.equal(persistedItems.some((item) =>
      typeof item.sk === "string" && item.sk.startsWith("EVENT#")
    ), false);
    assert.equal(persistedItems.some((item) =>
      typeof item.sk === "string" && item.sk.startsWith("PRIVATE_HAND#")
    ), false);
  }

  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0]?.writePlan.kind, "rejectedAction");
});

test("missing actor identity is rejected before persistence", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const store = createMockStore(createMultiplayerStorageRecords(previousSession));
  const handler = createTestHandler(context, store.store);
  const action = createBidAction(previousSession, 1, createPassBid(), "bid-1", context);
  const response = await handler({
    arguments: {
      input: {
        action,
        gameId: "game-1"
      }
    }
  });

  assert.equal(response.accepted, false);

  if (!response.accepted) {
    assert.equal(response.error.code, "UNAUTHENTICATED");
  }

  assert.equal(store.loadedGames.length, 0);
  assert.equal(store.commits.length, 0);
});

test("malformed action input is rejected before persistence", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const store = createMockStore(createMultiplayerStorageRecords(previousSession));
  const handler = createTestHandler(context, store.store);
  const response = await handler({
    arguments: {
      input: {
        action: {
          actionId: "malformed"
        },
        gameId: "game-1"
      }
    },
    identity: {
      playerId: "player-1"
    }
  });

  assert.equal(response.accepted, false);

  if (!response.accepted) {
    assert.equal(response.error.code, "INVALID_ACTION");
  }

  assert.equal(store.loadedGames.length, 0);
  assert.equal(store.commits.length, 0);
});

test("stale action is represented as rejected idempotency write", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const advancedSession = submitSeatBid(
    previousSession,
    1,
    createPassBid(),
    "bid-1",
    context
  );
  const store = createMockStore(createMultiplayerStorageRecords(advancedSession));
  const handler = createTestHandler(context, store.store);
  const staleAction = createBidAction(
    previousSession,
    2,
    createPassBid(),
    "stale-bid",
    context
  );
  const response = await handler(createEvent(staleAction, "player-2"));

  assert.equal(response.accepted, false);
  assert.equal(response.committed, true);

  if (!response.accepted) {
    assert.equal(response.error.code, "STALE_ACTION");
    assert.equal(response.transaction?.kind, "rejectedAction");
  }

  assert.equal(store.commits.length, 1);
  assert.equal(store.commits[0]?.writePlan.kind, "rejectedAction");
});

test("duplicate action returns duplicate response without committing", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const action = createBidAction(previousSession, 1, createPassBid(), "bid-1", context);
  const advancedSession = submitSeatBidWithAction(previousSession, action, context);
  const store = createMockStore(createMultiplayerStorageRecords(advancedSession));
  const handler = createTestHandler(context, store.store);
  const response = await handler(createEvent(action, "player-1"));

  assert.equal(response.accepted, true);
  assert.equal(response.duplicate, true);
  assert.equal(response.committed, false);

  if (response.accepted) {
    assert.equal(response.events.length, 1);
  }

  assert.equal(store.loadedGames.length, 1);
  assert.equal(store.loadedIdempotency.length, 1);
  assert.equal(store.commits.length, 0);
});

test("handler does not require AWS credentials", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const store = createMockStore(createMultiplayerStorageRecords(previousSession));
  const handler = createTestHandler(context, store.store);
  const action = createBidAction(previousSession, 1, createPassBid(), "bid-1", context);
  const response = await handler(createEvent(action, "player-1"));

  assert.equal(response.accepted, true);
  assert.equal(store.commits.length, 1);
});

function createTestHandler(
  context: EngineContext,
  store: MultiplayerStore
) {
  return createSubmitGameActionHandler({
    engineContext: context,
    resolverContext: {
      actionExpiresAt: 1_800_000_000,
      requestId: "test-request",
      tableName: TABLE_NAME
    },
    store
  });
}

function createEvent(
  action: unknown,
  playerId: string
): SubmitGameActionAppSyncEvent {
  return {
    arguments: {
      input: {
        action,
        gameId: "game-1"
      }
    },
    identity: {
      playerId
    }
  };
}

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

function createBidAction(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  bid: ReturnType<typeof createPassBid> | ReturnType<typeof createNumericBid>,
  actionId: string,
  context: EngineContext
) {
  return createMultiplayerActionEnvelope(
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
}

function submitSeatBid(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  bid: ReturnType<typeof createPassBid> | ReturnType<typeof createNumericBid>,
  actionId: string,
  context: EngineContext
): MultiplayerGameSession {
  return submitSeatBidWithAction(
    session,
    createBidAction(session, seat, bid, actionId, context),
    context
  );
}

function submitSeatBidWithAction(
  session: MultiplayerGameSession,
  action: unknown,
  context: EngineContext
): MultiplayerGameSession {
  const result = submitMultiplayerGameAction(session, action, context);

  if (!result.ok) {
    throw result.error;
  }

  return result.session;
}

interface MockStore {
  readonly commits: CommitWritePlanInput[];
  readonly loadedGames: LoadGameSnapshotInput[];
  readonly loadedIdempotency: LoadIdempotencyResultInput[];
  readonly store: MultiplayerStore;
}

function createMockStore(records: MultiplayerStoredGameRecords): MockStore {
  const commits: CommitWritePlanInput[] = [];
  const loadedGames: LoadGameSnapshotInput[] = [];
  const loadedIdempotency: LoadIdempotencyResultInput[] = [];

  return {
    commits,
    loadedGames,
    loadedIdempotency,
    store: {
      async loadGameSnapshot(input): Promise<MultiplayerStoredGameRecords> {
        loadedGames.push(input);
        return records;
      },
      async loadPublicSnapshot(): Promise<MultiplayerSnapshotRecord> {
        return records.snapshot;
      },
      async loadPrivateHand(): Promise<MultiplayerPrivateHandRecord> {
        const privateHand = records.privateHands[0];

        if (!privateHand) {
          throw new Error("Expected private hand.");
        }

        return privateHand;
      },
      async loadIdempotencyResult(
        input
      ): Promise<MultiplayerActionIdempotencyRecord | null> {
        loadedIdempotency.push(input);
        return records.idempotency.find(
          (record) => record.actionId === input.actionId
        ) ?? null;
      },
      async loadReconnectRecords(): Promise<MultiplayerReconnectRecords> {
        const privateHand = records.privateHands[0];

        return {
          idempotency: records.idempotency,
          ...(privateHand ? { privateHand } : {}),
          snapshot: records.snapshot
        };
      },
      async commitWritePlan(input): Promise<void> {
        commits.push(input);
      }
    }
  };
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
