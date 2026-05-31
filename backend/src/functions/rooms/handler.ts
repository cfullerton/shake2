import {
  toPublicGameSnapshot,
  toAppSyncRoomView,
  type AppSyncCreateRoomInput,
  type AppSyncJoinRoomInput,
  type AppSyncRoomView,
  type AppSyncStartNextHandInput,
  type AppSyncStartGameInput,
  type AppSyncStartGameResult,
  type AppSyncTakeSeatInput
} from "../../appsync/contracts.ts";
import { extractBackendActor } from "../../auth/identity.ts";
import {
  createUnimplementedMultiplayerStore,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import {
  BackendResolverError,
  createBackendErrorResponse
} from "../../errors/errors.ts";
import {
  createMultiplayerDynamoDbTransactionWritePlan,
  createMultiplayerGameStartWritePlan,
  createMultiplayerNextHandWritePlan,
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  createMultiplayerVisibleSnapshot,
  getEngineRandom,
  getMultiplayerSeatForPlayer,
  joinMultiplayerRoom,
  restoreMultiplayerSessionFromRecords,
  startMultiplayerGame,
  startNextMultiplayerHand,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerWritePlan
} from "../../game-engine.ts";
import {
  type ResolverContext,
  type SubmitGameActionResponse
} from "../../types/index.ts";
import {
  parseArguments,
  parseInputObject,
  parseNonEmptyString,
  parseSeatIndex,
  type AppSyncResolverEvent
} from "../shared/appsync-input.ts";

export interface RoomLifecycleHandlerDependencies {
  readonly engineContext: EngineContext;
  readonly store: MultiplayerStore;
}

export interface StartGameHandlerDependencies
  extends RoomLifecycleHandlerDependencies {
  readonly resolverContext: ResolverContext;
}

export type RoomLifecycleHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncRoomView>;

export type ListPublicRoomsHandler = (
  event: AppSyncResolverEvent
) => Promise<readonly AppSyncRoomView[]>;

export type StartGameHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncStartGameResult>;

export type StartNextHandHandler = (
  event: AppSyncResolverEvent
) => Promise<SubmitGameActionResponse>;

export function createCreateRoomHandler(
  dependencies: RoomLifecycleHandlerDependencies
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseCreateRoomInput(event);
    const room = createMultiplayerRoom(
      {
        hostDisplayName: input.displayName,
        hostPlayerId: actor.playerId,
        roomCode: createRoomCode(dependencies.engineContext),
        ...(input.visibility ? { visibility: input.visibility } : {})
      },
      dependencies.engineContext
    );
    const record = await dependencies.store.createRoomRecord({
      room: createMultiplayerRoomRecord(room)
    });

    return toAppSyncRoomView(record.room, actor);
  };
}

export function createJoinRoomHandler(
  dependencies: RoomLifecycleHandlerDependencies
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseJoinRoomInput(event);
    const previousRoom = await dependencies.store.loadRoomByCode({
      roomCode: input.roomCode
    });
    const nextRoom = unwrapRoomResult(
      joinMultiplayerRoom(
        previousRoom.room,
        {
          displayName: input.displayName,
          playerId: actor.playerId
        },
        dependencies.engineContext
      )
    );

    if (nextRoom === previousRoom.room) {
      return toAppSyncRoomView(previousRoom.room, actor);
    }

    const record = await dependencies.store.saveRoomRecord({
      previousRoom,
      room: createMultiplayerRoomRecord(nextRoom)
    });

    return toAppSyncRoomView(record.room, actor);
  };
}

export function createTakeSeatHandler(
  dependencies: RoomLifecycleHandlerDependencies
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseTakeSeatInput(event);
    const previousRoom = await dependencies.store.loadRoom({
      roomId: input.roomId
    });
    const nextRoom = unwrapRoomResult(
      takeMultiplayerSeat(
        previousRoom.room,
        {
          playerId: actor.playerId,
          seat: input.seatIndex
        },
        dependencies.engineContext
      )
    );

    if (nextRoom === previousRoom.room) {
      return toAppSyncRoomView(previousRoom.room, actor);
    }

    const record = await dependencies.store.saveRoomRecord({
      previousRoom,
      room: createMultiplayerRoomRecord(nextRoom)
    });

    return toAppSyncRoomView(record.room, actor);
  };
}

