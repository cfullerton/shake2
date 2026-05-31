import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface MultiplayerDataConstructProps {
  readonly publicRoomsIndexName: string;
  readonly removalPolicy: RemovalPolicy;
  readonly roomCodeIndexName: string;
  readonly roomGameIdIndexName: string;
  readonly tableName: string;
}

export class MultiplayerDataConstruct extends Construct {
  readonly multiplayerTable: Table;

  constructor(scope: Construct, id: string, props: MultiplayerDataConstructProps) {
    super(scope, id);

    this.multiplayerTable = new Table(this, "MultiplayerTable", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      deletionProtection: props.removalPolicy === RemovalPolicy.RETAIN,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING
      },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 35
      },
      removalPolicy: props.removalPolicy,
      sortKey: {
        name: "sk",
        type: AttributeType.STRING
      },
      tableName: props.tableName,
      timeToLiveAttribute: "expiresAt"
    });

    this.multiplayerTable.addGlobalSecondaryIndex({
      indexName: props.roomGameIdIndexName,
      partitionKey: {
        name: "gameId",
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL,
      sortKey: {
        name: "sk",
        type: AttributeType.STRING
      }
    });

    this.multiplayerTable.addGlobalSecondaryIndex({
      indexName: props.roomCodeIndexName,
      partitionKey: {
        name: "roomCode",
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL,
      sortKey: {
        name: "updatedAt",
        type: AttributeType.STRING
      }
    });

    this.multiplayerTable.addGlobalSecondaryIndex({
      indexName: props.publicRoomsIndexName,
      partitionKey: {
        name: "publicRoomListKey",
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL,
      sortKey: {
        name: "updatedAt",
        type: AttributeType.STRING
      }
    });

    this.multiplayerTable.addGlobalSecondaryIndex({
      indexName: "PlayerRoomsIndex",
      partitionKey: {
        name: "playerId",
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL,
      sortKey: {
        name: "updatedAt",
        type: AttributeType.STRING
      }
    });
  }
}

export const DEFAULT_ACTION_IDEMPOTENCY_TTL = Duration.days(7);
