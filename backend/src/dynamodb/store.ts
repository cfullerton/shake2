import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  type GetCommandOutput,
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
  type MultiplayerWritePlan,
  type SeatIndex
} from "../game-engine.ts";

export interface LoadGameSnapshotInput {
  readonly gameId: string;
}

export interface LoadPublicSnapshotInput {
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
  | QueryCommand
  | TransactWriteCommand;

export type DynamoDBMultiplayerStoreCommandOutput =
  | GetCommandOutput
  | QueryCommandOutput
  | TransactWriteCommandOutput;

export interface DynamoDBDocumentClientLike {
  send(
    command: DynamoDBMultiplayerStoreCommand
  ): Promise<DynamoDBMultiplayerStoreCommandOutput>;
}

export interface DynamoDBMultiplayerStoreConfig {
  readonly consistentRead?: boolean;
  readonly roomGameIdIndexName: string;
  readonly tableName: string;
}

export interface DynamoDBMultiplayerStoreEnvConfig {
  readonly AWS_REGION?: string;
  readonly SHAKE2_MULTIPLAYER_TABLE_NAME?: string;
  readonly SHAKE2_ROOM_GAME_ID_INDEX_NAME?: string;
}

export class DynamoDBMultiplayerStore implements MultiplayerStore {
  private readonly client: DynamoDBDocumentClientLike;
  private readonly config: DynamoDBMultiplayerStoreConfig;

  constructor(
    client: DynamoDBDocumentClientLike,
    config: DynamoDBMultiplayerStoreConfig
  ) {
    this.client = client;
    this.config = {
      ...config,
      consistentRead: config.consistentRead ?? true
    };
    assertNonEmptyString(this.config.tableName, "DynamoDB table name");
    assertNonEmptyString(
      this.config.roomGameIdIndexName,
      "DynamoDB room game ID index name"
    );
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
    const output = await this.client.send(
      new GetCommand({
        ConsistentRead: this.config.consistentRead,
        Key: {
          pk: `GAME#${input.gameId}`,
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
      this.loadPublicSnapshot({
        gameId: input.gameId
      }),
      this.loadRoomRecord(input.gameId),
      this.loadPendingIdempotencyResults(input.gameId, input.pendingActionIds)
    ]);
    const actorSeat = getSeatForPlayer(room, input.actorPlayerId);

    if (!room.room.participants[input.actorPlayerId]) {
      throw new BackendResolverError(
        "INVALID_ACTOR",
        "Player is not a member of this room."
      );
    }

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

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: createSdkTransactItems(input.transaction)
      })
    );
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
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient(
      env.AWS_REGION ? { region: env.AWS_REGION } : {}
    )
  );

  return new DynamoDBMultiplayerStore(documentClient, {
    roomGameIdIndexName,
    tableName
  });
}

export function createUnimplementedMultiplayerStore(): MultiplayerStore {
  return {
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
