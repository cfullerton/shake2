import assert from "node:assert/strict";
import test from "node:test";

import {
  type CommitWritePlanInput,
  type CreateRoomRecordInput,
  type LoadGameSnapshotInput,
  type ListPublicRoomsInput,
  type LoadRoomByCodeInput,
  type LoadRoomInput,
  type LoadPublicSnapshotInput,
  type SaveRoomRecordInput,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import { BackendResolverError } from "../../errors/errors.ts";
import {
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  createMultiplayerSnapshotRecord,
  createMultiplayerStorageRecords,
  chooseLegalRandomBotDecision,
  createMultiplayerActionEnvelope,
  joinMultiplayerRoom,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type LegalRandomBotDecision,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameSession,
  type MultiplayerPrivateHandRecord,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerRoomRecord,
  type MultiplayerSnapshotRecord,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type SeatIndex
} from "../../game-engine.ts";
import {
  createCreateRoomHandler,
  createGetRoomByCodeHandler,
  createGetRoomHandler,
  createJoinRoomHandler,
  createListPublicRoomsHandler,
  createStartGameHandler,
  createStartNextHandHandler,
  createTakeSeatHandler
} from "./handler.ts";

test("createRoom persists a host-owned room and returns a safe view", async () => {
  const context = createTestContext();
  const mock = createMockStore();
  const handler = createCreateRoomHandler({
    engineContext: context,
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        displayName: " Alice ",
        visibility: "public"
      }
    },
    identity: {
      sub: "host-sub",
      username: "alice"
    }
  });

  assert.match(response.roomCode, /^[A-HJ-NP-Z2-9]{6}$/u);
  assert.doesNotMatch(response.roomCode, /^(id|lambda)-/u);
  assert.equal(response.roomId, "id-1");
  assert.equal(response.status, "waiting");
  assert.equal(response.visibility, "public");
  assert.equal(response.isHost, true);
  assert.equal(response.participantCount, 1);
  assert.equal(response.participants[0]?.displayName, "Alice");
  assert.equal(response.participants[0]?.isViewer, true);
  assert.equal(mock.createRoomRecordCalls.length, 1);
  assert.equal(mock.createRoomRecordCalls[0]?.room.roomCode, response.roomCode);
  assert.equal(mock.createRoomRecordCalls[0]?.room.visibility, "public");
  assert.equal(mock.createRoomRecordCalls[0]?.room.publicRoomListKey, "PUBLIC#OPEN");
  assert.doesNotMatch(JSON.stringify(response), /host-sub/);
});

test("joinRoom loads by room code, joins the actor, and saves conditionally", async () => {
  const context = createTestContext();
  const room = createRoom(context);
  const mock = createMockStore([room]);
  const handler = createJoinRoomHandler({
    engineContext: context,
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        displayName: "Bob",
        roomCode: " room-42 "
      }
    },
    identity: {
      playerId: "player-1"
    }
  });

  assert.equal(response.roomId, "room-1");
  assert.equal(response.participantCount, 2);
  assert.equal(response.participants.find((participant) => participant.isViewer)?.displayName, "Bob");
  assert.deepEqual(mock.loadRoomByCodeCalls, [
    {
      roomCode: "ROOM42"
    }
  ]);
  assert.equal(mock.saveRoomRecordCalls.length, 1);
  assert.equal(mock.saveRoomRecordCalls[0]?.previousRoom.room.participants["player-1"], undefined);
  assert.equal(mock.saveRoomRecordCalls[0]?.room.room.participants["player-1"]?.displayName, "Bob");
});

test("takeSeat assigns the actor and marks a full room ready", async () => {
  const context = createTestContext();
  const room = createRoomWithPlayersAndSeats(context, [0, 1, 2]);
  const mock = createMockStore([room]);
  const handler = createTakeSeatHandler({
    engineContext: context,
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        roomId: "room-1",
        seatIndex: "SEAT_3"
      }
    },
    identity: {
      playerId: "player-3"
    }
  });

  assert.equal(response.status, "ready");
  assert.equal(response.viewerSeat, "SEAT_3");
  assert.equal(response.seats.find((seat) => seat.seatIndex === "SEAT_3")?.displayName, "Player 3");
  assert.deepEqual(mock.loadRoomCalls, [
    {
      roomId: "room-1"
    }
  ]);
  assert.equal(mock.saveRoomRecordCalls.length, 1);
});

