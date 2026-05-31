import { Duration } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import {
  Architecture,
  Runtime
} from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  OutputFormat
} from "aws-cdk-lib/aws-lambda-nodejs";
import {
  ManagedPolicy,
  Role,
  ServicePrincipal
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { join } from "node:path";

import { createResourceName, type MultiplayerInfrastructureConfig } from "../config/multiplayer-config.ts";

export type MultiplayerLambdaId =
  | "createRoom"
  | "joinRoom"
  | "takeSeat"
  | "startGame"
  | "getRoom"
  | "getRoomByCode"
  | "submitGameAction"
  | "getGameSnapshot"
  | "getMyPrivateHand"
  | "getReconnectView";

export type MultiplayerLambdaMap = Readonly<Record<
  MultiplayerLambdaId,
  NodejsFunction
>>;

export interface MultiplayerLambdaConstructProps {
  readonly config: MultiplayerInfrastructureConfig;
  readonly multiplayerTable: Table;
  readonly repoRoot: string;
}

export class MultiplayerLambdaConstruct extends Construct {
  readonly functions: MultiplayerLambdaMap;

  constructor(scope: Construct, id: string, props: MultiplayerLambdaConstructProps) {
    super(scope, id);

    const environment = {
      NODE_OPTIONS: "--enable-source-maps",
      SHAKE2_MULTIPLAYER_TABLE_NAME: props.multiplayerTable.tableName,
      SHAKE2_ROOM_CODE_INDEX_NAME: props.config.roomCodeIndexName,
      SHAKE2_ROOM_GAME_ID_INDEX_NAME: props.config.roomGameIdIndexName
    };

    const createRoom = this.createFunction(
      "CreateRoom",
      "createRoom",
      props,
      environment
    );
    const joinRoom = this.createFunction(
      "JoinRoom",
      "joinRoom",
      props,
      environment
    );
    const takeSeat = this.createFunction(
      "TakeSeat",
      "takeSeat",
      props,
      environment
    );
    const startGame = this.createFunction(
      "StartGame",
      "startGame",
      props,
      environment
    );
    const getRoom = this.createFunction(
      "GetRoom",
      "getRoom",
      props,
      environment
    );
    const getRoomByCode = this.createFunction(
      "GetRoomByCode",
      "getRoomByCode",
      props,
      environment
    );
    const submitGameAction = this.createFunction(
      "SubmitGameAction",
      "submitGameAction",
      props,
      environment
    );
    const getGameSnapshot = this.createFunction(
      "GetGameSnapshot",
      "getGameSnapshot",
      props,
      environment
    );
    const getMyPrivateHand = this.createFunction(
      "GetMyPrivateHand",
      "getMyPrivateHand",
      props,
      environment
    );
    const getReconnectView = this.createFunction(
      "GetReconnectView",
      "getReconnectView",
      props,
      environment
    );

    props.multiplayerTable.grantReadWriteData(createRoom);
    props.multiplayerTable.grantReadWriteData(joinRoom);
    props.multiplayerTable.grantReadWriteData(takeSeat);
    props.multiplayerTable.grantReadWriteData(startGame);
    props.multiplayerTable.grantReadData(getRoom);
    props.multiplayerTable.grantReadData(getRoomByCode);
    props.multiplayerTable.grantReadWriteData(submitGameAction);
    props.multiplayerTable.grantReadData(getGameSnapshot);
    props.multiplayerTable.grantReadData(getMyPrivateHand);
    props.multiplayerTable.grantReadData(getReconnectView);

    this.functions = {
      createRoom,
      getGameSnapshot,
      getMyPrivateHand,
      getRoom,
      getRoomByCode,
      getReconnectView,
      joinRoom,
      startGame,
      takeSeat,
      submitGameAction
    };
  }

  private createFunction(
    constructId: string,
    lambdaId: MultiplayerLambdaId,
    props: MultiplayerLambdaConstructProps,
    environment: Readonly<Record<string, string>>
  ): NodejsFunction {
    return new NodejsFunction(this, constructId, {
      architecture: Architecture.ARM_64,
      bundling: {
        format: OutputFormat.CJS,
        minify: false,
        sourceMap: true,
        target: "node20"
      },
      entry: join(
        props.repoRoot,
        "backend",
        "src",
        "functions",
        lambdaId,
        "lambda.ts"
      ),
      environment,
      functionName: createResourceName(props.config, lambdaId),
      handler: "handler",
      memorySize: 256,
      role: this.createExecutionRole(`${constructId}Role`, lambdaId, props.config),
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(10)
    });
  }

  private createExecutionRole(
    constructId: string,
    lambdaId: MultiplayerLambdaId,
    config: MultiplayerInfrastructureConfig
  ): Role {
    return new Role(this, constructId, {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        )
      ],
      roleName: createResourceName(config, `${lambdaId}-lambda-role`)
    });
  }
}
