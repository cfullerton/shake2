import {
  AuthorizationType,
  Definition,
  GraphqlApi
} from "aws-cdk-lib/aws-appsync";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

import {
  type MultiplayerLambdaMap
} from "./multiplayer-lambdas.ts";
import {
  createResourceName,
  type MultiplayerInfrastructureConfig
} from "../config/multiplayer-config.ts";

export interface MultiplayerAppSyncConstructProps {
  readonly config: MultiplayerInfrastructureConfig;
  readonly functions: MultiplayerLambdaMap;
  readonly schemaPath: string;
  readonly userPool: UserPool;
}

export class MultiplayerAppSyncConstruct extends Construct {
  readonly api: GraphqlApi;

  constructor(scope: Construct, id: string, props: MultiplayerAppSyncConstructProps) {
    super(scope, id);

    this.api = new GraphqlApi(this, "GraphqlApi", {
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userPool
          }
        }
      },
      definition: Definition.fromFile(props.schemaPath),
      name: createResourceName(props.config, "multiplayer-api"),
      xrayEnabled: true
    });

    const createRoomDataSource = this.api.addLambdaDataSource(
      "CreateRoomDataSource",
      props.functions.createRoom
    );
    const joinRoomDataSource = this.api.addLambdaDataSource(
      "JoinRoomDataSource",
      props.functions.joinRoom
    );
    const takeSeatDataSource = this.api.addLambdaDataSource(
      "TakeSeatDataSource",
      props.functions.takeSeat
    );
    const addBotDataSource = this.api.addLambdaDataSource(
      "AddBotDataSource",
      props.functions.addBot
    );
    const startGameDataSource = this.api.addLambdaDataSource(
      "StartGameDataSource",
      props.functions.startGame
    );
    const startNextHandDataSource = this.api.addLambdaDataSource(
      "StartNextHandDataSource",
      props.functions.startNextHand
    );
    const getRoomDataSource = this.api.addLambdaDataSource(
      "GetRoomDataSource",
      props.functions.getRoom
    );
    const getRoomByCodeDataSource = this.api.addLambdaDataSource(
      "GetRoomByCodeDataSource",
      props.functions.getRoomByCode
    );
    const listPublicRoomsDataSource = this.api.addLambdaDataSource(
      "ListPublicRoomsDataSource",
      props.functions.listPublicRooms
    );
    const submitGameActionDataSource = this.api.addLambdaDataSource(
      "SubmitGameActionDataSource",
      props.functions.submitGameAction
    );
    const getGameSnapshotDataSource = this.api.addLambdaDataSource(
      "GetGameSnapshotDataSource",
      props.functions.getGameSnapshot
    );
    const getMyPrivateHandDataSource = this.api.addLambdaDataSource(
      "GetMyPrivateHandDataSource",
      props.functions.getMyPrivateHand
    );
    const getReconnectViewDataSource = this.api.addLambdaDataSource(
      "GetReconnectViewDataSource",
      props.functions.getReconnectView
    );

    createRoomDataSource.createResolver("CreateRoomResolver", {
      fieldName: "createRoom",
      typeName: "Mutation"
    });
    joinRoomDataSource.createResolver("JoinRoomResolver", {
      fieldName: "joinRoom",
      typeName: "Mutation"
    });
    takeSeatDataSource.createResolver("TakeSeatResolver", {
      fieldName: "takeSeat",
      typeName: "Mutation"
    });
    addBotDataSource.createResolver("AddBotResolver", {
      fieldName: "addBot",
      typeName: "Mutation"
    });
    startGameDataSource.createResolver("StartGameResolver", {
      fieldName: "startGame",
      typeName: "Mutation"
    });
    startNextHandDataSource.createResolver("StartNextHandResolver", {
      fieldName: "startNextHand",
      typeName: "Mutation"
    });
    submitGameActionDataSource.createResolver("SubmitGameActionResolver", {
      fieldName: "submitGameAction",
      typeName: "Mutation"
    });
    getRoomDataSource.createResolver("GetRoomResolver", {
      fieldName: "getRoom",
      typeName: "Query"
    });
    getRoomByCodeDataSource.createResolver("GetRoomByCodeResolver", {
      fieldName: "getRoomByCode",
      typeName: "Query"
    });
    listPublicRoomsDataSource.createResolver("ListPublicRoomsResolver", {
      fieldName: "listPublicRooms",
      typeName: "Query"
    });
    getGameSnapshotDataSource.createResolver("GetGameSnapshotResolver", {
      fieldName: "getGameSnapshot",
      typeName: "Query"
    });
    getMyPrivateHandDataSource.createResolver("GetMyPrivateHandResolver", {
      fieldName: "getMyPrivateHand",
      typeName: "Query"
    });
    getReconnectViewDataSource.createResolver("GetReconnectViewResolver", {
      fieldName: "getReconnectView",
      typeName: "Query"
    });
  }
}
