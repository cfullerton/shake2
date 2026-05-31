import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  type GetCommandOutput,
  type PutCommandOutput,
  type QueryCommandOutput,
  type TransactWriteCommandOutput
} from "@aws-sdk/lib-dynamodb";

import { BackendResolverError } from "../errors/errors.ts";
import {
  parseMultiplayerActionIdempotencyRecord,
  parseMultiplayerGameEventRecord,
  parseMultiplayerPrivateHandRecord,
  parseMultiplayerRoomRecord,
  parseMultiplayerSnapshotRecord,
  parseMultiplayerStoredGameRecords,
  SEAT_INDICES,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerDynamoDbTransactionWritePlan,
  type MultiplayerGameEventRecord,
  type MultiplayerPrivateHandRecord,
  type MultiplayerRoomRecord,
  type MultiplayerSnapshotRecord,
  type MultiplayerStoredGameRecords,
  type MultiplayerWriteOperation,
  type MultiplayerWritePlan,
  type SeatIndex
} from "../game-engine.ts";

export interface LoadGameSnapshotInput {
  readonly gameId: string;
}

export interface LoadRoomInput {
  readonly roomId: string;
}

export interface LoadRoomByCodeInput {
  readonly roomCode: string;
}

export interface CreateRoomRecordInput {
  readonly room: MultiplayerRoomRecord;
}

export interface SaveRoomRecordInput {
  readonly previousRoom: MultiplayerRoomRecord;
  readonly room: MultiplayerRoomRecord;
}

export interface LoadPublicSnapshotInput {
  readonly actorPlayerId: string;
  readonly gameId: string;
}

export interface LoadPrivateHandInput {
  readonly gameId: string;
  readonly seatIndex: SeatIndex;
}

export interface LoadIdempotencyResultInput {
  readonly actionId: string;
  readonly gameId: string;
}

export interface LoadReconnectRecordsInput {
  readonly actorPlayerId: string;
  readonly gameId: string;
  readonly pendingActionIds: readonly string[];
}

export interface MultiplayerReconnectRecords {
  readonly idempotency: readonly MultiplayerActionIdempotencyRecord[];
  readonly privateHand?: MultiplayerPrivateHandRecord;
  readonly snapshot: MultiplayerSnapshotRecord;
}

export interface CommitWritePlanInput {
  readonly gameId: string;
  readonly transaction: MultiplayerDynamoDbTransactionWritePlan;
  readonly writePlan: MultiplayerWritePlan;
}

export interface MultiplayerStore {
  loadRoom(
    input: LoadRoomInput
  ): Promise<MultiplayerRoomRecord>;
  loadRoomByCode(
    input: LoadRoomByCodeInput
  ): Promise<MultiplayerRoomRecord>;
  createRoomRecord(input: CreateRoomRecordInput): Promise<MultiplayerRoomRecord>;
  saveRoomRecord(input: SaveRoomRecordInput): Promise<MultiplayerRoomRecord>;
  loadGameSnapshot(
    input: LoadGameSnapshotInput
  ): Promise<MultiplayerStoredGameRecords>;
  loadPublicSnapshot(
    input: LoadPublicSnapshotInput
  ): Promise<MultiplayerSnapshotRecord>;
  loadPrivateHand(
    input: LoadPrivateHandInput
  ): Promise<MultiplayerPrivateHandRecord>;
  loadIdempotencyResult(
    input: LoadIdempotencyResultInput
  ): Promise<MultiplayerActionIdempotencyRecord | null>;
  loadReconnectRecords(
    input: LoadReconnectRecordsInput
  ): Promise<MultiplayerReconnectRecords>;
  commitWritePlan(input: CommitWritePlanInput): Promise<void>;
}

export type DynamoDBMultiplayerStoreCommand =
  | GetCommand
  | PutCommand
  | QueryCommand
  | TransactWriteCommand;

export type DynamoDBMultiplayerStoreCommandOutput =
  | GetCommandOutput
  | PutCommandOutput
  | QueryCommandOutput
  | TransactWriteCommandOutput;

