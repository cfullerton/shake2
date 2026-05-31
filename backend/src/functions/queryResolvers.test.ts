import assert from "node:assert/strict";
import test from "node:test";

import { BackendResolverError } from "../errors/errors.ts";
import {
  createMultiplayerRoom,
  createMultiplayerStorageRecords,
  joinMultiplayerRoom,
  startMultiplayerGame,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameSession,
  type MultiplayerPrivateHandRecord,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerSnapshotRecord,
  type MultiplayerStoredGameRecords,
  type SeatIndex
} from "../game-engine.ts";
import {
  type CommitWritePlanInput,
  type LoadGameSnapshotInput,
  type LoadIdempotencyResultInput,
  type LoadPrivateHandInput,
  type LoadPublicSnapshotInput,
  type LoadReconnectRecordsInput,
  type MultiplayerReconnectRecords,
  type MultiplayerStore
} from "../dynamodb/store.ts";
import {
  createGetGameSnapshotHandler
} from "./getGameSnapshot/handler.ts";
import {
  createGetMyPrivateHandHandler
} from "./getMyPrivateHand/handler.ts";
import {
  createGetReconnectViewHandler
} from "./getReconnectView/handler.ts";

test("public snapshot resolver never returns hands or viewerHand", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetGameSnapshotHandler({
    store: store.store
  });
  const response = await handler({
    arguments: {
      gameId: "game-1"
    },
    identity: {
      playerId: "player-0"
    }
  });
  const serialized = JSON.stringify(response);

  assert.equal(response.gameId, "game-1");
  assert.equal(response.phase, "dealt");
  assert.deepEqual(response.handCounts, {
    seat0: 7,
    seat1: 7,
    seat2: 7,
    seat3: 7
  });
  assert.doesNotMatch(serialized, /"hands"/);
  assert.doesNotMatch(serialized, /"viewerHand"/);
  assert.equal(store.loadPublicSnapshotCalls.length, 1);
  assert.deepEqual(store.loadPublicSnapshotCalls[0], {
    actorPlayerId: "player-0",
    gameId: "game-1"
  });
  assert.equal(store.loadPrivateHandCalls.length, 0);
});

test("public snapshot resolver rejects non-member access", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetGameSnapshotHandler({
    store: store.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        gameId: "game-1"
      },
      identity: {
        playerId: "not-a-room-member"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "INVALID_ACTOR"
  );
  assert.equal(store.loadPublicSnapshotCalls.length, 1);
});

test("private hand resolver allows the seat owner", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetMyPrivateHandHandler({
    store: store.store
  });
  const response = await handler({
    arguments: {
      input: {
        gameId: "game-1",
        seatIndex: "SEAT_0"
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.gameId, "game-1");
  assert.equal(response.seatIndex, "SEAT_0");
  assert.equal(response.dominoes.length, 7);
  assert.equal(store.loadPrivateHandCalls.length, 1);
  assert.deepEqual(store.loadPrivateHandCalls[0], {
    gameId: "game-1",
    seatIndex: 0
  });
});

test("private hand resolver uses Cognito sub for ownership", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetMyPrivateHandHandler({
    store: store.store
  });
  const response = await handler({
    arguments: {
      input: {
        gameId: "game-1",
        seatIndex: 0
      }
    },
    identity: {
      playerId: "spoofed-player",
      sub: "player-0"
    }
  });

  assert.equal(response.seatIndex, "SEAT_0");
  assert.equal(response.dominoes.length, 7);
});

test("private hand resolver rejects non-owner access", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetMyPrivateHandHandler({
    store: store.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          gameId: "game-1",
          seatIndex: 0
        }
      },
      identity: {
        playerId: "player-1"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "INVALID_ACTOR"
  );
});

