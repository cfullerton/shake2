import {
  PutCommand
} from "@aws-sdk/lib-dynamodb";

import {
  DynamoDBMultiplayerStore,
  type DynamoDBDocumentClientLike
} from "../dynamodb/store.ts";
import {
  createMultiplayerActionEnvelope,
  createMultiplayerDynamoDbTransactionWritePlan,
  createMultiplayerGameStartWritePlan,
  createMultiplayerRoom,
  createMultiplayerRoomRecord,
  createPassBid,
  joinMultiplayerRoom,
  startMultiplayerGame,
  takeMultiplayerSeat,
  type EngineContext,
  type FortyTwoActionEnvelope,
  type MultiplayerResult,
  type MultiplayerRoom,
  type SeatIndex,
  type SubmitFortyTwoBidAction
} from "../game-engine.ts";

export interface DeployedSmokeSeedClient {
  send(command: unknown): Promise<unknown>;
}

export interface SeedDeployedSmokeGameInput {
  readonly actionId?: string;
  readonly actorPlayerId: string;
  readonly client: DeployedSmokeSeedClient;
  readonly gameId?: string;
  readonly roomCode?: string;
  readonly roomGameIdIndexName: string;
  readonly roomId?: string;
  readonly tableName: string;
}

export interface DeployedSmokeGameSeed {
  readonly action: FortyTwoActionEnvelope<SubmitFortyTwoBidAction>;
  readonly actionJson: string;
  readonly actorPlayerId: string;
  readonly actorSeat: SeatIndex;
  readonly actorSeatEnum: "SEAT_1";
  readonly gameId: string;
  readonly lastEventSequence: number;
  readonly roomCode: string;
  readonly roomId: string;
  readonly snapshotVersion: number;
}

const SMOKE_ACTOR_SEAT = 1 as const;

export async function seedDeployedSmokeGame(
  input: SeedDeployedSmokeGameInput
): Promise<DeployedSmokeGameSeed> {
  const gameId = input.gameId ?? createSmokeSeedId("game");
  const roomId = input.roomId ?? `${gameId}-room`;
  const roomCode = input.roomCode ?? createSmokeRoomCode(gameId);
  const actionId = input.actionId ?? `${gameId}-seat-1-pass`;
  const context = createSmokeSeedEngineContext(gameId);
  const readyRoom = createReadySmokeRoom(
    {
      actorPlayerId: input.actorPlayerId,
      roomCode,
      roomId
    },
    context
  );

  await input.client.send(
    new PutCommand({
      ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      Item: createMultiplayerRoomRecord(readyRoom),
      TableName: input.tableName
    })
  );

  const session = unwrapMultiplayerResult(
    startMultiplayerGame(
      readyRoom,
      {
        actorId: input.actorPlayerId,
        dealer: 0,
        gameId
      },
      context
    )
  );
  const writePlan = createMultiplayerGameStartWritePlan(readyRoom, session);
  const transaction = createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: input.tableName
  });
  const store = new DynamoDBMultiplayerStore(
    input.client as DynamoDBDocumentClientLike,
    {
      roomGameIdIndexName: input.roomGameIdIndexName,
      tableName: input.tableName
    }
  );

  await store.commitWritePlan({
    gameId,
    transaction,
    writePlan
  });

  const action = createMultiplayerActionEnvelope<SubmitFortyTwoBidAction>(
    session,
    {
      action: {
        payload: {
          bid: createPassBid(),
          seat: SMOKE_ACTOR_SEAT
        },
        type: "fortyTwo.bid.submit"
      },
      actionId,
      actorId: input.actorPlayerId
    },
    context
  );

  return {
    action,
    actionJson: JSON.stringify(action),
    actorPlayerId: input.actorPlayerId,
    actorSeat: SMOKE_ACTOR_SEAT,
    actorSeatEnum: "SEAT_1",
    gameId,
    lastEventSequence: session.snapshot.lastEventSequence,
    roomCode,
    roomId,
    snapshotVersion: session.snapshot.snapshotVersion
  };
}

function createReadySmokeRoom(
  input: {
    readonly actorPlayerId: string;
    readonly roomCode: string;
    readonly roomId: string;
  },
  context: EngineContext
): MultiplayerRoom {
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Smoke Player",
      hostPlayerId: input.actorPlayerId,
      roomCode: input.roomCode,
      roomId: input.roomId
    },
    context
  );

  for (const participant of [
    {
      displayName: "Smoke Bot North",
      playerId: `${input.roomId}-bot-0`
    },
    {
      displayName: "Smoke Bot South",
      playerId: `${input.roomId}-bot-2`
    },
    {
      displayName: "Smoke Bot West",
      playerId: `${input.roomId}-bot-3`
    }
  ]) {
    room = unwrapMultiplayerResult(
      joinMultiplayerRoom(room, participant, context)
    );
  }

  const seatAssignments: ReadonlyArray<{
    readonly playerId: string;
    readonly seat: SeatIndex;
  }> = [
    {
      playerId: `${input.roomId}-bot-0`,
      seat: 0
    },
    {
      playerId: input.actorPlayerId,
      seat: SMOKE_ACTOR_SEAT
    },
    {
      playerId: `${input.roomId}-bot-2`,
      seat: 2
    },
    {
      playerId: `${input.roomId}-bot-3`,
      seat: 3
    }
  ];

  for (const assignment of seatAssignments) {
    room = unwrapMultiplayerResult(
      takeMultiplayerSeat(room, assignment, context)
    );
  }

  return room;
}

function createSmokeSeedEngineContext(seed: string): EngineContext {
  let id = 0;
  let timestampOffset = 0;
  let randomState = hashSeed(seed);
  const baseTime = Date.UTC(2026, 4, 30, 12, 0, 0);

  return {
    newId: () => {
      id += 1;
      return `${seed}-id-${id}`;
    },
    now: () => {
      const timestamp = new Date(baseTime + timestampOffset * 1000).toISOString();

      timestampOffset += 1;
      return timestamp;
    },
    random: () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;

      return randomState / 0x100000000;
    }
  };
}

function createSmokeSeedId(kind: string): string {
  return `smoke-${kind}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createSmokeRoomCode(seed: string): string {
  return `SMK${hashSeed(seed).toString(36).toUpperCase().slice(0, 6)}`;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function unwrapMultiplayerResult<TValue>(
  result: MultiplayerResult<TValue>
): TValue {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}
