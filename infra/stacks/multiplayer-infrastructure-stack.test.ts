import test from "node:test";
import { App, RemovalPolicy } from "aws-cdk-lib";
import {
  Match,
  Template
} from "aws-cdk-lib/assertions";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMultiplayerInfrastructureConfig
} from "../config/multiplayer-config.ts";
import {
  MultiplayerInfrastructureStack
} from "./multiplayer-infrastructure-stack.ts";

test("multiplayer stack defines Cognito, DynamoDB, AppSync, Lambda, and IAM", () => {
  const template = createTemplate();

  template.resourceCountIs("AWS::Cognito::UserPool", 1);
  template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
  template.resourceCountIs("AWS::DynamoDB::Table", 1);
  template.resourceCountIs("AWS::AppSync::GraphQLApi", 1);
  template.resourceCountIs("AWS::Lambda::Function", 13);
  template.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Principal: {
            Service: "lambda.amazonaws.com"
          }
        })
      ])
    })
  });
});

test("AppSync uses Cognito authorization and Lambda resolvers", () => {
  const template = createTemplate();

  template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
    AuthenticationType: "AMAZON_COGNITO_USER_POOLS"
  });

  for (const [typeName, fieldName] of [
    ["Mutation", "createRoom"],
    ["Mutation", "joinRoom"],
    ["Mutation", "takeSeat"],
    ["Mutation", "addBot"],
    ["Mutation", "startGame"],
    ["Mutation", "startNextHand"],
    ["Mutation", "submitGameAction"],
    ["Query", "getRoom"],
    ["Query", "getRoomByCode"],
    ["Query", "listPublicRooms"],
    ["Query", "getGameSnapshot"],
    ["Query", "getMyPrivateHand"],
    ["Query", "getReconnectView"]
  ]) {
    template.hasResourceProperties("AWS::AppSync::Resolver", {
      FieldName: fieldName,
      TypeName: typeName
    });
  }

  template.resourceCountIs("AWS::AppSync::DataSource", 13);
});

test("Cognito app client is native-app shaped without hosted OAuth defaults", () => {
  const template = createTemplate();

  template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
    AllowedOAuthFlowsUserPoolClient: false,
    CallbackURLs: Match.absent(),
    GenerateSecret: false
  });
});

test("Lambda functions receive store configuration environment", () => {
  const template = createTemplate();

  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: Match.objectLike({
      Variables: Match.objectLike({
        SHAKE2_MULTIPLAYER_TABLE_NAME: Match.anyValue(),
        SHAKE2_PUBLIC_ROOMS_INDEX_NAME: "PublicRoomsIndex",
        SHAKE2_ROOM_CODE_INDEX_NAME: "RoomCodeIndex",
        SHAKE2_ROOM_GAME_ID_INDEX_NAME: "GameIdIndex"
      })
    })
  });
});

test("DynamoDB table supports current multiplayer access patterns", () => {
  const template = createTemplate();

  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    KeySchema: Match.arrayWith([
      Match.objectLike({
        AttributeName: "pk",
        KeyType: "HASH"
      }),
      Match.objectLike({
        AttributeName: "sk",
        KeyType: "RANGE"
      })
    ]),
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({
        IndexName: "GameIdIndex"
      }),
      Match.objectLike({
        IndexName: "RoomCodeIndex"
      }),
      Match.objectLike({
        IndexName: "PublicRoomsIndex"
      })
    ])
  });
});

test("dev infrastructure uses destroy removal policy for disposable resources", () => {
  const template = createTemplate();

  for (const resourceType of [
    "AWS::Cognito::UserPool",
    "AWS::DynamoDB::Table"
  ]) {
    template.hasResource(resourceType, {
      DeletionPolicy: "Delete",
      UpdateReplacePolicy: "Delete"
    });
  }
});

function createTemplate(): Template {
  return Template.fromStack(createStack());
}

function createStack(): MultiplayerInfrastructureStack {
  const app = new App();
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const config = {
    ...createMultiplayerInfrastructureConfig("dev"),
    removalPolicy: RemovalPolicy.DESTROY
  };

  return new MultiplayerInfrastructureStack(app, "TestMultiplayerStack", {
    config,
    repoRoot
  });
}