export interface DynamoDBDocumentClientLike {
  send(
    command: DynamoDBMultiplayerStoreCommand
  ): Promise<DynamoDBMultiplayerStoreCommandOutput>;
}

export interface DynamoDBMultiplayerStoreConfig {
  readonly consistentRead?: boolean;
  readonly roomCodeIndexName?: string;
  readonly roomGameIdIndexName: string;
  readonly tableName: string;
}

export interface DynamoDBMultiplayerStoreEnvConfig {
  readonly AWS_REGION?: string;
  readonly SHAKE2_MULTIPLAYER_TABLE_NAME?: string;
  readonly SHAKE2_ROOM_CODE_INDEX_NAME?: string;
  readonly SHAKE2_ROOM_GAME_ID_INDEX_NAME?: string;
}

export class DynamoDBMultiplayerStore implements MultiplayerStore {
  private readonly client: DynamoDBDocumentClientLike;
  private readonly config: DynamoDBMultiplayerStoreConfig & {
    readonly consistentRead: boolean;
    readonly roomCodeIndexName: string;
  };

  constructor(
    client: DynamoDBDocumentClientLike,
    config: DynamoDBMultiplayerStoreConfig
  ) {
    this.client = client;
    this.config = {
      ...config,
      consistentRead: config.consistentRead ?? true,
      roomCodeIndexName: config.roomCodeIndexName ?? "RoomCodeIndex"
    };
    assertNonEmptyString(this.config.tableName, "DynamoDB table name");
    assertNonEmptyString(
      this.config.roomGameIdIndexName,
      "DynamoDB room game ID index name"
    );
    assertNonEmptyString(
      this.config.roomCodeIndexName,
      "DynamoDB room code index name"
    );
  }

