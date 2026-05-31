import assert from "node:assert/strict";
import test from "node:test";

import {
  DeployedSmokeError,
  createAppSyncRealtimeAuthorization,
  createAppSyncRealtimeConnectUrl,
  createOnGameUpdatedSubscriptionStartMessage,
  createSeededNonMemberSmokeChecks,
  createSeededSmokeChecks,
  createSmokeChecks,
  deriveAppSyncRealtimeUrl,
  evaluateOnGameUpdatedSubscriptionPayload,
  evaluateSmokeCheck,
  loadDeployedSmokeEnvironment,
  parseMultiplayerStackOutputs,
  parseDotEnvFile,
  parseJwtSubject,
  resolveDeployedSmokeConfig
} from "./deployed-smoke.ts";
import {
  type DeployedSmokeGameSeed
} from "./deployed-seed.ts";

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
    roomGameIdIndexName: "GameIdIndex",
    seedGame: false,
    stackName: "shake2-dev-multiplayer-infra",
    userEmail: "smoke@example.com",
    username: "smoke-user",
    validateSubscription: false
  });
});

test("resolves extended deployed smoke seed config from env", () => {
  const config = resolveDeployedSmokeConfig({
    AWS_REGION: "us-west-2",
    SHAKE2_ROOM_GAME_ID_INDEX_NAME: "GameIdIndex",
    SHAKE2_SMOKE_EMAIL: "smoke@example.com",
    SHAKE2_SMOKE_PASSWORD: "test-password",
    SHAKE2_SMOKE_SEED_GAME: "true",
    SHAKE2_SMOKE_SEEDED_GAME_ID: "seeded-game-1"
  });

  assert.equal(config.seedGame, true);
  assert.equal(config.seededGameId, "seeded-game-1");
  assert.equal(config.roomGameIdIndexName, "GameIdIndex");
  assert.equal(config.secondaryUser, undefined);
  assert.equal(config.validateSubscription, false);
});

test("resolves live subscription validation smoke config", () => {
  const config = resolveDeployedSmokeConfig({
    SHAKE2_SMOKE_EMAIL: "smoke@example.com",
    SHAKE2_SMOKE_PASSWORD: "test-password",
    SHAKE2_SMOKE_SEED_GAME: "true",
    SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION: "true"
  });

  assert.equal(config.seedGame, true);
  assert.equal(config.validateSubscription, true);
});

test("resolves secondary non-member smoke user config for seeded create-user runs", () => {
  const config = resolveDeployedSmokeConfig({
    SHAKE2_SMOKE_CREATE_USER: "true",
    SHAKE2_SMOKE_EMAIL: "smoke@example.com",
    SHAKE2_SMOKE_PASSWORD: "test-password",
    SHAKE2_SMOKE_SEED_GAME: "true",
    SHAKE2_SMOKE_USERNAME: "smoke-user"
  });

  assert.deepEqual(config.secondaryUser, {
    password: "test-password",
    userEmail: "smoke+nonmember@example.com",
    username: "smoke-user-nonmember"
  });
});

