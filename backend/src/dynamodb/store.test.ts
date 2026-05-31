import assert from "node:assert/strict";
import test from "node:test";

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";

import {
  DynamoDBMultiplayerStore,
  createDynamoDBMultiplayerStoreFromEnv,
  type DynamoDBDocumentClientLike,
  type DynamoDBMultiplayerStoreCommand,
  type DynamoDBMultiplayerStoreCommandOutput
} from "./store.ts";
import { BackendResolverError } from "../errors/errors.ts";
import {
  createMultiplayerAcceptedActionWritePlan,
  createMultiplayerActionEnvelope,
  createMultiplayerDynamoDbTransactionWritePlan,
  createMultiplayerGameStartWritePlan,
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  createMultiplayerStorageRecords,
  createPassBid,
  joinMultiplayerRoom,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type MultiplayerWriteOperation,
  type MultiplayerWritePlan,
  type SeatIndex
} from "../game-engine.ts";

const TABLE_NAME = "Shake2Multiplayer";
const ROOM_CODE_INDEX_NAME = "RoomCodeIndex";
const ROOM_GAME_ID_INDEX_NAME = "GameIdIndex";

test("loads game snapshot records from DynamoDB query results", async () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const records = createMultiplayerStorageRecords(session);
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const loaded = await store.loadGameSnapshot({
    gameId: "game-1"
  });

  assert.deepEqual(loaded, {
    events: records.events,
    idempotency: [],
    privateHands: records.privateHands,
    room: records.room,
    snapshot: records.snapshot
  });

  const gameQuery = getCommandInput(client.commands[0], QueryCommand);
  const roomQuery = getCommandInput(client.commands[1], QueryCommand);

  assert.equal(gameQuery.TableName, TABLE_NAME);
  assert.equal(gameQuery.ConsistentRead, true);
  assert.equal(gameQuery.KeyConditionExpression, "#pk = :pk");
  assert.deepEqual(gameQuery.ExpressionAttributeValues, {
    ":pk": "GAME#game-1"
  });
  assert.equal(roomQuery.TableName, TABLE_NAME);
  assert.equal(roomQuery.IndexName, ROOM_GAME_ID_INDEX_NAME);
  assert.equal(roomQuery.KeyConditionExpression, "#gameId = :gameId AND #sk = :sk");
  assert.equal(roomQuery.FilterExpression, undefined);
  assert.deepEqual(roomQuery.ExpressionAttributeValues, {
    ":gameId": "game-1",
    ":sk": "META"
  });
});

test("loads a single idempotency result by action ID", async () => {
  const context = createTestContext();
  const session = submitSeatBid(
    createStartedSession(context),
    1,
    "bid-1",
    context
  );
  const records = createMultiplayerStorageRecords(session);
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadIdempotencyResult({
    actionId: "bid-1",
    gameId: "game-1"
  });

  assert.equal(result?.actionId, "bid-1");
  assert.equal(result?.accepted, true);

  const get = getCommandInput(client.commands[0], GetCommand);

  assert.equal(get.TableName, TABLE_NAME);
  assert.equal(get.ConsistentRead, true);
  assert.deepEqual(get.Key, {
    pk: "ACTION#bid-1",
    sk: "RESULT"
  });
});

test("loads room records by room ID", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadRoom({
    roomId: "room-1"
  });
  const get = getCommandInput(client.commands[0], GetCommand);

  assert.deepEqual(result, records.room);
  assert.deepEqual(get.Key, {
    pk: "ROOM#room-1",
    sk: "META"
  });
});

test("loads room records by room code index", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomCodeIndexName: ROOM_CODE_INDEX_NAME,
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadRoomByCode({
    roomCode: "ROOM42"
  });
  const query = getCommandInput(client.commands[0], QueryCommand);

  assert.deepEqual(result, records.room);
  assert.equal(query.IndexName, ROOM_CODE_INDEX_NAME);
  assert.equal(query.KeyConditionExpression, "#roomCode = :roomCode");
  assert.equal(query.ScanIndexForward, false);
  assert.deepEqual(query.ExpressionAttributeValues, {
    ":roomCode": "ROOM42"
  });
});