  async loadRoom(input: LoadRoomInput): Promise<MultiplayerRoomRecord> {
    const output = await this.client.send(
      new GetCommand({
        ConsistentRead: this.config.consistentRead,
        Key: {
          pk: `ROOM#${input.roomId}`,
          sk: "META"
        },
        TableName: this.config.tableName
      })
    );
    const item = "Item" in output ? output.Item : undefined;

    if (!item) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer room was not found."
      );
    }

    return parseMultiplayerRoomRecord(item);
  }

  async loadRoomByCode(
    input: LoadRoomByCodeInput
  ): Promise<MultiplayerRoomRecord> {
    const output = await this.client.send(
      new QueryCommand({
        ExpressionAttributeNames: {
          "#roomCode": "roomCode"
        },
        ExpressionAttributeValues: {
          ":roomCode": input.roomCode
        },
        IndexName: this.config.roomCodeIndexName,
        KeyConditionExpression: "#roomCode = :roomCode",
        Limit: 10,
        ScanIndexForward: false,
        TableName: this.config.tableName
      })
    );
    const room = getOutputItems(output)
      .map((item) => parseMultiplayerRoomRecord(item))
      .find((record) => record.roomCode === input.roomCode);

    if (!room) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer room code was not found."
      );
    }

    return room;
  }

  async createRoomRecord(
    input: CreateRoomRecordInput
  ): Promise<MultiplayerRoomRecord> {
    const room = parseMultiplayerRoomRecord(input.room);

    try {
      await this.client.send(
        new PutCommand({
          ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk": "sk"
          },
          Item: room,
          TableName: this.config.tableName
        })
      );
    } catch (error) {
      throw mapDynamoDbConditionalWriteError(
        error,
        "Room already exists or conflicted with another write."
      );
    }

    return room;
  }

  async saveRoomRecord(
    input: SaveRoomRecordInput
  ): Promise<MultiplayerRoomRecord> {
    const previousRoom = parseMultiplayerRoomRecord(input.previousRoom);
    const room = parseMultiplayerRoomRecord(input.room);

    try {
      await this.client.send(
        new PutCommand({
          ConditionExpression: "#pk = :pk AND #sk = :sk AND #updatedAt = :expectedUpdatedAt AND #status = :expectedStatus",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk": "sk",
            "#status": "status",
            "#updatedAt": "updatedAt"
          },
          ExpressionAttributeValues: {
            ":expectedStatus": previousRoom.status,
            ":expectedUpdatedAt": previousRoom.updatedAt,
            ":pk": previousRoom.pk,
            ":sk": previousRoom.sk
          },
          Item: room,
          TableName: this.config.tableName
        })
      );
    } catch (error) {
      throw mapDynamoDbConditionalWriteError(
        error,
        "Room changed before the update could commit."
      );
    }

    return room;
  }

  async loadGameSnapshot(
    input: LoadGameSnapshotInput
  ): Promise<MultiplayerStoredGameRecords> {
    const gameKey = `GAME#${input.gameId}`;
    const [gameRecords, roomRecord] = await Promise.all([
      this.loadGameRecords(gameKey),
      this.loadRoomRecord(input.gameId)
    ]);
    const records = {
      events: gameRecords.events,
      idempotency: [],
      privateHands: gameRecords.privateHands,
      room: roomRecord,
      snapshot: gameRecords.snapshot
    };

    return parseMultiplayerStoredGameRecords(records);
  }

  async loadPublicSnapshot(
    input: LoadPublicSnapshotInput
  ): Promise<MultiplayerSnapshotRecord> {
    const [snapshot, room] = await Promise.all([
      this.loadPublicSnapshotRecord(input.gameId),
      this.loadRoomRecord(input.gameId)
    ]);

    assertPlayerIsRoomMember(room, input.actorPlayerId);

    return snapshot;
  }

  private async loadPublicSnapshotRecord(
    gameId: string
  ): Promise<MultiplayerSnapshotRecord> {
    const output = await this.client.send(
      new GetCommand({
        ConsistentRead: this.config.consistentRead,
        Key: {
          pk: `GAME#${gameId}`,
          sk: "SNAPSHOT#LATEST"
        },
        TableName: this.config.tableName
      })
    );
    const item = "Item" in output ? output.Item : undefined;

    if (!item) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer game snapshot was not found."
      );
    }

    return parseMultiplayerSnapshotRecord(item);
  }

  async loadPrivateHand(
    input: LoadPrivateHandInput
  ): Promise<MultiplayerPrivateHandRecord> {
    const record = await this.loadPrivateHandIfPresent(input);

    if (!record) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer private hand was not found."
      );
    }

    return record;
  }

  async loadIdempotencyResult(
    input: LoadIdempotencyResultInput
  ): Promise<MultiplayerActionIdempotencyRecord | null> {
    const output = await this.client.send(
      new GetCommand({
        ConsistentRead: this.config.consistentRead,
        Key: {
          pk: `ACTION#${input.actionId}`,
          sk: "RESULT"
        },
        TableName: this.config.tableName
      })
    );
    const item = "Item" in output ? output.Item : undefined;

    if (!item) {
      return null;
    }

    const record = parseMultiplayerActionIdempotencyRecord(item);

    if (record.gameId !== input.gameId) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Action idempotency record belongs to a different game."
      );
    }

    return record;
  }

  async loadReconnectRecords(
    input: LoadReconnectRecordsInput
  ): Promise<MultiplayerReconnectRecords> {
    const [snapshot, room, idempotency] = await Promise.all([
      this.loadPublicSnapshotRecord(input.gameId),
      this.loadRoomRecord(input.gameId),
      this.loadPendingIdempotencyResults(input.gameId, input.pendingActionIds)
    ]);
    const actorSeat = getSeatForPlayer(room, input.actorPlayerId);

    assertPlayerIsRoomMember(room, input.actorPlayerId);

    const privateHand = actorSeat === null
      ? null
      : await this.loadPrivateHandIfPresent({
          gameId: input.gameId,
          seatIndex: actorSeat
        });

    return {
      idempotency,
      ...(privateHand ? { privateHand } : {}),
      snapshot
    };
  }

  async commitWritePlan(input: CommitWritePlanInput): Promise<void> {
    if (input.transaction.gameId !== input.gameId) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "DynamoDB transaction belongs to a different game."
      );
    }

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: createSdkTransactItems(input.transaction)
        })
      );
    } catch (error) {
      throw mapDynamoDbTransactionError(error, input.writePlan);
    }
  }

  private async loadGameRecords(gameKey: string): Promise<{
    readonly events: readonly MultiplayerGameEventRecord[];
    readonly privateHands: readonly MultiplayerPrivateHandRecord[];
    readonly snapshot: MultiplayerSnapshotRecord;
  }> {
    const output = await this.client.send(
      new QueryCommand({
        ConsistentRead: this.config.consistentRead,
        ExpressionAttributeNames: {
          "#pk": "pk"
        },
        ExpressionAttributeValues: {
          ":pk": gameKey
        },
        KeyConditionExpression: "#pk = :pk",
        TableName: this.config.tableName
      })
    );
    const items = getOutputItems(output);
    const events: MultiplayerGameEventRecord[] = [];
    const privateHands: MultiplayerPrivateHandRecord[] = [];
    let snapshot: MultiplayerSnapshotRecord | null = null;

    for (const item of items) {
      const sk = getItemSortKey(item);

      if (sk === "SNAPSHOT#LATEST") {
        snapshot = parseMultiplayerSnapshotRecord(item);
        continue;
      }

      if (sk.startsWith("EVENT#")) {
        events.push(parseMultiplayerGameEventRecord(item));
        continue;
      }

      if (sk.startsWith("PRIVATE_HAND#")) {
        privateHands.push(parseMultiplayerPrivateHandRecord(item));
      }
    }

    if (!snapshot) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer game snapshot was not found."
      );
    }

    return {
      events: events.sort((left, right) => left.sequence - right.sequence),
      privateHands: privateHands.sort((left, right) =>
        left.seatIndex - right.seatIndex
      ),
      snapshot
    };
  }

  private async loadRoomRecord(gameId: string): Promise<MultiplayerRoomRecord> {
    const output = await this.client.send(
      new QueryCommand({
        ExpressionAttributeNames: {
          "#gameId": "gameId",
          "#sk": "sk"
        },
        ExpressionAttributeValues: {
          ":gameId": gameId,
          ":sk": "META"
        },
        IndexName: this.config.roomGameIdIndexName,
        KeyConditionExpression: "#gameId = :gameId AND #sk = :sk",
        TableName: this.config.tableName
      })
    );
    const items = getOutputItems(output);
    const room = items
      .map((item) => parseMultiplayerRoomRecord(item))
      .find((record) => record.gameId === gameId);

    if (!room) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Multiplayer room record was not found."
      );
    }

    return room;
  }

  private async loadPrivateHandIfPresent(
    input: LoadPrivateHandInput
  ): Promise<MultiplayerPrivateHandRecord | null> {
    const output = await this.client.send(
      new GetCommand({
        ConsistentRead: this.config.consistentRead,
        Key: {
          pk: `GAME#${input.gameId}`,
          sk: `PRIVATE_HAND#${input.seatIndex}`
        },
        TableName: this.config.tableName
      })
    );
    const item = "Item" in output ? output.Item : undefined;

    if (!item) {
      return null;
    }

    const record = parseMultiplayerPrivateHandRecord(item);

    if (record.gameId !== input.gameId || record.seatIndex !== input.seatIndex) {
      throw new BackendResolverError(
        "GAME_NOT_FOUND",
        "Private hand record belongs to a different game or seat."
      );
    }

    return record;
  }

  private async loadPendingIdempotencyResults(
    gameId: string,
    actionIds: readonly string[]
  ): Promise<readonly MultiplayerActionIdempotencyRecord[]> {
    const uniqueActionIds = [...new Set(actionIds)];
    const records = await Promise.all(
      uniqueActionIds.map(async (actionId) => {
        const output = await this.client.send(
          new GetCommand({
            ConsistentRead: this.config.consistentRead,
            Key: {
              pk: `ACTION#${actionId}`,
              sk: "RESULT"
            },
            TableName: this.config.tableName
          })
        );
        const item = "Item" in output ? output.Item : undefined;

        if (!item) {
          return null;
        }

        const record = parseMultiplayerActionIdempotencyRecord(item);

        return record.gameId === gameId ? record : null;
      })
    );

    return records.filter((record): record is MultiplayerActionIdempotencyRecord =>
      record !== null
    );
  }
}