test("takeSeat rejects occupied seats before persistence", async () => {
  const context = createTestContext();
  const room = createRoomWithPlayersAndSeats(context, [0]);
  const mock = createMockStore([room]);
  const handler = createTakeSeatHandler({
    engineContext: context,
    store: mock.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          roomId: "room-1",
          seatIndex: 0
        }
      },
      identity: {
        playerId: "player-1"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "INVALID_SEAT"
  );
  assert.equal(mock.saveRoomRecordCalls.length, 0);
});

test("startGame commits a game-start write plan and returns public state", async () => {
  const context = createTestContext();
  const readyRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2, 3]);
  const mock = createMockStore([readyRoom]);
  const handler = createStartGameHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        roomId: "room-1",
        targetMarks: 5
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.room.status, "inGame");
  assert.equal(response.room.gameId, "id-1");
  assert.equal(response.room.isHost, true);
  assert.equal(response.snapshot.gameId, "id-1");
  assert.equal(response.snapshot.phase, "dealt");
  assert.deepEqual(response.snapshot.handCounts, {
    seat0: 7,
    seat1: 7,
    seat2: 7,
    seat3: 7
  });
  assert.equal("hands" in response.snapshot.redactedState, false);
  assert.equal("viewerHand" in response.snapshot.redactedState, false);
  assert.equal(mock.commitWritePlanCalls.length, 1);
  assert.equal(mock.commitWritePlanCalls[0]?.writePlan.kind, "gameStart");
  assert.equal(mock.commitWritePlanCalls[0]?.transaction.tableName, "Shake2Multiplayer");
});

test("startGame rejects non-hosts before persistence", async () => {
  const context = createTestContext();
  const readyRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2, 3]);
  const mock = createMockStore([readyRoom]);
  const handler = createStartGameHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          roomId: "room-1"
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
  assert.equal(mock.commitWritePlanCalls.length, 0);
});

test("startGame requires a ready room before persistence", async () => {
  const context = createTestContext();
  const waitingRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2]);
  const mock = createMockStore([waitingRoom]);
  const handler = createStartGameHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          roomId: "room-1"
        }
      },
      identity: {
        playerId: "player-0"
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "INVALID_PHASE"
  );
  assert.equal(mock.commitWritePlanCalls.length, 0);
});

test("startGame returns an already-started room for host retries", async () => {
  const context = createTestContext();
  const readyRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2, 3]);
  const session = createStartedSession(context, readyRoom);
  const mock = createMockStore([session.room], {
    snapshots: [createMultiplayerSnapshotRecord(session.snapshot)]
  });
  const handler = createStartGameHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        roomId: "room-1"
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.room.status, "inGame");
  assert.equal(response.snapshot.gameId, session.snapshot.gameId);
  assert.equal(mock.loadPublicSnapshotCalls.length, 1);
  assert.equal(mock.commitWritePlanCalls.length, 0);
});

test("startNextHand commits a server deal from a completed-hand setup state", async () => {
  const context = createTestContext();
  const readyRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2, 3]);
  const session = createPostHandSession(context, readyRoom);
  const mock = createMockStore([session.room], {
    gameRecords: [createMultiplayerStorageRecords(session)]
  });
  const handler = createStartNextHandHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        gameId: session.snapshot.gameId
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.accepted, true);

  if (response.accepted) {
    assert.equal(response.committed, true);
    assert.equal(response.duplicate, false);
    assert.equal(response.snapshot.snapshot.phase, "dealt");
    assert.deepEqual(
      response.events.map((event) => event.event.type),
      ["fortyTwo.hand.dealt"]
    );
  }

  assert.deepEqual(mock.loadGameSnapshotCalls, [
    {
      gameId: session.snapshot.gameId
    }
  ]);
  assert.equal(mock.commitWritePlanCalls.length, 1);
  assert.equal(mock.commitWritePlanCalls[0]?.writePlan.kind, "nextHand");
  assert.equal(mock.commitWritePlanCalls[0]?.transaction.tableName, "Shake2Multiplayer");
});

