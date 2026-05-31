import assert from "node:assert/strict";
import test from "node:test";

import {
  type CreateRoomRecordInput,
  type LoadRoomByCodeInput,
  type LoadRoomInput,
  type SaveRoomRecordInput,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import { BackendResolverError } from "../../errors/errors.ts";
import {
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  joinMultiplayerRoom,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerPrivateHandRecord,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerRoomRecord,
  type MultiplayerSnapshotRecord,
  type MultiplayerStoredGameRecords,
  type SeatIndex
} from "../../game-engine.ts";
import {
  createCreateRoomHandler,
  createGetRoomByCodeHandler,
  createGetRoomHandler,
  createJoinRoomHandler,
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
        displayName: " Alice "
      }
    },
    identity: {
      sub: "host-sub",
      username: "alice"
    }
  });

  assert.equal(response.roomCode, "id-1");
  assert.equal(response.roomId, "id-2");
  assert.equal(response.status, "waiting");
  assert.equal(response.isHost, true);
  assert.equal(response.participantCount, 1);
  assert.equal(response.participants[0]?.displayName, "Alice");
  assert.equal(response.participants[0]?.isViewer, true);
  assert.equal(mock.createRoomRecordCalls.length, 1);
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
        roomCode: "ROOM42"
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
      roomCode: "ROOM42"
    },
    identity
  });

  assert.equal(byId.roomId, "room-1");
  assert.equal(byCode.roomId, "room-1");
  assert.equal(byId.isHost, false);
  assert.equal(byId.viewerSeat, undefined);
  assert.doesNotMatch(JSON.stringify(byId), /player-0/);
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

function createMockStore(initialRooms: readonly MultiplayerRoom[] = []): {
  readonly createRoomRecordCalls: CreateRoomRecordInput[];
  readonly loadRoomByCodeCalls: LoadRoomByCodeInput[];
  readonly loadRoomCalls: LoadRoomInput[];
  readonly saveRoomRecordCalls: SaveRoomRecordInput[];
  readonly store: MultiplayerStore;
} {
  const rooms = new Map(initialRooms.map((room) => [
    room.roomId,
    createMultiplayerRoomRecord(room)
  ]));
  const createRoomRecordCalls: CreateRoomRecordInput[] = [];
  const loadRoomByCodeCalls: LoadRoomByCodeInput[] = [];
  const loadRoomCalls: LoadRoomInput[] = [];
  const saveRoomRecordCalls: SaveRoomRecordInput[] = [];

  return {
    createRoomRecordCalls,
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
      async loadGameSnapshot(): Promise<MultiplayerStoredGameRecords> {
        throw new Error("Not implemented.");
      },
      async loadPublicSnapshot(): Promise<MultiplayerSnapshotRecord> {
        throw new Error("Not implemented.");
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
      async commitWritePlan(): Promise<void> {
        throw new Error("Not implemented.");
      }
    }
  };
}

function createRoom(context: EngineContext): MultiplayerRoom {
  return createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
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

function unwrapResult<TValue>(result: MultiplayerResult<TValue>): TValue {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
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
