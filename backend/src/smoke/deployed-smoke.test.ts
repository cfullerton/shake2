import assert from "node:assert/strict";
import test from "node:test";

import {
  DeployedSmokeError,
  createSmokeChecks,
  evaluateSmokeCheck,
  loadDeployedSmokeEnvironment,
  parseMultiplayerStackOutputs,
  parseDotEnvFile,
  resolveDeployedSmokeConfig
} from "./deployed-smoke.ts";

test("parses required multiplayer stack outputs", () => {
  const outputs = parseMultiplayerStackOutputs([
    {
      OutputKey: "GraphqlApiId",
      OutputValue: "api-id"
    },
    {
      OutputKey: "GraphqlApiUrl",
      OutputValue: "https://example.appsync-api.us-east-1.amazonaws.com/graphql"
    },
    {
      OutputKey: "MultiplayerTableName",
      OutputValue: "shake2-dev-multiplayer"
    },
    {
      OutputKey: "UserPoolClientId",
      OutputValue: "client-id"
    },
    {
      OutputKey: "UserPoolId",
      OutputValue: "pool-id"
    }
  ]);

  assert.deepEqual(outputs, {
    graphqlApiId: "api-id",
    graphqlApiUrl: "https://example.appsync-api.us-east-1.amazonaws.com/graphql",
    multiplayerTableName: "shake2-dev-multiplayer",
    userPoolClientId: "client-id",
    userPoolId: "pool-id"
  });
});

test("rejects missing required multiplayer stack outputs", () => {
  assert.throws(
    () => parseMultiplayerStackOutputs([]),
    (error: unknown) =>
      error instanceof DeployedSmokeError &&
      error.message.includes("CloudFormation output GraphqlApiId")
  );
});

test("resolves deployed smoke config from env without logging secrets", () => {
  const config = resolveDeployedSmokeConfig({
    AWS_REGION: "us-west-2",
    SHAKE2_SMOKE_CREATE_USER: "true",
    SHAKE2_SMOKE_EMAIL: "smoke@example.com",
    SHAKE2_SMOKE_PASSWORD: "test-password",
    SHAKE2_SMOKE_STACK_NAME: "shake2-dev-multiplayer-infra",
    SHAKE2_SMOKE_USERNAME: "smoke-user"
  });

  assert.deepEqual(config, {
    createUser: true,
    gameId: "smoke-missing-game",
    password: "test-password",
    region: "us-west-2",
    stackName: "shake2-dev-multiplayer-infra",
    userEmail: "smoke@example.com",
    username: "smoke-user"
  });
});

test("loads deployed smoke config from dotenv-style contents", () => {
  assert.deepEqual(
    parseDotEnvFile(`
      # comments and unrelated values are ignored
      AWS_REGION=us-east-2
      export SHAKE2_SMOKE_STACK_NAME=shake2-dev-multiplayer-infra
      SHAKE2_SMOKE_EMAIL="smoke@example.com"
      SHAKE2_SMOKE_USERNAME='smoke-user'
      SHAKE2_SMOKE_PASSWORD='temporary password'
      SHAKE2_SMOKE_CREATE_USER=true
      UNRELATED_SECRET=do-not-read
    `),
    {
      AWS_REGION: "us-east-2",
      SHAKE2_SMOKE_CREATE_USER: "true",
      SHAKE2_SMOKE_EMAIL: "smoke@example.com",
      SHAKE2_SMOKE_PASSWORD: "temporary password",
      SHAKE2_SMOKE_STACK_NAME: "shake2-dev-multiplayer-infra",
      SHAKE2_SMOKE_USERNAME: "smoke-user"
    }
  );
});

test("explicit environment overrides dotenv values", () => {
  const loaded = loadDeployedSmokeEnvironment(
    {
      SHAKE2_SMOKE_EMAIL: "env@example.com"
    },
    "/path/that/does/not/exist"
  );

  assert.equal(loaded.SHAKE2_SMOKE_EMAIL, "env@example.com");
});

test("creates smoke checks for all current AppSync resolvers", () => {
  const checks = createSmokeChecks("game-smoke");

  assert.deepEqual(checks.map((check) => check.title), [
    "AppSync rejects unauthenticated submitGameAction",
    "submitGameAction uses Cognito actor identity",
    "getGameSnapshot invokes read resolver",
    "getMyPrivateHand invokes private resolver",
    "getReconnectView invokes reconnect resolver"
  ]);
  assert.equal(checks[0]?.requiresAuth, false);
  assert.equal(checks.slice(1).every((check) => check.requiresAuth), true);
});

test("submit smoke request proves Cognito sub wins over client actor", () => {
  const submitCheck = createSmokeChecks("game-smoke")[1];

  assert.equal(submitCheck?.expectation, "invalidActorResponse");
  assert.deepEqual(
    submitCheck?.request.variables,
    {
      input: {
        action: {
          action: {
            payload: {
              bid: {
                kind: "pass"
              },
              seat: 0
            },
            type: "fortyTwo.bid.submit"
          },
          actionId: "smoke-invalid-actor",
          actorId: "client-provided-player-id",
          actorSeat: 0,
          clientCreatedAt: "2026-05-30T00:00:00.000Z",
          gameId: "game-smoke",
          schemaVersion: 1
        },
        gameId: "game-smoke"
      }
    }
  );
});

test("evaluates expected smoke GraphQL results", () => {
  const [unauthenticated, invalidActor, snapshot] = createSmokeChecks("game-smoke");

  assert.equal(
    evaluateSmokeCheck(unauthenticated!, {
      body: null,
      httpStatus: 401
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(invalidActor!, {
      body: {
        data: {
          submitGameAction: {
            accepted: false,
            committed: false,
            duplicate: false,
            error: {
              code: "INVALID_ACTOR"
            }
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.match(
    evaluateSmokeCheck(invalidActor!, {
      body: {
        errors: [
          {
            message: "Cannot return null for non-nullable field SubmitGameActionResult.events."
          }
        ]
      },
      httpStatus: 200
    }).details,
    /Expected INVALID_ACTOR response.*SubmitGameActionResult\.events/u
  );
  assert.equal(
    evaluateSmokeCheck(snapshot!, {
      body: {
        errors: [
          {
            message: "Multiplayer game snapshot was not found."
          }
        ]
      },
      httpStatus: 200
    }).ok,
    true
  );
});