test("resolves explicit secondary non-member smoke user config", () => {
  const config = resolveDeployedSmokeConfig({
    SHAKE2_SMOKE_EMAIL: "smoke@example.com",
    SHAKE2_SMOKE_PASSWORD: "test-password",
    SHAKE2_SMOKE_SECONDARY_EMAIL: "smoke-other@example.com",
    SHAKE2_SMOKE_SECONDARY_PASSWORD: "other-password",
    SHAKE2_SMOKE_SECONDARY_USERNAME: "smoke-other-user",
    SHAKE2_SMOKE_SEED_GAME: "true",
    SHAKE2_SMOKE_USERNAME: "smoke-user"
  });

  assert.deepEqual(config.secondaryUser, {
    password: "other-password",
    userEmail: "smoke-other@example.com",
    username: "smoke-other-user"
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
      SHAKE2_SMOKE_SEED_GAME=true
      SHAKE2_SMOKE_SEEDED_GAME_ID=seeded-game-1
      SHAKE2_SMOKE_SECONDARY_EMAIL=smoke-other@example.com
      SHAKE2_SMOKE_SECONDARY_USERNAME=smoke-other-user
      SHAKE2_SMOKE_SECONDARY_PASSWORD='other temporary password'
      SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION=true
      SHAKE2_ROOM_GAME_ID_INDEX_NAME=GameIdIndex
      UNRELATED_SECRET=do-not-read
    `),
    {
      AWS_REGION: "us-east-2",
      SHAKE2_ROOM_GAME_ID_INDEX_NAME: "GameIdIndex",
      SHAKE2_SMOKE_CREATE_USER: "true",
      SHAKE2_SMOKE_EMAIL: "smoke@example.com",
      SHAKE2_SMOKE_PASSWORD: "temporary password",
      SHAKE2_SMOKE_SEED_GAME: "true",
      SHAKE2_SMOKE_SEEDED_GAME_ID: "seeded-game-1",
      SHAKE2_SMOKE_SECONDARY_EMAIL: "smoke-other@example.com",
      SHAKE2_SMOKE_SECONDARY_PASSWORD: "other temporary password",
      SHAKE2_SMOKE_SECONDARY_USERNAME: "smoke-other-user",
      SHAKE2_SMOKE_STACK_NAME: "shake2-dev-multiplayer-infra",
      SHAKE2_SMOKE_USERNAME: "smoke-user",
      SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION: "true"
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

test("creates smoke checks for current gameplay AppSync resolvers", () => {
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

test("creates extended seeded smoke checks for live gameplay data", () => {
  const checks = createSeededSmokeChecks(createSeed());

  assert.deepEqual(checks.map((check) => check.title), [
    "seeded getGameSnapshot returns public redacted state",
    "seeded getMyPrivateHand returns only the actor hand",
    "seeded getMyPrivateHand rejects another seat",
    "seeded submitGameAction accepts a legal bid",
    "seeded submitGameAction is idempotent",
    "seeded getReconnectView classifies pending actions"
  ]);
  assert.equal(checks.every((check) => check.requiresAuth), true);
});

test("creates secondary-user seeded smoke checks for non-member denial", () => {
  const checks = createSeededNonMemberSmokeChecks(createSeed());

  assert.deepEqual(checks.map((check) => check.title), [
    "seeded getGameSnapshot rejects non-member",
    "seeded getMyPrivateHand rejects non-member"
  ]);
  assert.equal(checks.every((check) => check.requiresAuth), true);
  assert.equal(checks.every((check) => check.authUser === "secondary"), true);
});

test("submit smoke request proves Cognito sub wins over client actor", () => {
  const submitCheck = createSmokeChecks("game-smoke")[1];
  const variables = submitCheck?.request.variables.input as {
    readonly action: string;
    readonly gameId: string;
  };

  assert.equal(submitCheck?.expectation, "invalidActorResponse");
  assert.equal(variables.gameId, "game-smoke");
  assert.equal(typeof variables.action, "string");
  assert.deepEqual(
    JSON.parse(variables.action) as unknown,
    {
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
    }
  );
});

test("submit smoke request sends action as AWSJSON-compatible string", () => {
  const submitCheck = createSmokeChecks("game-smoke")[1];
  const variables = submitCheck?.request.variables.input as {
    readonly action: string;
  };

  assert.doesNotThrow(() => JSON.parse(variables.action));
  assert.match(submitCheck?.request.query ?? "", /SubmitGameActionInput/u);
});

test("creates AppSync realtime URLs for deployed GraphQL endpoints", () => {
  assert.equal(
    deriveAppSyncRealtimeUrl(
      "https://example123.appsync-api.us-east-1.amazonaws.com/graphql"
    ),
    "wss://example123.appsync-realtime-api.us-east-1.amazonaws.com/graphql"
  );
  assert.equal(
    deriveAppSyncRealtimeUrl("https://api.example.com/graphql"),
    "wss://api.example.com/graphql/realtime"
  );
});

test("creates Cognito-authenticated AppSync realtime start messages", () => {
  const graphqlApiUrl =
    "https://example123.appsync-api.us-east-1.amazonaws.com/graphql";
  const connectUrl = new URL(
    createAppSyncRealtimeConnectUrl(graphqlApiUrl, "id-token")
  );
  const header = JSON.parse(
    Buffer.from(connectUrl.searchParams.get("header") ?? "", "base64")
      .toString("utf8")
  ) as unknown;
  const message = createOnGameUpdatedSubscriptionStartMessage({
    graphqlApiUrl,
    idToken: "id-token",
    seed: createSeed(),
    subscriptionId: "subscription-1"
  });
  const data = JSON.parse(message.payload.data) as {
    readonly query: string;
    readonly variables: Record<string, unknown>;
  };

  assert.equal(connectUrl.protocol, "wss:");
  assert.deepEqual(header, {
    Authorization: "id-token",
    host: "example123.appsync-api.us-east-1.amazonaws.com"
  });
  assert.equal(connectUrl.searchParams.get("payload"), "e30=");
  assert.deepEqual(
    createAppSyncRealtimeAuthorization(graphqlApiUrl, "id-token"),
    {
      Authorization: "id-token",
      host: "example123.appsync-api.us-east-1.amazonaws.com"
    }
  );
  assert.equal(message.id, "subscription-1");
  assert.equal(message.type, "start");
  assert.match(data.query, /subscription SmokeOnGameUpdated/u);
  assert.deepEqual(data.variables, {
    gameId: "seeded-game"
  });
  assert.deepEqual(message.payload.extensions.authorization, {
    Authorization: "id-token",
    host: "example123.appsync-api.us-east-1.amazonaws.com"
  });
});

test("parses Cognito subject from an ID token payload", () => {
  const payload = Buffer.from(JSON.stringify({
    sub: "actor-sub"
  })).toString("base64url");

  assert.equal(parseJwtSubject(`header.${payload}.signature`), "actor-sub");
  assert.throws(
    () => parseJwtSubject("not-a-jwt"),
    /Cognito ID token is malformed/u
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

test("evaluates expected seeded smoke GraphQL results", () => {
  const [
    publicSnapshot,
    privateHand,
    privateHandDenied,
    acceptedAction,
    duplicateAction,
    reconnect
  ] = createSeededSmokeChecks(createSeed());

  assert.equal(
    evaluateSmokeCheck(publicSnapshot!, {
      body: {
        data: {
          getGameSnapshot: {
            gameId: "seeded-game",
            handCounts: {
              seat0: 7,
              seat1: 7,
              seat2: 7,
              seat3: 7
            },
            phase: "dealt",
            redactedState: {
              handCounts: {
                0: 7,
                1: 7,
                2: 7,
                3: 7
              },
              phase: "bidding"
            }
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(privateHand!, {
      body: {
        data: {
          getMyPrivateHand: {
            dominoes: Array.from({ length: 7 }, (_, index) => ({
              key: `${index}-0`
            })),
            gameId: "seeded-game",
            seatIndex: "SEAT_1"
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(privateHandDenied!, {
      body: {
        errors: [
          {
            message: "INVALID_ACTOR: Private hand access requires ownership."
          }
        ]
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(acceptedAction!, {
      body: {
        data: {
          submitGameAction: {
            accepted: true,
            committed: true,
            duplicate: false,
            gameId: "seeded-game",
            events: [
              {
                actorSeat: "SEAT_1",
                eventType: "fortyTwo.bid.submitted"
              }
            ],
            snapshot: {
              phase: "bidding"
            }
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(duplicateAction!, {
      body: {
        data: {
          submitGameAction: {
            accepted: true,
            committed: false,
            duplicate: true
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(reconnect!, {
      body: {
        data: {
          getReconnectView: {
            acceptedPendingActionIds: ["seeded-action"],
            privateHand: {
              dominoes: Array.from({ length: 7 }, (_, index) => ({
                key: `${index}-0`
              })),
              seatIndex: "SEAT_1"
            },
            requiresSnapshotRefresh: true,
            snapshot: {
              phase: "bidding",
              redactedState: {
                handCounts: {
                  0: 7,
                  1: 7,
                  2: 7,
                  3: 7
                }
              }
            },
            unknownPendingActionIds: ["unknown-action"]
          }
        }
      },
      httpStatus: 200
    }).ok,
    true
  );
});

test("evaluates expected live subscription payloads", () => {
  const seed = createSeed();

  assert.equal(
    evaluateOnGameUpdatedSubscriptionPayload(seed, {
      data: {
        onGameUpdated: {
          accepted: true,
          committed: true,
          duplicate: false,
          gameId: "seeded-game",
          events: [
            {
              actorSeat: "SEAT_1",
              eventType: "fortyTwo.bid.submitted"
            }
          ],
          snapshot: {
            gameId: "seeded-game",
            phase: "bidding"
          }
        }
      }
    }).ok,
    true
  );
  assert.equal(
    evaluateOnGameUpdatedSubscriptionPayload(seed, {
      data: {
        onGameUpdated: {
          accepted: true,
          committed: true,
          duplicate: false,
          gameId: "seeded-game",
          events: [
            {
              actorSeat: "SEAT_1",
              eventType: "fortyTwo.bid.submitted"
            }
          ],
          snapshot: {
            gameId: "seeded-game",
            phase: "bidding",
            viewerHand: []
          }
        }
      }
    }).ok,
    false
  );
});

test("evaluates secondary-user seeded smoke denials", () => {
  const [snapshotDenied, privateHandDenied] =
    createSeededNonMemberSmokeChecks(createSeed());

  assert.equal(
    evaluateSmokeCheck(snapshotDenied!, {
      body: {
        errors: [
          {
            message: "INVALID_ACTOR: Player is not a member of this room."
          }
        ]
      },
      httpStatus: 200
    }).ok,
    true
  );
  assert.equal(
    evaluateSmokeCheck(privateHandDenied!, {
      body: {
        errors: [
          {
            message: "INVALID_ACTOR: Private hand access requires ownership."
          }
        ]
      },
      httpStatus: 200
    }).ok,
    true
  );
});

function createSeed(): DeployedSmokeGameSeed {
  return {
    action: {
      action: {
        payload: {
          bid: {
            kind: "pass"
          },
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "seeded-action",
      actorId: "actor-sub",
      actorSeat: 1,
      clientCreatedAt: "2026-05-30T12:00:00.000Z",
      gameId: "seeded-game",
      knownLastEventSequence: 2,
      knownSnapshotVersion: 2,
      schemaVersion: 1
    },
    actionJson: JSON.stringify({
      actionId: "seeded-action"
    }),
    actorPlayerId: "actor-sub",
    actorSeat: 1,
    actorSeatEnum: "SEAT_1",
    gameId: "seeded-game",
    lastEventSequence: 2,
    roomCode: "SMOKE1",
    roomId: "seeded-room",
    snapshotVersion: 2
  };
}