test("startNextHand returns current active-hand state for host retries", async () => {
  const context = createTestContext();
  const readyRoom = createRoomWithPlayersAndSeats(context, [0, 1, 2, 3]);
  const session = createStartedSession(context, readyRoom);
  const mock = createMockStore([session.room], {
    gameRecords: [createMultiplayerStorageRecords(session)]
  });
  const handler = createStartNextHandHandler({
    engineContext: context,
    resolverContext: {
      requestId: "test-request",
      tableName: "Shake2Multiplayer"
    },
    store: mock.store
  });
  const response = await handler({
    arguments: {
      input: {
        gameId: session.snapshot.gameId
      }
    },
    identity: {
      playerId: "player-0"
    }
  });

  assert.equal(response.accepted, true);

  if (response.accepted) {
    assert.equal(response.committed, false);
    assert.equal(response.duplicate, true);
    assert.equal(response.snapshot.snapshot.phase, "dealt");
    assert.equal(response.events.length, 0);
  }

  assert.equal(mock.commitWritePlanCalls.length, 0);
});

test("getRoom and getRoomByCode return safe room views", async () => {
  const context = createTestContext();
  const room = createRoomWithPlayersAndSeats(context, [0]);
  const mock = createMockStore([room]);
  const getRoom = createGetRoomHandler({
    store: mock.store
  });
  const getRoomByCode = createGetRoomByCodeHandler({
    store: mock.store
  });
  const identity = {
    playerId: "non-member"
  };
  const byId = await getRoom({
    arguments: {
      roomId: "room-1"
    },
    identity
  });
  const byCode = await getRoomByCode({
    arguments: {
      roomCode: " room-42 "
    },
    identity
  });

  assert.equal(byId.roomId, "room-1");
  assert.equal(byCode.roomId, "room-1");
  assert.deepEqual(mock.loadRoomByCodeCalls, [
    {
      roomCode: "ROOM42"
    }
  ]);
  assert.equal(byId.isHost, false);
  assert.equal(byId.viewerSeat, undefined);
  assert.doesNotMatch(JSON.stringify(byId), /player-0/);
});

test("listPublicRooms returns safe public room views", async () => {
  const context = createTestContext();
  const publicRoom = createRoom(context, {
    roomId: "public-room",
    visibility: "public"
  });
  const privateRoom = createRoom(context, {
    roomId: "private-room",
    visibility: "private"
  });
  const mock = createMockStore([publicRoom, privateRoom]);
  const handler = createListPublicRoomsHandler({
    store: mock.store
  });
  const response = await handler({
    identity: {
      playerId: "player-1"
    }
  });

  assert.deepEqual(response.map((room) => room.roomId), ["public-room"]);
  assert.equal(response[0]?.visibility, "public");
  assert.deepEqual(mock.listPublicRoomsCalls, [
    {}
  ]);
});