function createSdkTransactItems(
  transaction: MultiplayerDynamoDbTransactionWritePlan
): TransactWriteCommandInput["TransactItems"] {
  return transaction.transactItems.map((item) => {
    const put = item.Put;

    return {
      Put: {
        ...(put.ConditionExpression !== undefined
          ? { ConditionExpression: put.ConditionExpression }
          : {}),
        ...(put.ExpressionAttributeNames !== undefined
          ? {
              ExpressionAttributeNames: {
                ...put.ExpressionAttributeNames
              }
            }
          : {}),
        ...(put.ExpressionAttributeValues !== undefined
          ? {
              ExpressionAttributeValues: {
                ...put.ExpressionAttributeValues
              }
            }
          : {}),
        Item: {
          ...put.Item
        },
        TableName: put.TableName
      }
    };
  });
}

function mapDynamoDbTransactionError(
  error: unknown,
  writePlan: MultiplayerWritePlan
): Error {
  if (!isTransactionCanceledError(error)) {
    return error instanceof Error
      ? error
      : new BackendResolverError(
          "PERSISTENCE_ERROR",
          "Unexpected DynamoDB transaction failure."
        );
  }

  const failedOperation = findFirstFailedOperation(
    error.CancellationReasons ?? [],
    writePlan.operations
  );

  if (!failedOperation) {
    return new BackendResolverError(
      "PERSISTENCE_CONFLICT",
      "DynamoDB transaction was cancelled before the write could commit."
    );
  }

  if (failedOperation.reason.Code !== "ConditionalCheckFailed") {
    return new BackendResolverError(
      "PERSISTENCE_ERROR",
      failedOperation.reason.Message ??
        "DynamoDB transaction failed before the write could commit."
    );
  }

  return mapConditionalWriteFailure(failedOperation.operation);
}