test("creates room records with a must-not-exist condition", async () => {
  const context = createTestContext();
  const room = createMultiplayerRoomRecord(createRoom(context));
  const client = createMockDynamoClient(createMultiplayerStorageRecords(createStartedSession(context)));
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.createRoomRecord({
    room
  });
  const put = getCommandInput(client.commands[0], PutCommand);

  assert.deepEqual(result, room);
  assert.equal(put.TableName, TABLE_NAME);
  assert.equal(
    put.ConditionExpression,
    "attribute_not_exists(#pk) AND attribute_not_exists(#sk)"
  );
  assert.deepEqual(put.Item, room);
});

test("saves room records with stale-room protection", async () => {
  const context = createTestContext();
  const previousRoom = createMultiplayerRoomRecord(createRoom(context));
  const nextRoom = createMultiplayerRoomRecord(
    unwrapResult(
      joinMultiplayerRoom(
        previousRoom.room,
        {
          displayName: "Bob",
          playerId: "player-1"
        },
        context
      )
    )
  );
  const client = createMockDynamoClient(createMultiplayerStorageRecords(createStartedSession(context)));
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.saveRoomRecord({
    previousRoom,
    room: nextRoom
  });
  const put = getCommandInput(client.commands[0], PutCommand);

  assert.deepEqual(result, nextRoom);
  assert.match(
    String(put.ConditionExpression ?? ""),
    /#updatedAt = :expectedUpdatedAt/
  );
  assert.deepEqual(put.ExpressionAttributeValues, {
    ":expectedStatus": previousRoom.status,
    ":expectedUpdatedAt": previousRoom.updatedAt,
    ":pk": previousRoom.pk,
    ":sk": previousRoom.sk
  });
});

test("maps room conditional write failures to persistence conflicts", async () => {
  const context = createTestContext();
  const room = createMultiplayerRoomRecord(createRoom(context));
  const client = createMockDynamoClient(
    createMultiplayerStorageRecords(createStartedSession(context)),
    undefined,
    createConditionalCheckFailedError()
  );
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.createRoomRecord({
      room
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "PERSISTENCE_CONFLICT"
  );
});

test("loads a public snapshot record without private hands", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadPublicSnapshot({
    actorPlayerId: "player-0",
    gameId: "game-1"
  });
  const get = getCommandInput(client.commands[0], GetCommand);
  const roomQuery = getCommandInput(client.commands[1], QueryCommand);

  assert.deepEqual(result, records.snapshot);
  assert.deepEqual(get.Key, {
    pk: "GAME#game-1",
    sk: "SNAPSHOT#LATEST"
  });
  assert.equal(roomQuery.IndexName, ROOM_GAME_ID_INDEX_NAME);
  assert.doesNotMatch(JSON.stringify(result), /"hands"/);
  assert.doesNotMatch(JSON.stringify(result), /"viewerHand"/);
});

test("rejects public snapshot reads for non-members", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.loadPublicSnapshot({
      actorPlayerId: "not-a-room-member",
      gameId: "game-1"
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "INVALID_ACTOR"
  );
});

test("loads a private hand record by game and seat", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadPrivateHand({
    gameId: "game-1",
    seatIndex: 0
  });
  const get = getCommandInput(client.commands[0], GetCommand);

  assert.equal(result.playerId, "player-0");
  assert.equal(result.seatIndex, 0);
  assert.equal(result.hand.length, 7);
  assert.deepEqual(get.Key, {
    pk: "GAME#game-1",
    sk: "PRIVATE_HAND#0"
  });
});

