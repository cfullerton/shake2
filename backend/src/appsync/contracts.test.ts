import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSubmitGameActionResolverEvent,
  mapGetMyPrivateHandInputToStoreRequest,
  mapGetReconnectViewInputToClientSyncState,
  mapPrivateHandRecordToAppSyncResponse,
  mapReconnectViewToAppSyncResponse,
  mapSubmitGameActionHandlerResponse,
  toAppSyncRoomView,
  toAppSyncSeatIndex,
  toPublicGameSnapshot
} from "./contracts.ts";
import {
  createMultiplayerPrivateHandRecords,
  createMultiplayerRoom,
  createMultiplayerVisibleSnapshot,
  joinMultiplayerRoom,
  startMultiplayerGame,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerReconnectView,
  type MultiplayerResult,
  type MultiplayerRoom,
  type SeatIndex
} from "../game-engine.ts";
import {
  type SubmitGameActionResponse
} from "../types/index.ts";

test("schema file exists and includes required operations", () => {
  const schema = readSchema();

  assertTypeField(schema, "Mutation", "createRoom");
  assertTypeField(schema, "Mutation", "joinRoom");
  assertTypeField(schema, "Mutation", "takeSeat");
  assertTypeField(schema, "Mutation", "startGame");
  assertTypeField(schema, "Mutation", "submitGameAction");
  assertTypeField(schema, "Query", "getRoom");
  assertTypeField(schema, "Query", "getRoomByCode");
  assertTypeField(schema, "Query", "listPublicRooms");
  assertTypeField(schema, "Query", "getGameSnapshot");
  assertTypeField(schema, "Query", "getMyPrivateHand");
  assertTypeField(schema, "Query", "getReconnectView");
  assertTypeField(schema, "Subscription", "onGameUpdated");
});

test("submitGameAction adapter preserves handler response status shape", () => {
  const session = createStartedSession(createTestContext());
  const handlerResponse: SubmitGameActionResponse = {
    accepted: true,
    committed: true,
    duplicate: false,
    events: session.events,
    snapshot: createMultiplayerVisibleSnapshot(session.snapshot, 0)
  };
  const event = createSubmitGameActionResolverEvent(
    {
      action: {
        actionId: "action-1"
      },
      gameId: "game-1"
    },
    {
      playerId: "player-0"
    }
  );
  const mapped = mapSubmitGameActionHandlerResponse(handlerResponse);

  assert.deepEqual(event.arguments?.input, {
    action: {
      actionId: "action-1"
    },
    gameId: "game-1"
  });
  assert.equal(mapped.accepted, handlerResponse.accepted);
  assert.equal(mapped.committed, handlerResponse.committed);
  assert.equal(mapped.duplicate, handlerResponse.duplicate);
  assert.equal(mapped.events.length, handlerResponse.events.length);
  assert.equal(mapped.gameId, handlerResponse.snapshot.gameId);
  assert.equal(mapped.snapshot.gameId, handlerResponse.snapshot.gameId);
  assert.equal(mapped.snapshot.lastEventSequence, handlerResponse.snapshot.lastEventSequence);
});

test("rejected submitGameAction adapter preserves error shape", () => {
  const handlerResponse: SubmitGameActionResponse = {
    accepted: false,
    committed: true,
    duplicate: false,
    error: {
      code: "INVALID_ACTION",
      message: "Action was rejected."
    }
  };
  const mapped = mapSubmitGameActionHandlerResponse(handlerResponse);

  assert.equal(mapped.accepted, false);
  assert.equal(mapped.committed, handlerResponse.committed);
  assert.equal(mapped.duplicate, handlerResponse.duplicate);
  assert.equal(mapped.error.code, "INVALID_ACTION");
  assert.deepEqual(mapped.events, []);
  assert.equal(mapped.gameId, undefined);
});

test("public snapshot type and adapter do not expose full hands", () => {
  const schema = readSchema();
  const publicSnapshotType = getTypeBlock(schema, "PublicGameSnapshot");
  const session = createStartedSession(createTestContext());
  const publicSnapshot = toPublicGameSnapshot(
    createMultiplayerVisibleSnapshot(session.snapshot, 0)
  );
  const serialized = JSON.stringify(publicSnapshot);

  assert.doesNotMatch(publicSnapshotType, /\bhands\b/);
  assert.doesNotMatch(publicSnapshotType, /\bviewerHand\b/);
  assert.doesNotMatch(serialized, /"hands"/);
  assert.doesNotMatch(serialized, /"viewerHand"/);
  assert.deepEqual(publicSnapshot.handCounts, {
    seat0: 7,
    seat1: 7,
    seat2: 7,
    seat3: 7
  });
});

test("room view adapter hides raw player IDs and marks the viewer", () => {
  const context = createTestContext();
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
    },
    context
  );

  room = unwrapResult(
    joinMultiplayerRoom(
      room,
      {
        displayName: "Bob",
        playerId: "player-1"
      },
      context
    )
  );
  room = unwrapResult(
    takeMultiplayerSeat(
      room,
      {
        playerId: "player-1",
        seat: 1
      },
      context
    )
  );

  const view = toAppSyncRoomView(room, {
    identitySource: "mock",
    playerId: "player-1"
  });
  const serialized = JSON.stringify(view);

  assert.equal(view.roomId, "room-1");
  assert.equal(view.roomCode, "ROOM42");
  assert.equal(view.visibility, "private");
  assert.equal(view.participantCount, 2);
  assert.equal(view.isHost, false);
  assert.equal(view.viewerSeat, "SEAT_1");
  assert.equal(view.participants.find((participant) => participant.isViewer)?.displayName, "Bob");
  assert.equal(view.seats.find((seat) => seat.seatIndex === "SEAT_1")?.isViewer, true);
  assert.doesNotMatch(serialized, /player-0/);
  assert.doesNotMatch(serialized, /player-1/);
});

