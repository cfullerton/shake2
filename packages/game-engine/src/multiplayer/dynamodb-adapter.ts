import { EngineError } from "../errors.ts";
import {
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameEventRecord,
  type MultiplayerPrivateHandRecord,
  type MultiplayerRoomRecord,
  type MultiplayerSnapshotRecord
} from "./storage.ts";
import {
  type MultiplayerWriteCondition,
  type MultiplayerWriteOperation,
  type MultiplayerWritePlan
} from "./write-plan.ts";

export type MultiplayerDynamoDbItem =
  | MultiplayerRoomRecord
  | MultiplayerGameEventRecord
  | MultiplayerSnapshotRecord
  | MultiplayerPrivateHandRecord
  | MultiplayerActionIdempotencyRecord;

export interface MultiplayerDynamoDbPut {
  readonly ConditionExpression?: string;
  readonly ExpressionAttributeNames?: Readonly<Record<string, string>>;
  readonly ExpressionAttributeValues?: Readonly<Record<string, unknown>>;
  readonly Item: MultiplayerDynamoDbItem;
  readonly TableName: string;
}

export interface MultiplayerDynamoDbTransactionItem {
  readonly Put: MultiplayerDynamoDbPut;
}

export interface MultiplayerDynamoDbTransactionWritePlan {
  readonly gameId: string;
  readonly kind: MultiplayerWritePlan["kind"];
  readonly tableName: string;
  readonly transactItems: readonly MultiplayerDynamoDbTransactionItem[];
}

export interface CreateMultiplayerDynamoDbTransactionWritePlanOptions {
  readonly tableName: string;
}

interface DynamoDbConditionExpression {
  readonly ConditionExpression: string;
  readonly ExpressionAttributeNames: Readonly<Record<string, string>>;
  readonly ExpressionAttributeValues?: Readonly<Record<string, unknown>>;
}

export function createMultiplayerDynamoDbTransactionWritePlan(
  plan: MultiplayerWritePlan,
  options: CreateMultiplayerDynamoDbTransactionWritePlanOptions
): MultiplayerDynamoDbTransactionWritePlan {
  assertTableName(options.tableName);
  assertPrivateHandWritesHaveSnapshotGuard(plan);

  return {
    gameId: plan.gameId,
    kind: plan.kind,
    tableName: options.tableName,
    transactItems: plan.operations.map((operation) =>
      createDynamoDbTransactionItem(operation, options.tableName)
    )
  };
}

function createDynamoDbTransactionItem(
  operation: MultiplayerWriteOperation,
  tableName: string
): MultiplayerDynamoDbTransactionItem {
  const condition = createConditionExpression(operation);

  return {
    Put: {
      Item: operation.record,
      TableName: tableName,
      ...(condition ? condition : {})
    }
  };
}

function createConditionExpression(
  operation: MultiplayerWriteOperation
): DynamoDbConditionExpression | null {
  switch (operation.condition.kind) {
    case "mustNotExist":
      return createMustNotExistExpression(operation.condition);
    case "roomStateMatches":
      return createRoomStateMatchesExpression(operation.condition);
    case "snapshotMatches":
      return operation.kind === "putPrivateHand"
        ? null
        : createSnapshotMatchesExpression(operation.condition);
  }
}

function createMustNotExistExpression(
  _condition: Extract<MultiplayerWriteCondition, { readonly kind: "mustNotExist" }>
): DynamoDbConditionExpression {
  return {
    ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#sk": "sk"
    }
  };
}

function createRoomStateMatchesExpression(
  condition: Extract<
    MultiplayerWriteCondition,
    { readonly kind: "roomStateMatches" }
  >
): DynamoDbConditionExpression {
  const gameIdExpression = condition.expectedGameId === null
    ? "attribute_not_exists(#gameId)"
    : "#gameId = :expectedGameId";

  return {
    ConditionExpression: "#pk = :pk AND #sk = :sk AND #status = :expectedStatus AND " +
      gameIdExpression,
    ExpressionAttributeNames: {
      "#gameId": "gameId",
      "#pk": "pk",
      "#sk": "sk",
      "#status": "status"
    },
    ExpressionAttributeValues: {
      ":expectedStatus": condition.expectedStatus,
      ...(condition.expectedGameId !== null
        ? { ":expectedGameId": condition.expectedGameId }
        : {}),
      ":pk": condition.pk,
      ":sk": condition.sk
    }
  };
}

function createSnapshotMatchesExpression(
  condition: Extract<MultiplayerWriteCondition, { readonly kind: "snapshotMatches" }>
): DynamoDbConditionExpression {
  return {
    ConditionExpression: "#pk = :pk AND #sk = :sk AND #gameId = :expectedGameId AND #snapshotVersion = :expectedSnapshotVersion AND #lastEventSequence = :expectedLastEventSequence",
    ExpressionAttributeNames: {
      "#gameId": "gameId",
      "#lastEventSequence": "lastEventSequence",
      "#pk": "pk",
      "#sk": "sk",
      "#snapshotVersion": "snapshotVersion"
    },
    ExpressionAttributeValues: {
      ":expectedGameId": condition.gameId,
      ":expectedLastEventSequence": condition.expectedLastEventSequence,
      ":expectedSnapshotVersion": condition.expectedSnapshotVersion,
      ":pk": `GAME#${condition.gameId}`,
      ":sk": "SNAPSHOT#LATEST"
    }
  };
}

function assertPrivateHandWritesHaveSnapshotGuard(
  plan: MultiplayerWritePlan
): void {
  const snapshotGuards = plan.operations
    .filter((operation) => operation.kind === "putSnapshot")
    .map((operation) => operation.condition)
    .filter((condition): condition is Extract<
      MultiplayerWriteCondition,
      { readonly kind: "snapshotMatches" }
    > => condition.kind === "snapshotMatches");

  for (const operation of plan.operations) {
    if (operation.kind !== "putPrivateHand") {
      continue;
    }

    const condition = operation.condition;

    if (condition.kind !== "snapshotMatches") {
      continue;
    }

    const hasMatchingSnapshotGuard = snapshotGuards.some((snapshotGuard) =>
      snapshotGuard.gameId === condition.gameId &&
      snapshotGuard.expectedLastEventSequence ===
        condition.expectedLastEventSequence &&
      snapshotGuard.expectedSnapshotVersion ===
        condition.expectedSnapshotVersion
    );

    if (!hasMatchingSnapshotGuard) {
      throw new EngineError(
        "INVALID_ACTION",
        "Private hand writes with snapshot conditions require a matching snapshot write."
      );
    }
  }
}

function assertTableName(tableName: string): void {
  if (tableName.trim().length === 0) {
    throw new EngineError("INVALID_ACTION", "DynamoDB table name is required.");
  }
}