export function createStartGameHandler(
  dependencies: StartGameHandlerDependencies
): StartGameHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseStartGameInput(event);
    const previousRoom = await dependencies.store.loadRoom({
      roomId: input.roomId
    });

    if (previousRoom.room.status === "inGame" && previousRoom.room.gameId) {
      assertRoomHost(previousRoom.room, actor.playerId);

      const snapshot = await dependencies.store.loadPublicSnapshot({
        actorPlayerId: actor.playerId,
        gameId: previousRoom.room.gameId
      });

      return {
        room: toAppSyncRoomView(previousRoom.room, actor),
        snapshot: toPublicGameSnapshot(snapshot.payload, snapshot.lastCompletedHand)
      };
    }

    const session = unwrapMultiplayerResult(
      startMultiplayerGame(
        previousRoom.room,
        {
          actorId: actor.playerId,
          ...(input.targetMarks !== undefined
            ? { targetMarks: input.targetMarks }
            : {})
        },
        dependencies.engineContext
      )
    );
    const writePlan = createMultiplayerGameStartWritePlan(
      previousRoom.room,
      session
    );
    const transaction = createTransaction(
      writePlan,
      dependencies.resolverContext
    );

    await dependencies.store.commitWritePlan({
      gameId: session.snapshot.gameId,
      transaction,
      writePlan
    });

    return {
      room: toAppSyncRoomView(session.room, actor),
      snapshot: toPublicGameSnapshot(
        createMultiplayerVisibleSnapshot(session.snapshot, null)
      )
    };
  };
}

export function createStartNextHandHandler(
  dependencies: StartGameHandlerDependencies
): StartNextHandHandler {
  return async (event) => {
    try {
      const actor = extractBackendActor(event.identity);
      const input = parseStartNextHandInput(event);
      const previousSession = restoreSession(
        await dependencies.store.loadGameSnapshot({
          gameId: input.gameId
        })
      );

      assertRoomHost(
        previousSession.room,
        actor.playerId,
        "Only the room host can deal the next hand."
      );

      if (previousSession.room.status !== "inGame") {
        throw new BackendResolverError(
          "INVALID_PHASE",
          "Room is not in an active game."
        );
      }

      if (previousSession.snapshot.snapshot.phase !== "setup") {
        if (isActiveHandPhase(previousSession.snapshot.snapshot.phase)) {
          return {
            accepted: true,
            committed: false,
            duplicate: true,
            events: [],
            snapshot: createMultiplayerVisibleSnapshot(
              previousSession.snapshot,
              getMultiplayerSeatForPlayer(previousSession.room, actor.playerId)
            )
          };
        }

        throw new BackendResolverError(
          "INVALID_PHASE",
          "The next hand can only be dealt after a completed hand."
        );
      }

      const result = unwrapMultiplayerResult(
        startNextMultiplayerHand(
          previousSession,
          {
            actorId: actor.playerId
          },
          dependencies.engineContext
        )
      );
      const writePlan = createMultiplayerNextHandWritePlan(
        previousSession,
        result
      );
      const transaction = createTransaction(
        writePlan,
        dependencies.resolverContext
      );

      await dependencies.store.commitWritePlan({
        gameId: result.snapshot.gameId,
        transaction,
        writePlan
      });

      return {
        accepted: true,
        committed: true,
        duplicate: false,
        events: result.events,
        snapshot: createMultiplayerVisibleSnapshot(
          result.snapshot,
          getMultiplayerSeatForPlayer(result.session.room, actor.playerId)
        ),
        transaction
      };
    } catch (error) {
      return {
        accepted: false,
        committed: false,
        duplicate: false,
        error: createBackendErrorResponse(error)
      };
    }
  };
}

export function createGetRoomHandler(
  dependencies: Pick<RoomLifecycleHandlerDependencies, "store">
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const args = parseArguments(event, "getRoom");
    const roomId = parseNonEmptyString(args.roomId, "getRoom.roomId").trim();
    const record = await dependencies.store.loadRoom({
      roomId
    });

    return toAppSyncRoomView(record.room, actor);
  };
}

export function createGetRoomByCodeHandler(
  dependencies: Pick<RoomLifecycleHandlerDependencies, "store">
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const args = parseArguments(event, "getRoomByCode");
    const roomCode = parseRoomCode(
      args.roomCode,
      "getRoomByCode.roomCode"
    );
    const record = await dependencies.store.loadRoomByCode({
      roomCode
    });

    return toAppSyncRoomView(record.room, actor);
  };
}

export function createListPublicRoomsHandler(
  dependencies: Pick<RoomLifecycleHandlerDependencies, "store">
): ListPublicRoomsHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const records = await dependencies.store.listPublicRooms();

    return records.map((record) => toAppSyncRoomView(record.room, actor));
  };
}

export const createRoomHandler = createCreateRoomHandler({
  engineContext: createSystemEngineContext(),
  store: createUnimplementedMultiplayerStore()
});

export const joinRoomHandler = createJoinRoomHandler({
  engineContext: createSystemEngineContext(),
  store: createUnimplementedMultiplayerStore()
});

export const takeSeatHandler = createTakeSeatHandler({
  engineContext: createSystemEngineContext(),
  store: createUnimplementedMultiplayerStore()
});

export const startGameHandler = createStartGameHandler({
  engineContext: createSystemEngineContext(),
  resolverContext: {
    requestId: "unconfigured",
    tableName: "UNCONFIGURED_MULTIPLAYER_TABLE"
  },
  store: createUnimplementedMultiplayerStore()
});

export const startNextHandHandler = createStartNextHandHandler({
  engineContext: createSystemEngineContext(),
  resolverContext: {
    requestId: "unconfigured",
    tableName: "UNCONFIGURED_MULTIPLAYER_TABLE"
  },
  store: createUnimplementedMultiplayerStore()
});

