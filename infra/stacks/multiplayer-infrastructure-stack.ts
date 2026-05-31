import {
  CfnOutput,
  Stack,
  type StackProps
} from "aws-cdk-lib";
import { Construct } from "constructs";

import {
  createResourceName,
  type MultiplayerInfrastructureConfig
} from "../config/multiplayer-config.ts";
import {
  MultiplayerAppSyncConstruct
} from "../constructs/multiplayer-appsync.ts";
import {
  MultiplayerAuthConstruct
} from "../constructs/multiplayer-auth.ts";
import {
  MultiplayerDataConstruct
} from "../constructs/multiplayer-data.ts";
import {
  MultiplayerLambdaConstruct
} from "../constructs/multiplayer-lambdas.ts";

export interface MultiplayerInfrastructureStackProps extends StackProps {
  readonly config: MultiplayerInfrastructureConfig;
  readonly repoRoot: string;
}

export class MultiplayerInfrastructureStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: MultiplayerInfrastructureStackProps
  ) {
    super(scope, id, props);

    const auth = new MultiplayerAuthConstruct(this, "Auth", {
      removalPolicy: props.config.removalPolicy,
      userPoolClientName: createResourceName(props.config, "mobile-client"),
      userPoolName: createResourceName(props.config, "users")
    });
    const data = new MultiplayerDataConstruct(this, "Data", {
      removalPolicy: props.config.removalPolicy,
      roomCodeIndexName: props.config.roomCodeIndexName,
      roomGameIdIndexName: props.config.roomGameIdIndexName,
      tableName: createResourceName(props.config, "multiplayer")
    });
    const lambdas = new MultiplayerLambdaConstruct(this, "Lambdas", {
      config: props.config,
      multiplayerTable: data.multiplayerTable,
      repoRoot: props.repoRoot
    });
    const api = new MultiplayerAppSyncConstruct(this, "AppSync", {
      config: props.config,
      functions: lambdas.functions,
      schemaPath: `${props.repoRoot}/backend/src/appsync/schema.graphql`,
      userPool: auth.userPool
    });

    new CfnOutput(this, "GraphqlApiUrl", {
      value: api.api.graphqlUrl
    });
    new CfnOutput(this, "GraphqlApiId", {
      value: api.api.apiId
    });
    new CfnOutput(this, "UserPoolId", {
      value: auth.userPool.userPoolId
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: auth.userPoolClient.userPoolClientId
    });
    new CfnOutput(this, "MultiplayerTableName", {
      value: data.multiplayerTable.tableName
    });
  }
}