function findFirstFailedOperation(
  reasons: readonly DynamoDbCancellationReason[],
  operations: readonly MultiplayerWriteOperation[]
): {
  readonly operation: MultiplayerWriteOperation;
  readonly reason: DynamoDbCancellationReason;
} | null {
  for (const [index, reason] of reasons.entries()) {
    if (reason.Code === undefined || reason.Code === "None") {
      continue;
    }

    const operation = operations[index];

    if (operation) {
      return {
        operation,
        reason
      };
    }
  }

  return null;
}

function mapConditionalWriteFailure(
  operation: MultiplayerWriteOperation
): BackendResolverError {
  if (operation.kind === "putActionResult") {
    return new BackendResolverError(
      "DUPLICATE_ACTION",
      "Action result already exists."
    );
  }

  if (
    operation.condition.kind === "snapshotMatches" ||
    operation.kind === "putEvent" ||
    operation.kind === "putRoom"
  ) {
    return new BackendResolverError(
      "STALE_ACTION",
      "Game state changed before the action could commit."
    );
  }

  return new BackendResolverError(
    "PERSISTENCE_CONFLICT",
    "Multiplayer write conflicted with existing persisted records."
  );
}

interface DynamoDbTransactionCanceledError extends Error {
  readonly CancellationReasons?: readonly DynamoDbCancellationReason[];
}

interface DynamoDbCancellationReason {
  readonly Code?: string;
  readonly Message?: string;
}

function isTransactionCanceledError(
  error: unknown
): error is DynamoDbTransactionCanceledError {
  return error instanceof Error && error.name === "TransactionCanceledException";
}

function mapDynamoDbConditionalWriteError(
  error: unknown,
  message: string
): Error {
  if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
    return new BackendResolverError("PERSISTENCE_CONFLICT", message);
  }

  return error instanceof Error
    ? error
    : new BackendResolverError(
        "PERSISTENCE_ERROR",
        "Unexpected DynamoDB conditional write failure."
      );
}