export const getRoomHandler = createGetRoomHandler({
  store: createUnimplementedMultiplayerStore()
});

export const getRoomByCodeHandler = createGetRoomByCodeHandler({
  store: createUnimplementedMultiplayerStore()
});

export const listPublicRoomsHandler = createListPublicRoomsHandler({
  store: createUnimplementedMultiplayerStore()
});

function parseCreateRoomInput(
  event: AppSyncResolverEvent
): AppSyncCreateRoomInput {
  const args = parseArguments(event, "createRoom");
  const input = parseInputObject(args.input, "createRoom.input");
  const visibility = parseRoomVisibility(input.visibility, "createRoom.visibility");

  return {
    displayName: parseNonEmptyString(input.displayName, "createRoom.displayName")
      .trim(),
    ...(visibility ? { visibility } : {})
  };
}

function parseJoinRoomInput(event: AppSyncResolverEvent): AppSyncJoinRoomInput {
  const args = parseArguments(event, "joinRoom");
  const input = parseInputObject(args.input, "joinRoom.input");

  return {
    displayName: parseNonEmptyString(input.displayName, "joinRoom.displayName")
      .trim(),
    roomCode: parseRoomCode(input.roomCode, "joinRoom.roomCode")
  };
}

function parseTakeSeatInput(event: AppSyncResolverEvent): AppSyncTakeSeatInput {
  const args = parseArguments(event, "takeSeat");
  const input = parseInputObject(args.input, "takeSeat.input");

  return {
    roomId: parseNonEmptyString(input.roomId, "takeSeat.roomId").trim(),
    seatIndex: parseSeatIndex(input.seatIndex, "takeSeat.seatIndex")
  };
}

function parseStartGameInput(
  event: AppSyncResolverEvent
): AppSyncStartGameInput {
  const args = parseArguments(event, "startGame");
  const input = parseInputObject(args.input, "startGame.input");
  const targetMarks = parseOptionalPositiveInteger(
    input.targetMarks,
    "startGame.targetMarks"
  );

  return {
    roomId: parseNonEmptyString(input.roomId, "startGame.roomId").trim(),
    ...(targetMarks !== undefined ? { targetMarks } : {})
  };
}

function parseStartNextHandInput(
  event: AppSyncResolverEvent
): AppSyncStartNextHandInput {
  const args = parseArguments(event, "startNextHand");
  const input = parseInputObject(args.input, "startNextHand.input");

  return {
    gameId: parseNonEmptyString(input.gameId, "startNextHand.gameId").trim()
  };
}

function parseOptionalPositiveInteger(
  value: unknown,
  label: string
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be a positive integer.`
    );
  }

  return value;
}

function parseRoomVisibility(
  value: unknown,
  label: string
): AppSyncCreateRoomInput["visibility"] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "private" || value === "public") {
    return value;
  }

  throw new BackendResolverError(
    "MALFORMED_REQUEST",
    `${label} must be private or public.`
  );
}

function unwrapRoomResult(
  result: MultiplayerResult<MultiplayerRoom>
): MultiplayerRoom {
  return unwrapMultiplayerResult(result);
}

function unwrapMultiplayerResult<TValue>(
  result: MultiplayerResult<TValue>
): TValue {
  if (!result.ok) {
    throw new BackendResolverError(result.error.code, result.error.message);
  }

  return result.value;
}

function createTransaction(
  writePlan: MultiplayerWritePlan,
  resolverContext: ResolverContext
) {
  return createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: resolverContext.tableName
  });
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

function createRoomCode(context: Pick<EngineContext, "random">): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const index = Math.floor(
      getEngineRandom(context) * ROOM_CODE_ALPHABET.length
    );

    return ROOM_CODE_ALPHABET[index] ?? "A";
  }).join("");
}

function parseRoomCode(value: unknown, label: string): string {
  const roomCode = normalizeRoomCode(parseNonEmptyString(value, label));

  if (roomCode.length === 0) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must include at least one room code character.`
    );
  }

  return roomCode;
}

function normalizeRoomCode(value: string): string {
  return value.trim().replace(/[\s-]/gu, "").toUpperCase();
}

function assertRoomHost(
  room: MultiplayerRoom,
  playerId: string,
  message = "Only the room host can start the game."
): void {
  if (room.hostPlayerId !== playerId) {
    throw new BackendResolverError(
      "INVALID_ACTOR",
      message
    );
  }
}

function restoreSession(records: unknown): MultiplayerGameSession {
  const restored = restoreMultiplayerSessionFromRecords(records);

  if (!restored.ok) {
    throw restored.error;
  }

  return restored.value;
}

function isActiveHandPhase(phase: string): boolean {
  return phase === "dealt" ||
    phase === "bidding" ||
    phase === "trump" ||
    phase === "trickPlay";
}

function createSystemEngineContext(): EngineContext {
  let nextId = 0;

  return {
    newId: () => {
      nextId += 1;
      return `room-${Date.now()}-${nextId}`;
    },
    now: () => new Date().toISOString(),
    random: () => Math.random()
  };
}