test("room handlers reject missing identity before persistence", async () => {
  const context = createTestContext();
  const mock = createMockStore([createRoom(context)]);
  const handler = createJoinRoomHandler({
    engineContext: context,
    store: mock.store
  });

  await assert.rejects(
    () => handler({
      arguments: {
        input: {
          displayName: "Bob",
          roomCode: "ROOM42"
        }
      }
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "UNAUTHENTICATED"
  );
  assert.equal(mock.loadRoomByCodeCalls.length, 0);
});

interface MockStoreOptions {
  readonly gameRecords?: readonly MultiplayerStoredGameRecords[];
  readonly snapshots?: readonly MultiplayerSnapshotRecord[];
}

function createMockStore(
  initialRooms: readonly MultiplayerRoom[] = [],
  options: MockStoreOptions = {}
): {
  readonly commitWritePlanCalls: CommitWritePlanInput[];
  readonly createRoomRecordCalls: CreateRoomRecordInput[];
  readonly listPublicRoomsCalls: ListPublicRoomsInput[];
  readonly loadGameSnapshotCalls: LoadGameSnapshotInput[];
  readonly loadPublicSnapshotCalls: LoadPublicSnapshotInput[];
  readonly loadRoomByCodeCalls: LoadRoomByCodeInput[];
  readonly loadRoomCalls: LoadRoomInput[];
  readonly saveRoomRecordCalls: SaveRoomRecordInput[];
  readonly store: MultiplayerStore;
} {
  const rooms = new Map(initialRooms.map((room) => [
    room.roomId,
    createMultiplayerRoomRecord(room)
  ]));
  const gameRecords = new Map((options.gameRecords ?? []).map((records) => [
    records.snapshot.gameId,
    records
  ]));
  const snapshots = new Map((options.snapshots ?? []).map((snapshot) => [
    snapshot.gameId,
    snapshot
  ]));
  const commitWritePlanCalls: CommitWritePlanInput[] = [];
  const createRoomRecordCalls: CreateRoomRecordInput[] = [];
  const listPublicRoomsCalls: ListPublicRoomsInput[] = [];
  const loadGameSnapshotCalls: LoadGameSnapshotInput[] = [];
  const loadPublicSnapshotCalls: LoadPublicSnapshotInput[] = [];
  const loadRoomByCodeCalls: LoadRoomByCodeInput[] = [];
  const loadRoomCalls: LoadRoomInput[] = [];
  const saveRoomRecordCalls: SaveRoomRecordInput[] = [];

  return {
    commitWritePlanCalls,
    createRoomRecordCalls,
    listPublicRoomsCalls,
    loadGameSnapshotCalls,
    loadPublicSnapshotCalls,
    loadRoomByCodeCalls,
    loadRoomCalls,
    saveRoomRecordCalls,
    store: {
      async loadRoom(input): Promise<MultiplayerRoomRecord> {
        loadRoomCalls.push(input);

        const room = rooms.get(input.roomId);

        if (!room) {
          throw new BackendResolverError(
            "GAME_NOT_FOUND",
            "Multiplayer room was not found."
          );
        }

        return room;
      },
      async loadRoomByCode(input): Promise<MultiplayerRoomRecord> {
        loadRoomByCodeCalls.push(input);

        const room = [...rooms.values()].find((record) =>
          record.roomCode === input.roomCode
        );

        if (!room) {
          throw new BackendResolverError(
            "GAME_NOT_FOUND",
            "Multiplayer room code was not found."
          );
        }

        return room;
      },
      async listPublicRooms(input = {}): Promise<readonly MultiplayerRoomRecord[]> {
        listPublicRoomsCalls.push(input);

        return [...rooms.values()].filter((record) =>
          record.visibility === "public" &&
          (record.status === "waiting" || record.status === "ready")
        );
      },
      async createRoomRecord(input): Promise<MultiplayerRoomRecord> {
        createRoomRecordCalls.push(input);
        rooms.set(input.room.roomId, input.room);

        return input.room;
      },
      async saveRoomRecord(input): Promise<MultiplayerRoomRecord> {
        saveRoomRecordCalls.push(input);
        rooms.set(input.room.roomId, input.room);

        return input.room;
      },
      async loadGameSnapshot(input): Promise<MultiplayerStoredGameRecords> {
        loadGameSnapshotCalls.push(input);

        const records = gameRecords.get(input.gameId);

        if (!records) {
          throw new BackendResolverError(
            "GAME_NOT_FOUND",
            "Multiplayer game snapshot was not found."
          );
        }

        return records;
      },
      async loadPublicSnapshot(input): Promise<MultiplayerSnapshotRecord> {
        loadPublicSnapshotCalls.push(input);

        const snapshot = snapshots.get(input.gameId);

        if (!snapshot) {
          throw new BackendResolverError(
            "GAME_NOT_FOUND",
            "Multiplayer game snapshot was not found."
          );
        }

        return snapshot;
      },
      async loadPrivateHand(): Promise<MultiplayerPrivateHandRecord> {
        throw new Error("Not implemented.");
      },
      async loadIdempotencyResult(): Promise<MultiplayerActionIdempotencyRecord | null> {
        throw new Error("Not implemented.");
      },
      async loadReconnectRecords() {
        throw new Error("Not implemented.");
      },
      async commitWritePlan(input): Promise<void> {
        commitWritePlanCalls.push(input);

        for (const operation of input.writePlan.operations) {
          if (operation.kind === "putRoom") {
            rooms.set(operation.record.roomId, operation.record);
          }

          if (operation.kind === "putSnapshot") {
            snapshots.set(operation.record.gameId, operation.record);
            const existing = gameRecords.get(operation.record.gameId);

            if (existing) {
              gameRecords.set(operation.record.gameId, {
                ...existing,
                snapshot: operation.record
              });
            }
          }
        }
      }
    }
  };
}

function createRoom(
  context: EngineContext,
  overrides: Partial<Pick<MultiplayerRoom, "roomId" | "visibility">> = {}
): MultiplayerRoom {
  return createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: overrides.roomId ?? "room-1",
      ...(overrides.visibility ? { visibility: overrides.visibility } : {})
    },
    context
  );
}

