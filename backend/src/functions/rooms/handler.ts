import {
  toAppSyncRoomView,
  type AppSyncCreateRoomInput,
  type AppSyncJoinRoomInput,
  type AppSyncRoomView,
  type AppSyncTakeSeatInput
} from "../../appsync/contracts.ts";
import { extractBackendActor } from "../../auth/identity.ts";
import {
  createUnimplementedMultiplayerStore,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import { BackendResolverError } from "../../errors/errors.ts";
import {
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  joinMultiplayerRoom,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerResult,
  type MultiplayerRoom
} from "../../game-engine.ts";
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

export type RoomLifecycleHandler = (
  event: AppSyncResolverEvent
) => Promise<AppSyncRoomView>;

export function createCreateRoomHandler(
  dependencies: RoomLifecycleHandlerDependencies
): RoomLifecycleHandler {
  return async (event) => {
    const actor = extractBackendActor(event.identity);
    const input = parseCreateRoomInput(event);
    const room = createMultiplayerRoom(
      {
        hostDisplayName: input.displayName,
        hostPlayerId: actor.playerId
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
    const roomCode = parseNonEmptyString(
      args.roomCode,
      "getRoomByCode.roomCode"
    ).trim();
    const record = await dependencies.store.loadRoomByCode({
      roomCode
    });

    return toAppSyncRoomView(record.room, actor);
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

export const getRoomHandler = createGetRoomHandler({
  store: createUnimplementedMultiplayerStore()
});

export const getRoomByCodeHandler = createGetRoomByCodeHandler({
  store: createUnimplementedMultiplayerStore()
});

function parseCreateRoomInput(
  event: AppSyncResolverEvent
): AppSyncCreateRoomInput {
  const args = parseArguments(event, "createRoom");
  const input = parseInputObject(args.input, "createRoom.input");

  return {
    displayName: parseNonEmptyString(input.displayName, "createRoom.displayName")
      .trim()
  };
}

function parseJoinRoomInput(event: AppSyncResolverEvent): AppSyncJoinRoomInput {
  const args = parseArguments(event, "joinRoom");
  const input = parseInputObject(args.input, "joinRoom.input");

  return {
    displayName: parseNonEmptyString(input.displayName, "joinRoom.displayName")
      .trim(),
    roomCode: parseNonEmptyString(input.roomCode, "joinRoom.roomCode").trim()
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

function unwrapRoomResult(
  result: MultiplayerResult<MultiplayerRoom>
): MultiplayerRoom {
  if (!result.ok) {
    throw new BackendResolverError(result.error.code, result.error.message);
  }

  return result.value;
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
