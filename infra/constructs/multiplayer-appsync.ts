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

    submitGameActionDataSource.createResolver("SubmitGameActionResolver", {
      fieldName: "submitGameAction",
      typeName: "Mutation"
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