test("private hand query maps through an explicit seat ownership boundary", () => {
  const session = createStartedSession(createTestContext());
  const privateHand = createMultiplayerPrivateHandRecords(session)[0];

  if (!privateHand) {
    throw new Error("Expected private hand record.");
  }

  const storeRequest = mapGetMyPrivateHandInputToStoreRequest(
    {
      gameId: "game-1",
      seatIndex: 0
    },
    {
      playerId: "player-0"
    }
  );
  const response = mapPrivateHandRecordToAppSyncResponse(
    privateHand,
    {
      identitySource: "mock",
      playerId: "player-0"
    },
    0
  );

  assert.deepEqual(storeRequest, {
    actorPlayerId: "player-0",
    gameId: "game-1",
    requiresSeatOwnershipCheck: true,
    seatIndex: 0
  });
  assert.equal(response.gameId, "game-1");
  assert.equal(response.seatIndex, "SEAT_0");
  assert.equal(response.dominoes.length, 7);
  assert.throws(
    () => mapPrivateHandRecordToAppSyncResponse(
      privateHand,
      {
        identitySource: "mock",
        playerId: "player-1"
      },
      0
    ),
    /Private hand access requires ownership/
  );
});

test("subscription output matches submit mutation and remains public-safe", () => {
  const schema = readSchema();
  const subscriptionType = getTypeBlock(schema, "Subscription");
  const submitResultType = getTypeBlock(schema, "SubmitGameActionResult");
  const session = createStartedSession(createTestContext());
  const result = mapSubmitGameActionHandlerResponse({
    accepted: true,
    committed: true,
    duplicate: false,
    events: session.events,
    snapshot: createMultiplayerVisibleSnapshot(session.snapshot, 0)
  });
  const serialized = JSON.stringify(result);

  assert.match(
    subscriptionType,
    /onGameUpdated\(gameId: ID!\): SubmitGameActionResult\b/
  );
  assert.doesNotMatch(
    subscriptionType,
    /onGameUpdated\(gameId: ID!\): SubmitGameActionResult!/
  );
  assert.match(submitResultType, /\bgameId: ID\b/);
  assert.deepEqual(Object.keys(result).sort(), [
    "accepted",
    "committed",
    "duplicate",
    "events",
    "gameId",
    "snapshot"
  ]);
  assert.doesNotMatch(submitResultType, /\bGameUpdatedNotification\b/);
  assert.doesNotMatch(serialized, /"payload"/);
  assert.doesNotMatch(serialized, /"hands"/);
  assert.doesNotMatch(serialized, /"viewerHand"/);
  assert.doesNotMatch(serialized, /"dominoes"/);
  assert.equal(toAppSyncSeatIndex(0), "SEAT_0");
});

test("reconnect response represents accepted, rejected, and unknown pending actions", () => {
  const session = createStartedSession(createTestContext());
  const clientState = mapGetReconnectViewInputToClientSyncState({
    gameId: "game-1",
    lastAppliedEventSequence: 1,
    pendingActionIds: ["accepted-1", "rejected-1", "unknown-1"],
    snapshotVersion: 1
  });
  const reconnectView: MultiplayerReconnectView = {
    acceptedPendingActionIds: ["accepted-1"],
    rejectedPendingActions: [
      {
        actionId: "rejected-1",
        errorCode: "INVALID_BID"
      }
    ],
    requiresSnapshotRefresh: true,
    serverLastEventSequence: session.snapshot.lastEventSequence,
    serverSnapshotVersion: session.snapshot.snapshotVersion,
    unknownPendingActionIds: ["unknown-1"],
    view: {
      room: session.room,
      snapshot: createMultiplayerVisibleSnapshot(session.snapshot, 0),
      viewerSeat: 0
    }
  };
  const mapped = mapReconnectViewToAppSyncResponse(reconnectView);

  assert.deepEqual(clientState, {
    connectionStatus: "reconnecting",
    gameId: "game-1",
    lastAppliedEventSequence: 1,
    pendingActionIds: ["accepted-1", "rejected-1", "unknown-1"],
    snapshotVersion: 1
  });
  assert.deepEqual(mapped.acceptedPendingActionIds, ["accepted-1"]);
  assert.deepEqual(mapped.rejectedPendingActions, [
    {
      actionId: "rejected-1",
      errorCode: "INVALID_BID"
    }
  ]);
  assert.deepEqual(mapped.unknownPendingActionIds, ["unknown-1"]);
  assert.equal(mapped.privateHand?.dominoes.length, 7);
});

function readSchema(): string {
  const candidates = [
    new URL("./schema.graphql", import.meta.url),
    new URL("../../../../src/appsync/schema.graphql", import.meta.url)
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // The schema is not emitted by tsc, so compiled tests read from source.
    }
  }

  throw new Error("Unable to read AppSync schema.graphql.");
}

function assertTypeField(
  schema: string,
  typeName: string,
  fieldName: string
): void {
  assert.match(getTypeBlock(schema, typeName), new RegExp(`\\b${fieldName}\\b`));
}

function getTypeBlock(schema: string, typeName: string): string {
  const match = new RegExp(`type ${typeName} \\{([\\s\\S]*?)\\n\\}`).exec(schema);

  if (!match?.[1]) {
    throw new Error(`Missing GraphQL type ${typeName}.`);
  }

  return match[1];
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