function createRoomWithPlayersAndSeats(
  context: EngineContext,
  occupiedSeats: readonly SeatIndex[]
): MultiplayerRoom {
  let room = createRoom(context);

  for (const seat of [1, 2, 3] as const) {
    room = unwrapResult(
      joinMultiplayerRoom(
        room,
        {
          displayName: `Player ${seat}`,
          playerId: `player-${seat}`
        },
        context
      )
    );
  }

  for (const seat of occupiedSeats) {
    room = unwrapResult(
      takeMultiplayerSeat(
        room,
        {
          playerId: `player-${seat}`,
          seat
        },
        context
      )
    );
  }

  return room;
}

function createStartedSession(
  context: EngineContext,
  readyRoom: MultiplayerRoom
): MultiplayerGameSession {
  return unwrapResult(
    startMultiplayerGame(
      readyRoom,
      {
        actorId: "player-0",
        gameId: "started-game-1"
      },
      context
    )
  );
}

function createPostHandSession(
  context: EngineContext,
  readyRoom: MultiplayerRoom
): MultiplayerGameSession {
  let session = unwrapResult(
    startMultiplayerGame(
      readyRoom,
      {
        actorId: "player-0",
        gameId: "started-game-1",
        targetMarks: 250
      },
      context
    )
  );
  let remainingActions = 80;

  while (session.snapshot.snapshot.phase !== "setup" && remainingActions > 0) {
    const seat = getCurrentTurnSeat(session);
    const decision = chooseLegalRandomBotDecision({
      context,
      seat,
      snapshot: session.snapshot
    });

    session = submitBotDecision(session, decision, context);
    remainingActions -= 1;

    if (session.snapshot.snapshot.phase === "gameComplete") {
      throw new Error("Expected test hand not to complete the game.");
    }
  }

  if (session.snapshot.snapshot.phase !== "setup") {
    throw new Error("Expected test session to reach next-hand setup.");
  }

  return session;
}

function getCurrentTurnSeat(session: MultiplayerGameSession): SeatIndex {
  const state = session.snapshot.snapshot;

  if (state.phase === "dealt") {
    return ((state.dealer + 1) % 4) as SeatIndex;
  }

  if (state.phase === "bidding" && state.bidding.currentSeat !== null) {
    return state.bidding.currentSeat;
  }

  if (state.phase === "trump" && state.trump.declarer !== null) {
    return state.trump.declarer;
  }

  if (state.phase === "trickPlay") {
    return ((state.currentTrick.leader +
      state.currentTrick.playedDominoes.length) % 4) as SeatIndex;
  }

  throw new Error(`No current turn seat for phase ${state.phase}.`);
}

function submitBotDecision(
  session: MultiplayerGameSession,
  decision: LegalRandomBotDecision,
  context: EngineContext
): MultiplayerGameSession {
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: createBotAction(decision),
      actorId: playerIdForSeat(decision.seat)
    },
    context
  );

  return unwrapSubmit(submitMultiplayerGameAction(session, action, context)).session;
}

function createBotAction(decision: LegalRandomBotDecision) {
  switch (decision.kind) {
    case "bid":
      return {
        payload: {
          bid: decision.bid,
          seat: decision.seat
        },
        type: "fortyTwo.bid.submit" as const
      };
    case "callTrump":
      return {
        payload: {
          trumpSuit: decision.trumpSuit
        },
        type: "fortyTwo.trump.call" as const
      };
    case "playDomino":
      return {
        payload: {
          domino: decision.play.domino,
          ...(decision.play.ledSuit ? { ledSuit: decision.play.ledSuit } : {}),
          seat: decision.seat
        },
        type: "fortyTwo.domino.play" as const
      };
  }
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
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `id-${id}`;
    },
    now: () => {
      time += 1;
      return new Date(Date.UTC(2026, 4, 31, 12, 0, time)).toISOString();
    },
    random: () => 0.5
  };
}