export function createDynamoDBMultiplayerStoreFromEnv(
  env: DynamoDBMultiplayerStoreEnvConfig,
  client?: DynamoDBDocumentClientLike
): DynamoDBMultiplayerStore {
  const tableName = requireEnvValue(
    env.SHAKE2_MULTIPLAYER_TABLE_NAME,
    "SHAKE2_MULTIPLAYER_TABLE_NAME"
  );
  const roomGameIdIndexName = requireEnvValue(
    env.SHAKE2_ROOM_GAME_ID_INDEX_NAME,
    "SHAKE2_ROOM_GAME_ID_INDEX_NAME"
  );
  const roomCodeIndexName = env.SHAKE2_ROOM_CODE_INDEX_NAME ?? "RoomCodeIndex";
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient(
      env.AWS_REGION ? { region: env.AWS_REGION } : {}
    )
  );

  return new DynamoDBMultiplayerStore(documentClient, {
    roomCodeIndexName,
    roomGameIdIndexName,
    tableName
  });
}

export function createUnimplementedMultiplayerStore(): MultiplayerStore {
  return {
    async loadRoom(): Promise<MultiplayerRoomRecord> {
      throw new Error("MultiplayerStore.loadRoom is not implemented.");
    },
    async loadRoomByCode(): Promise<MultiplayerRoomRecord> {
      throw new Error("MultiplayerStore.loadRoomByCode is not implemented.");
    },
    async createRoomRecord(): Promise<MultiplayerRoomRecord> {
      throw new Error("MultiplayerStore.createRoomRecord is not implemented.");
    },
    async saveRoomRecord(): Promise<MultiplayerRoomRecord> {
      throw new Error("MultiplayerStore.saveRoomRecord is not implemented.");
    },
    async loadGameSnapshot(): Promise<MultiplayerStoredGameRecords> {
      throw new Error("MultiplayerStore.loadGameSnapshot is not implemented.");
    },
    async loadPublicSnapshot(): Promise<MultiplayerSnapshotRecord> {
      throw new Error("MultiplayerStore.loadPublicSnapshot is not implemented.");
    },
    async loadPrivateHand(): Promise<MultiplayerPrivateHandRecord> {
      throw new Error("MultiplayerStore.loadPrivateHand is not implemented.");
    },
    async loadIdempotencyResult(): Promise<MultiplayerActionIdempotencyRecord | null> {
      throw new Error("MultiplayerStore.loadIdempotencyResult is not implemented.");
    },
    async loadReconnectRecords(): Promise<MultiplayerReconnectRecords> {
      throw new Error("MultiplayerStore.loadReconnectRecords is not implemented.");
    },
    async commitWritePlan(): Promise<void> {
      throw new Error("MultiplayerStore.commitWritePlan is not implemented.");
    }
  };
}

function getSeatForPlayer(
  room: MultiplayerRoomRecord,
  playerId: string
): SeatIndex | null {
  const seat = SEAT_INDICES.find((seatIndex) =>
    room.room.seats[seatIndex]?.playerId === playerId
  );

  return seat ?? null;
}

function assertPlayerIsRoomMember(
  room: MultiplayerRoomRecord,
  playerId: string
): void {
  if (!room.room.participants[playerId]) {
    throw new BackendResolverError(
      "INVALID_ACTOR",
      "Player is not a member of this room."
    );
  }
}

function getOutputItems(
  output: DynamoDBMultiplayerStoreCommandOutput
): readonly Record<string, unknown>[] {
  if (!("Items" in output) || !output.Items) {
    return [];
  }

  return output.Items as Record<string, unknown>[];
}

function getItemSortKey(item: Record<string, unknown>): string {
  const sk = item.sk;

  if (typeof sk !== "string") {
    throw new BackendResolverError(
      "PERSISTENCE_ERROR",
      "DynamoDB item is missing a string sort key."
    );
  }

  return sk;
}

function requireEnvValue(
  value: string | undefined,
  name: string
): string {
  if (!value || value.trim().length === 0) {
    throw new BackendResolverError(
      "PERSISTENCE_ERROR",
      `${name} is required.`
    );
  }

  return value;
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new BackendResolverError(
      "PERSISTENCE_ERROR",
      `${label} is required.`
    );
  }
}