test("reconnect resolver returns accepted, rejected, and unknown pending actions", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetReconnectViewHandler({
    store: store.store
  });
  const response = await handler({
    arguments: {
      input: {
        gameId: "game-1",
        lastAppliedEventSequence: 1,
        pendingActionIds: [
          "accepted-1",
          "rejected-1",
          "other-player-1",
          "unknown-1"
        ],
        snapshotVersion: 1
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.deepEqual(response.acceptedPendingActionIds, ["accepted-1"]);
  assert.deepEqual(response.rejectedPendingActions, [
    {
      actionId: "rejected-1",
      errorCode: "INVALID_BID"
    }
  ]);
  assert.deepEqual(response.unknownPendingActionIds, [
    "other-player-1",
    "unknown-1"
  ]);
  assert.equal(response.requiresSnapshotRefresh, true);
  assert.equal(response.serverLastEventSequence, records.snapshot.lastEventSequence);
  assert.equal(response.serverSnapshotVersion, records.snapshot.snapshotVersion);
  assert.equal(response.privateHand?.seatIndex, "SEAT_0");
  assert.equal(response.privateHand?.dominoes.length, 7);
  assert.equal(store.loadReconnectRecordsCalls.length, 1);
  assert.deepEqual(store.loadReconnectRecordsCalls[0], {
    actorPlayerId: "player-0",
    gameId: "game-1",
    pendingActionIds: [
      "accepted-1",
      "rejected-1",
      "other-player-1",
      "unknown-1"
    ]
  });
});

test("query resolvers reject missing identity before persistence", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetGameSnapshotHandler({
    store: store.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        gameId: "game-1"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "UNAUTHENTICATED"
  );
  assert.equal(store.loadPublicSnapshotCalls.length, 0);
});

test("query resolvers reject malformed input before persistence", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetReconnectViewHandler({
    store: store.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          gameId: "game-1",
          lastAppliedEventSequence: 0,
          pendingActionIds: "bad",
          snapshotVersion: 0
        }
      },
      identity: {
        playerId: "player-0"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "MALFORMED_REQUEST"
  );
  assert.equal(store.loadReconnectRecordsCalls.length, 0);
});

test("query resolver shells do not require AWS credentials", async () => {
  const context = createTestContext();
  const records = createRecordsWithPendingResults(createStartedSession(context));
  const store = createMockStore(records);
  const handler = createGetGameSnapshotHandler({
    store: store.store
  });
  const response = await handler({
    arguments: {
      gameId: "game-1"
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.gameId, "game-1");
  assert.equal(store.loadPublicSnapshotCalls.length, 1);
});

interface MockStore {
  readonly commits: CommitWritePlanInput[];
  readonly loadGameSnapshotCalls: LoadGameSnapshotInput[];
  readonly loadIdempotencyResultCalls: LoadIdempotencyResultInput[];
  readonly loadPrivateHandCalls: LoadPrivateHandInput[];
  readonly loadPublicSnapshotCalls: LoadPublicSnapshotInput[];
  readonly loadReconnectRecordsCalls: LoadReconnectRecordsInput[];
  readonly store: MultiplayerStore;
}

function createMockStore(records: MultiplayerStoredGameRecords): MockStore {
  const commits: CommitWritePlanInput[] = [];
  const loadGameSnapshotCalls: LoadGameSnapshotInput[] = [];
  const loadIdempotencyResultCalls: LoadIdempotencyResultInput[] = [];
  const loadPrivateHandCalls: LoadPrivateHandInput[] = [];
  const loadPublicSnapshotCalls: LoadPublicSnapshotInput[] = [];
  const loadReconnectRecordsCalls: LoadReconnectRecordsInput[] = [];

  return {
    commits,
    loadGameSnapshotCalls,
    loadIdempotencyResultCalls,
    loadPrivateHandCalls,
    loadPublicSnapshotCalls,
    loadReconnectRecordsCalls,
    store: {
      async loadGameSnapshot(input): Promise<MultiplayerStoredGameRecords> {
        loadGameSnapshotCalls.push(input);
        return records;
      },
      async loadPublicSnapshot(input): Promise<MultiplayerSnapshotRecord> {
        loadPublicSnapshotCalls.push(input);

        if (!records.room.room.participants[input.actorPlayerId]) {
          throw new BackendResolverError(
            "INVALID_ACTOR",
            "Player is not a member of this room."
          );
        }

        return records.snapshot;
      },
      async loadPrivateHand(input): Promise<MultiplayerPrivateHandRecord> {
        loadPrivateHandCalls.push(input);
        const record = records.privateHands.find((privateHand) =>
          privateHand.gameId === input.gameId &&
          privateHand.seatIndex === input.seatIndex
        );

        if (!record) {
          throw new BackendResolverError(
            "GAME_NOT_FOUND",
            "Private hand not found."
          );
        }

        return record;
      },
      async loadIdempotencyResult(
        input
      ): Promise<MultiplayerActionIdempotencyRecord | null> {
        loadIdempotencyResultCalls.push(input);
        return records.idempotency.find(
          (record) => record.actionId === input.actionId
        ) ?? null;
      },
      async loadReconnectRecords(input): Promise<MultiplayerReconnectRecords> {
        loadReconnectRecordsCalls.push(input);
        const privateHand = records.privateHands.find((record) =>
          record.playerId === input.actorPlayerId
        );

        return {
          idempotency: records.idempotency.filter((record) =>
            input.pendingActionIds.includes(record.actionId)
          ),
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

function createRecordsWithPendingResults(
  session: MultiplayerGameSession
): MultiplayerStoredGameRecords {
  const records = createMultiplayerStorageRecords(session);

  return {
    ...records,
    idempotency: [
      createIdempotencyRecord({
        accepted: true,
        actionId: "accepted-1",
        actorId: "player-0",
        gameId: "game-1"
      }),
      createIdempotencyRecord({
        accepted: false,
        actionId: "rejected-1",
        actorId: "player-0",
        errorCode: "INVALID_BID",
        gameId: "game-1"
      }),
      createIdempotencyRecord({
        accepted: true,
        actionId: "other-player-1",
        actorId: "player-1",
        gameId: "game-1"
      })
    ]
  };
}

function createIdempotencyRecord(input: {
  readonly accepted: boolean;
  readonly actionId: string;
  readonly actorId: string;
  readonly errorCode?: string;
  readonly gameId: string;
}): MultiplayerActionIdempotencyRecord {
  return {
    accepted: input.accepted,
    actionId: input.actionId,
    actorId: input.actorId,
    ...(input.errorCode
      ? {
          errorCode: input.errorCode,
          errorMessage: "Rejected action."
        }
      : {}),
    eventIds: input.accepted ? ["event-1"] : [],
    gameId: input.gameId,
    pk: `ACTION#${input.actionId}`,
    sk: "RESULT",
    updatedAt: "2026-05-30T12:00:00.000Z"
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