test("loads reconnect records with only the actor private hand and pending results", async () => {
  const context = createTestContext();
  const session = submitSeatBid(
    createStartedSession(context),
    1,
    "bid-1",
    context
  );
  const records = createMultiplayerStorageRecords(session);
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadReconnectRecords({
    actorPlayerId: "player-1",
    gameId: "game-1",
    pendingActionIds: ["bid-1", "missing-action"]
  });

  assert.deepEqual(result.snapshot, records.snapshot);
  assert.equal(result.privateHand?.playerId, "player-1");
  assert.equal(result.privateHand?.seatIndex, 1);
  assert.deepEqual(result.idempotency.map((record) => record.actionId), ["bid-1"]);
  assert.equal(
    result.privateHand?.hand.length,
    records.privateHands.find((record) => record.seatIndex === 1)?.hand.length
  );
});

test("returns null when idempotency result is missing", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });
  const result = await store.loadIdempotencyResult({
    actionId: "missing",
    gameId: "game-1"
  });

  assert.equal(result, null);
});

test("commits accepted action transaction intents through TransactWriteCommand", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBidResult(previousSession, 1, "bid-1", context);
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const client = createMockDynamoClient(createMultiplayerStorageRecords(previousSession));
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await store.commitWritePlan({
    gameId: "game-1",
    transaction,
    writePlan
  });

  const command = getCommandInput(client.commands[0], TransactWriteCommand);

  assert.deepEqual(command.TransactItems, transaction.transactItems);
  assertConditionForItem(command.TransactItems, "ACTION#bid-1", "RESULT", "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");
  assertConditionForSortKey(command.TransactItems, "EVENT#3", "attribute_not_exists(#pk) AND attribute_not_exists(#sk)");

  const snapshotPut = findPutBySortKey(command.TransactItems, "SNAPSHOT#LATEST");

  assert.match(snapshotPut.ConditionExpression ?? "", /#snapshotVersion = :expectedSnapshotVersion/);
  assert.match(snapshotPut.ConditionExpression ?? "", /#lastEventSequence = :expectedLastEventSequence/);
});

test("commits game-start room status conditions through TransactWriteCommand", async () => {
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
  const client = createMockDynamoClient(createMultiplayerStorageRecords(session));
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await store.commitWritePlan({
    gameId: "game-1",
    transaction,
    writePlan
  });

  const command = getCommandInput(client.commands[0], TransactWriteCommand);
  const roomPut = findPutBySortKey(command.TransactItems, "META");

  assert.match(roomPut.ConditionExpression ?? "", /#status = :expectedStatus/);
  assert.deepEqual(roomPut.ExpressionAttributeValues, {
    ":expectedStatus": "ready",
    ":pk": "ROOM#room-1",
    ":sk": "META"
  });
});

test("maps duplicate action transaction conflicts to stable errors", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBidResult(previousSession, 1, "bid-1", context);
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const client = createMockDynamoClient(
    createMultiplayerStorageRecords(previousSession),
    createTransactionCanceledError(
      createCancellationReasons(writePlan, (operation) =>
        operation.kind === "putActionResult"
      )
    )
  );
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.commitWritePlan({
      gameId: "game-1",
      transaction,
      writePlan
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "DUPLICATE_ACTION"
  );
});

test("maps stale snapshot transaction conflicts to stable errors", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBidResult(previousSession, 1, "bid-1", context);
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const client = createMockDynamoClient(
    createMultiplayerStorageRecords(previousSession),
    createTransactionCanceledError(
      createCancellationReasons(writePlan, (operation) =>
        operation.kind === "putSnapshot"
      )
    )
  );
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.commitWritePlan({
      gameId: "game-1",
      transaction,
      writePlan
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "STALE_ACTION"
  );
});

test("maps transaction cancellations without item reasons to persistence conflicts", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBidResult(previousSession, 1, "bid-1", context);
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const client = createMockDynamoClient(
    createMultiplayerStorageRecords(previousSession),
    createTransactionCanceledError(
      writePlan.operations.map(() => ({ Code: "None" }))
    )
  );
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.commitWritePlan({
      gameId: "game-1",
      transaction,
      writePlan
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "PERSISTENCE_CONFLICT"
  );
});

test("maps transaction cancellations without cancellation reasons to persistence conflicts", async () => {
  const context = createTestContext();
  const previousSession = createStartedSession(context);
  const result = submitSeatBidResult(previousSession, 1, "bid-1", context);
  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result
  );
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: TABLE_NAME
  });
  const client = createMockDynamoClient(
    createMultiplayerStorageRecords(previousSession),
    createTransactionCanceledError()
  );
  const store = new DynamoDBMultiplayerStore(client, {
    roomGameIdIndexName: ROOM_GAME_ID_INDEX_NAME,
    tableName: TABLE_NAME
  });

  await assert.rejects(
    () => store.commitWritePlan({
      gameId: "game-1",
      transaction,
      writePlan
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "PERSISTENCE_CONFLICT"
  );
});

test("env factory uses injected config and mock client without AWS credentials", async () => {
  const context = createTestContext();
  const records = createMultiplayerStorageRecords(createStartedSession(context));
  const client = createMockDynamoClient(records);
  const store = createDynamoDBMultiplayerStoreFromEnv(
    {
      SHAKE2_MULTIPLAYER_TABLE_NAME: TABLE_NAME,
      SHAKE2_ROOM_GAME_ID_INDEX_NAME: ROOM_GAME_ID_INDEX_NAME
    },
    client
  );
  const loaded = await store.loadGameSnapshot({
    gameId: "game-1"
  });

  assert.equal(loaded.snapshot.gameId, "game-1");
  assert.equal(client.commands.length, 2);
});

class MockDynamoClient implements DynamoDBDocumentClientLike {
  readonly commands: DynamoDBMultiplayerStoreCommand[] = [];

  constructor(
    private readonly records: MultiplayerStoredGameRecords,
    private readonly transactionFailure?: Error,
    private readonly putFailure?: Error
  ) {}

  async send(
    command: DynamoDBMultiplayerStoreCommand
  ): Promise<DynamoDBMultiplayerStoreCommandOutput> {
    this.commands.push(command);

    if (command instanceof TransactWriteCommand && this.transactionFailure) {
      throw this.transactionFailure;
    }

    if (command instanceof PutCommand) {
      if (this.putFailure) {
        throw this.putFailure;
      }

      return {
        $metadata: {}
      };
    }

    if (command instanceof QueryCommand) {
      const input = getCommandInput(command, QueryCommand);

      if (input.IndexName) {
        return {
          $metadata: {},
          Items: [this.records.room]
        };
      }

      return {
        $metadata: {},
        Items: [
          this.records.snapshot,
          ...this.records.events,
          ...this.records.privateHands
        ]
      };
    }

    if (command instanceof GetCommand) {
      const input = getCommandInput(command, GetCommand);
      const key = input.Key as {
        readonly pk?: string;
        readonly sk?: string;
      } | undefined;

      if (key?.pk === "ROOM#room-1" && key.sk === "META") {
        return {
          $metadata: {},
          Item: this.records.room
        };
      }

      if (key?.pk === "GAME#game-1" && key.sk === "SNAPSHOT#LATEST") {
        return {
          $metadata: {},
          Item: this.records.snapshot
        };
      }

      if (
        key?.pk === "GAME#game-1" &&
        typeof key.sk === "string" &&
        key.sk.startsWith("PRIVATE_HAND#")
      ) {
        const seatIndex = Number(key.sk.replace("PRIVATE_HAND#", ""));
        const item = this.records.privateHands.find((record) =>
          record.seatIndex === seatIndex
        );

        return item
          ? {
              $metadata: {},
              Item: item
            }
          : {
              $metadata: {}
            };
      }

      const actionId = typeof key?.pk === "string"
        ? key.pk.replace("ACTION#", "")
        : "";
      const item = this.records.idempotency.find((record) =>
        record.actionId === actionId
      );

      return item
        ? {
            $metadata: {},
            Item: item
          }
        : {
            $metadata: {}
          };
    }

    return {
      $metadata: {}
    };
  }
}

function createMockDynamoClient(
  records: MultiplayerStoredGameRecords,
  transactionFailure?: Error,
  putFailure?: Error
): MockDynamoClient {
  return new MockDynamoClient(records, transactionFailure, putFailure);
}

function createCancellationReasons(
  writePlan: MultiplayerWritePlan,
  isFailedOperation: (operation: MultiplayerWriteOperation) => boolean
): readonly { readonly Code: string; readonly Message?: string }[] {
  return writePlan.operations.map((operation) =>
    isFailedOperation(operation)
      ? {
          Code: "ConditionalCheckFailed",
          Message: "The conditional request failed."
        }
      : {
          Code: "None"
        }
  );
}

function createTransactionCanceledError(
  cancellationReasons?: readonly { readonly Code: string; readonly Message?: string }[]
): Error {
  const error = new Error("Transaction cancelled") as Error & {
    CancellationReasons?: readonly { readonly Code: string; readonly Message?: string }[];
  };

  error.name = "TransactionCanceledException";

  if (cancellationReasons) {
    error.CancellationReasons = cancellationReasons;
  }

  return error;
}

function createConditionalCheckFailedError(): Error {
  const error = new Error("The conditional request failed.");

  error.name = "ConditionalCheckFailedException";

  return error;
}

function getCommandInput<TCommand extends DynamoDBMultiplayerStoreCommand>(
  command: DynamoDBMultiplayerStoreCommand | undefined,
  commandType: new (...args: never[]) => TCommand
): Record<string, unknown> {
  if (!(command instanceof commandType)) {
    throw new Error(`Expected ${commandType.name}.`);
  }

  return (command as unknown as { readonly input: Record<string, unknown> }).input;
}

function findPutBySortKey(
  transactItems: unknown,
  sk: string
): {
  readonly ConditionExpression?: string;
  readonly ExpressionAttributeValues?: Readonly<Record<string, unknown>>;
  readonly Item: Readonly<Record<string, unknown>>;
} {
  if (!Array.isArray(transactItems)) {
    throw new Error("Expected transaction items.");
  }

  const item = transactItems.find((transactionItem) =>
    isRecord(transactionItem) &&
    isRecord(transactionItem.Put) &&
    isRecord(transactionItem.Put.Item) &&
    transactionItem.Put.Item.sk === sk
  );

  if (!isRecord(item) || !isRecord(item.Put) || !isRecord(item.Put.Item)) {
    throw new Error(`Missing put for ${sk}.`);
  }

  return item.Put as {
    readonly ConditionExpression?: string;
    readonly ExpressionAttributeValues?: Readonly<Record<string, unknown>>;
    readonly Item: Readonly<Record<string, unknown>>;
  };
}

function assertConditionForItem(
  transactItems: unknown,
  pk: string,
  sk: string,
  conditionExpression: string
): void {
  if (!Array.isArray(transactItems)) {
    throw new Error("Expected transaction items.");
  }

  const item = transactItems.find((transactionItem) =>
    isRecord(transactionItem) &&
    isRecord(transactionItem.Put) &&
    isRecord(transactionItem.Put.Item) &&
    transactionItem.Put.Item.pk === pk &&
    transactionItem.Put.Item.sk === sk
  );

  if (!isRecord(item) || !isRecord(item.Put)) {
    throw new Error(`Missing put for ${pk}/${sk}.`);
  }

  assert.equal(item.Put.ConditionExpression, conditionExpression);
}

function assertConditionForSortKey(
  transactItems: unknown,
  sk: string,
  conditionExpression: string
): void {
  const put = findPutBySortKey(transactItems, sk);

  assert.equal(put.ConditionExpression, conditionExpression);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  actionId: string,
  context: EngineContext
): MultiplayerGameSession {
  return submitSeatBidResult(session, seat, actionId, context).session;
}

function submitSeatBidResult(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  actionId: string,
  context: EngineContext
): Extract<MultiplayerSubmitActionResult, { readonly ok: true }> {
  const result = submitMultiplayerGameAction(
    session,
    createMultiplayerActionEnvelope(
      session,
      {
        action: {
          payload: {
            bid: createPassBid(),
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
  );

  if (!result.ok) {
    throw result.error;
  }

  return result;
}

function createReadyRoom(context: EngineContext): MultiplayerRoom {
  let room = createRoom(context);

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
