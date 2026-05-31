import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output
} from "@aws-sdk/client-cloudformation";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  seedDeployedSmokeGame,
  type DeployedSmokeGameSeed
} from "./deployed-seed.ts";

export interface DeployedSmokeEnvironment {
  readonly AWS_REGION?: string;
  readonly SHAKE2_ROOM_GAME_ID_INDEX_NAME?: string;
  readonly SHAKE2_SMOKE_CREATE_USER?: string;
  readonly SHAKE2_SMOKE_EMAIL?: string;
  readonly SHAKE2_SMOKE_GAME_ID?: string;
  readonly SHAKE2_SMOKE_PASSWORD?: string;
  readonly SHAKE2_SMOKE_SEED_GAME?: string;
  readonly SHAKE2_SMOKE_SEEDED_GAME_ID?: string;
  readonly SHAKE2_SMOKE_SECONDARY_EMAIL?: string;
  readonly SHAKE2_SMOKE_SECONDARY_PASSWORD?: string;
  readonly SHAKE2_SMOKE_SECONDARY_USERNAME?: string;
  readonly SHAKE2_SMOKE_STACK_NAME?: string;
  readonly SHAKE2_SMOKE_USERNAME?: string;
  readonly SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION?: string;
}

export interface DeployedSmokeUserConfig {
  readonly password: string;
  readonly userEmail: string;
  readonly username: string;
}

export interface DeployedSmokeConfig {
  readonly createUser: boolean;
  readonly gameId: string;
  readonly password: string;
  readonly region: string;
  readonly roomGameIdIndexName: string;
  readonly secondaryUser?: DeployedSmokeUserConfig;
  readonly seedGame: boolean;
  readonly seededGameId?: string;
  readonly stackName: string;
  readonly userEmail: string;
  readonly username: string;
  readonly validateSubscription: boolean;
}

export interface MultiplayerStackOutputs {
  readonly graphqlApiId: string;
  readonly graphqlApiUrl: string;
  readonly multiplayerTableName: string;
  readonly userPoolClientId: string;
  readonly userPoolId: string;
}

export interface SmokeGraphqlRequest {
  readonly operationName: string;
  readonly query: string;
  readonly variables: Record<string, unknown>;
}

export type SmokeExpectation =
  | "unauthorized"
  | "invalidActorResponse"
  | "graphqlError"
  | "seededPublicSnapshot"
  | "seededNonMemberDenied"
  | "seededPrivateHand"
  | "seededPrivateHandDenied"
  | "acceptedAction"
  | "duplicateAction"
  | "reconnectAcceptedPending";

export type SmokeAuthUser = "primary" | "secondary";

export interface SmokeCheck {
  readonly authUser?: SmokeAuthUser;
  readonly expectation: SmokeExpectation;
  readonly request: SmokeGraphqlRequest;
  readonly requiresAuth: boolean;
  readonly title: string;
}

export interface GraphqlErrorPayload {
  readonly errorType?: string;
  readonly message?: string;
}

export interface GraphqlResponseBody {
  readonly data?: Record<string, unknown> | null;
  readonly errors?: readonly GraphqlErrorPayload[];
}

export interface SmokeHttpResult {
  readonly body: GraphqlResponseBody | null;
  readonly httpStatus: number;
}

export interface SmokeCheckEvaluation {
  readonly details: string;
  readonly ok: boolean;
  readonly title: string;
}

type SmokePayload = Record<string, any>;
type RealtimeWebSocketEventType = "close" | "error" | "message" | "open";

interface RealtimeWebSocketEvent {
  readonly data?: unknown;
}

interface RealtimeWebSocket {
  addEventListener(
    type: RealtimeWebSocketEventType,
    listener: (event: RealtimeWebSocketEvent) => void
  ): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

type RealtimeWebSocketFactory = (
  url: string,
  protocols: readonly string[]
) => RealtimeWebSocket;

export interface AppSyncRealtimeAuthorization {
  readonly Authorization: string;
  readonly host: string;
}

export interface AppSyncRealtimeStartMessage {
  readonly id: string;
  readonly payload: {
    readonly data: string;
    readonly extensions: {
      readonly authorization: AppSyncRealtimeAuthorization;
    };
  };
  readonly type: "start";
}

interface ValidateSeededSubscriptionOptions {
  readonly graphqlApiUrl: string;
  readonly idToken: string;
  readonly seed: DeployedSmokeGameSeed;
  readonly timeoutMs?: number;
  readonly webSocketFactory?: RealtimeWebSocketFactory;
}

const DEFAULT_REALTIME_SMOKE_TIMEOUT_MS = 30_000;
const SEEDED_SUBSCRIPTION_TITLE =
  "seeded onGameUpdated receives accepted action";

export class DeployedSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployedSmokeError";
  }
}

export async function runDeployedSmoke(
  env: DeployedSmokeEnvironment = loadDeployedSmokeEnvironment()
): Promise<readonly SmokeCheckEvaluation[]> {
  const config = resolveDeployedSmokeConfig(env);

  if (config.validateSubscription && !config.seedGame) {
    throw new DeployedSmokeError(
      "SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION=true requires SHAKE2_SMOKE_SEED_GAME=true."
    );
  }

  const cloudFormation = new CloudFormationClient({
    region: config.region
  });
  const cognito = new CognitoIdentityProviderClient({
    region: config.region
  });
  const outputs = await loadMultiplayerStackOutputs(
    cloudFormation,
    config.stackName
  );

  if (config.createUser) {
    await ensureSmokeUser(cognito, outputs, config);

    if (config.secondaryUser) {
      await ensureSmokeUser(cognito, outputs, config.secondaryUser);
    }
  }

  const idToken = await authenticateSmokeUser(cognito, outputs, config);
  const secondaryIdToken = config.secondaryUser
    ? await authenticateSmokeUser(cognito, outputs, config.secondaryUser)
    : undefined;
  const tokens = {
    primary: idToken,
    secondary: secondaryIdToken
  };
  const evaluations: SmokeCheckEvaluation[] = [
    ...await evaluateSmokeChecks(
      createSmokeChecks(config.gameId),
      outputs.graphqlApiUrl,
      tokens
    )
  ];

  if (config.seedGame) {
    const actorPlayerId = parseJwtSubject(idToken);
    const dynamoDb = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: config.region
      })
    );
    const seed = await seedDeployedSmokeGame({
      actorPlayerId,
      client: dynamoDb,
      ...(config.seededGameId ? { gameId: config.seededGameId } : {}),
      roomGameIdIndexName: config.roomGameIdIndexName,
      tableName: outputs.multiplayerTableName
    });
    const seededChecks = createSeededSmokeChecks(seed);

    if (config.validateSubscription) {
      evaluations.push(
        ...await evaluateSmokeChecks(
          seededChecks.slice(0, 3),
          outputs.graphqlApiUrl,
          tokens
        )
      );
      const subscriptionEvaluation = await validateSeededSubscription({
        graphqlApiUrl: outputs.graphqlApiUrl,
        idToken,
        seed
      });

      evaluations.push(subscriptionEvaluation);

      if (subscriptionEvaluation.ok) {
        evaluations.push(
          ...await evaluateSmokeChecks(
            seededChecks.slice(4),
            outputs.graphqlApiUrl,
            tokens
          )
        );
      }
    } else {
      evaluations.push(
        ...await evaluateSmokeChecks(
          seededChecks,
          outputs.graphqlApiUrl,
          tokens
        )
      );
    }

    if (secondaryIdToken) {
      evaluations.push(
        ...await evaluateSmokeChecks(
          createSeededNonMemberSmokeChecks(seed),
          outputs.graphqlApiUrl,
          tokens
        )
      );
    }
  }

  const failed = evaluations.filter((evaluation) => !evaluation.ok);

  if (failed.length > 0) {
    throw new DeployedSmokeError(
      `Deployed multiplayer smoke failed:\n${
        failed.map((failure) =>
          `- ${failure.title}: ${failure.details}`
        ).join("\n")
      }`
    );
  }

  return evaluations;
}

export function loadDeployedSmokeEnvironment(
  baseEnv: DeployedSmokeEnvironment = process.env,
  cwd = process.cwd()
): DeployedSmokeEnvironment {
  return {
    ...readOptionalDotEnvFile(findDotEnvPath(cwd)),
    ...baseEnv
  };
}

export function parseDotEnvFile(contents: string): DeployedSmokeEnvironment {
  const parsed: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();

    if (isSmokeEnvironmentKey(key)) {
      parsed[key] = unquoteDotEnvValue(value);
    }
  }

  return parsed;
}

export function resolveDeployedSmokeConfig(
  env: DeployedSmokeEnvironment
): DeployedSmokeConfig {
  const userEmail = requireEnv(env.SHAKE2_SMOKE_EMAIL, "SHAKE2_SMOKE_EMAIL");
  const createUser = env.SHAKE2_SMOKE_CREATE_USER === "true";
  const password = requireEnv(env.SHAKE2_SMOKE_PASSWORD, "SHAKE2_SMOKE_PASSWORD");
  const seedGame = env.SHAKE2_SMOKE_SEED_GAME === "true";
  const seededGameId = readOptionalEnv(env.SHAKE2_SMOKE_SEEDED_GAME_ID);
  const username = env.SHAKE2_SMOKE_USERNAME ?? userEmail;
  const validateSubscription =
    env.SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION === "true";
  const secondaryUser = resolveSecondarySmokeUser(env, {
    password,
    userEmail,
    username
  }, {
    createUser,
    seedGame
  });

  return {
    createUser,
    gameId: env.SHAKE2_SMOKE_GAME_ID ?? "smoke-missing-game",
    password,
    region: env.AWS_REGION ?? "us-east-1",
    roomGameIdIndexName: env.SHAKE2_ROOM_GAME_ID_INDEX_NAME ?? "GameIdIndex",
    ...(secondaryUser ? { secondaryUser } : {}),
    seedGame,
    ...(seededGameId !== undefined ? { seededGameId } : {}),
    stackName: env.SHAKE2_SMOKE_STACK_NAME ?? "shake2-dev-multiplayer-infra",
    userEmail,
    username,
    validateSubscription
  };
}

export async function loadMultiplayerStackOutputs(
  client: Pick<CloudFormationClient, "send">,
  stackName: string
): Promise<MultiplayerStackOutputs> {
  const response = await client.send(
    new DescribeStacksCommand({
      StackName: stackName
    })
  );
  const stack = response.Stacks?.[0];

  if (!stack) {
    throw new DeployedSmokeError(`Stack ${stackName} was not found.`);
  }

  return parseMultiplayerStackOutputs(stack.Outputs ?? []);
}

export function parseMultiplayerStackOutputs(
  outputs: readonly Output[]
): MultiplayerStackOutputs {
  return {
    graphqlApiId: requireStackOutput(outputs, "GraphqlApiId"),
    graphqlApiUrl: requireStackOutput(outputs, "GraphqlApiUrl"),
    multiplayerTableName: requireStackOutput(outputs, "MultiplayerTableName"),
    userPoolClientId: requireStackOutput(outputs, "UserPoolClientId"),
    userPoolId: requireStackOutput(outputs, "UserPoolId")
  };
}

export async function ensureSmokeUser(
  client: Pick<CognitoIdentityProviderClient, "send">,
  outputs: Pick<MultiplayerStackOutputs, "userPoolId">,
  config: Pick<DeployedSmokeConfig, "password" | "userEmail" | "username">
): Promise<void> {
  try {
    await client.send(
      new AdminCreateUserCommand({
        DesiredDeliveryMediums: [],
        MessageAction: "SUPPRESS",
        UserAttributes: [
          {
            Name: "email",
            Value: config.userEmail
          },
          {
            Name: "email_verified",
            Value: "true"
          }
        ],
        UserPoolId: outputs.userPoolId,
        Username: config.username
      })
    );
  } catch (error) {
    if (getErrorName(error) !== "UsernameExistsException") {
      throw error;
    }
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      Password: config.password,
      Permanent: true,
      UserPoolId: outputs.userPoolId,
      Username: config.username
    })
  );
}

export async function authenticateSmokeUser(
  client: Pick<CognitoIdentityProviderClient, "send">,
  outputs: Pick<MultiplayerStackOutputs, "userPoolClientId">,
  config: Pick<DeployedSmokeConfig, "password" | "username">
): Promise<string> {
  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        PASSWORD: config.password,
        USERNAME: config.username
      },
      ClientId: outputs.userPoolClientId
    })
  );
  const idToken = response.AuthenticationResult?.IdToken;

  if (!idToken) {
    throw new DeployedSmokeError("Cognito did not return an ID token.");
  }

  return idToken;
}

export function createSmokeChecks(gameId: string): readonly SmokeCheck[] {
  const submitRequest = createSubmitGameActionSmokeRequest(gameId);

  return [
    {
      expectation: "unauthorized",
      request: submitRequest,
      requiresAuth: false,
      title: "AppSync rejects unauthenticated submitGameAction"
    },
    {
      expectation: "invalidActorResponse",
      request: submitRequest,
      requiresAuth: true,
      title: "submitGameAction uses Cognito actor identity"
    },
    {
      expectation: "graphqlError",
      request: {
        operationName: "SmokeGetGameSnapshot",
        query: `
          query SmokeGetGameSnapshot($gameId: ID!) {
            getGameSnapshot(gameId: $gameId) {
              gameId
              snapshotVersion
            }
          }
        `,
        variables: {
          gameId
        }
      },
      requiresAuth: true,
      title: "getGameSnapshot invokes read resolver"
    },
    {
      expectation: "graphqlError",
      request: {
        operationName: "SmokeGetMyPrivateHand",
        query: `
          query SmokeGetMyPrivateHand($input: GetMyPrivateHandInput!) {
            getMyPrivateHand(input: $input) {
              gameId
              seatIndex
            }
          }
        `,
        variables: {
          input: {
            gameId,
            seatIndex: "SEAT_0"
          }
        }
      },
      requiresAuth: true,
      title: "getMyPrivateHand invokes private resolver"
    },
    {
      expectation: "graphqlError",
      request: {
        operationName: "SmokeGetReconnectView",
        query: `
          query SmokeGetReconnectView($input: GetReconnectViewInput!) {
            getReconnectView(input: $input) {
              requiresSnapshotRefresh
              serverSnapshotVersion
            }
          }
        `,
        variables: {
          input: {
            gameId,
            lastAppliedEventSequence: 0,
            pendingActionIds: [],
            snapshotVersion: 0
          }
        }
      },
      requiresAuth: true,
      title: "getReconnectView invokes reconnect resolver"
    }
  ];
}

export function createSeededSmokeChecks(
  seed: DeployedSmokeGameSeed
): readonly SmokeCheck[] {
  const submitRequest = createSeededSubmitGameActionSmokeRequest(seed);

  return [
    {
      expectation: "seededPublicSnapshot",
      request: {
        operationName: "SmokeSeededGetGameSnapshot",
        query: `
          query SmokeSeededGetGameSnapshot($gameId: ID!) {
            getGameSnapshot(gameId: $gameId) {
              gameId
              handCounts {
                seat0
                seat1
                seat2
                seat3
              }
              lastEventSequence
              phase
              redactedState
              snapshotVersion
            }
          }
        `,
        variables: {
          gameId: seed.gameId
        }
      },
      requiresAuth: true,
      title: "seeded getGameSnapshot returns public redacted state"
    },
    {
      expectation: "seededPrivateHand",
      request: {
        operationName: "SmokeSeededGetMyPrivateHand",
        query: `
          query SmokeSeededGetMyPrivateHand($input: GetMyPrivateHandInput!) {
            getMyPrivateHand(input: $input) {
              dominoes {
                high
                key
                low
              }
              gameId
              handNumber
              seatIndex
            }
          }
        `,
        variables: {
          input: {
            gameId: seed.gameId,
            seatIndex: seed.actorSeatEnum
          }
        }
      },
      requiresAuth: true,
      title: "seeded getMyPrivateHand returns only the actor hand"
    },
    {
      expectation: "seededPrivateHandDenied",
      request: {
        operationName: "SmokeSeededRejectOtherPrivateHand",
        query: `
          query SmokeSeededRejectOtherPrivateHand($input: GetMyPrivateHandInput!) {
            getMyPrivateHand(input: $input) {
              gameId
              seatIndex
            }
          }
        `,
        variables: {
          input: {
            gameId: seed.gameId,
            seatIndex: "SEAT_0"
          }
        }
      },
      requiresAuth: true,
      title: "seeded getMyPrivateHand rejects another seat"
    },
    {
      expectation: "acceptedAction",
      request: submitRequest,
      requiresAuth: true,
      title: "seeded submitGameAction accepts a legal bid"
    },
    {
      expectation: "duplicateAction",
      request: submitRequest,
      requiresAuth: true,
      title: "seeded submitGameAction is idempotent"
    },
    {
      expectation: "reconnectAcceptedPending",
      request: {
        operationName: "SmokeSeededGetReconnectView",
        query: `
          query SmokeSeededGetReconnectView($input: GetReconnectViewInput!) {
            getReconnectView(input: $input) {
              acceptedPendingActionIds
              privateHand {
                dominoes {
                  key
                }
                seatIndex
              }
              requiresSnapshotRefresh
              serverLastEventSequence
              serverSnapshotVersion
              snapshot {
                gameId
                handCounts {
                  seat0
                  seat1
                  seat2
                  seat3
                }
                phase
                redactedState
              }
              unknownPendingActionIds
            }
          }
        `,
        variables: {
          input: {
            gameId: seed.gameId,
            lastAppliedEventSequence: seed.lastEventSequence,
            pendingActionIds: [
              seed.action.actionId,
              `${seed.action.actionId}-unknown`
            ],
            snapshotVersion: seed.snapshotVersion
          }
        }
      },
      requiresAuth: true,
      title: "seeded getReconnectView classifies pending actions"
    }
  ];
}

export function createSeededNonMemberSmokeChecks(
  seed: DeployedSmokeGameSeed
): readonly SmokeCheck[] {
  return [
    {
      authUser: "secondary",
      expectation: "seededNonMemberDenied",
      request: {
        operationName: "SmokeSeededRejectNonMemberSnapshot",
        query: `
          query SmokeSeededRejectNonMemberSnapshot($gameId: ID!) {
            getGameSnapshot(gameId: $gameId) {
              gameId
              snapshotVersion
            }
          }
        `,
        variables: {
          gameId: seed.gameId
        }
      },
      requiresAuth: true,
      title: "seeded getGameSnapshot rejects non-member"
    },
    {
      authUser: "secondary",
      expectation: "seededNonMemberDenied",
      request: {
        operationName: "SmokeSeededRejectNonMemberPrivateHand",
        query: `
          query SmokeSeededRejectNonMemberPrivateHand($input: GetMyPrivateHandInput!) {
            getMyPrivateHand(input: $input) {
              gameId
              seatIndex
            }
          }
        `,
        variables: {
          input: {
            gameId: seed.gameId,
            seatIndex: seed.actorSeatEnum
          }
        }
      },
      requiresAuth: true,
      title: "seeded getMyPrivateHand rejects non-member"
    }
  ];
}

async function evaluateSmokeChecks(
  checks: readonly SmokeCheck[],
  graphqlApiUrl: string,
  tokens: {
    readonly primary: string;
    readonly secondary: string | undefined;
  }
): Promise<readonly SmokeCheckEvaluation[]> {
  const evaluations: SmokeCheckEvaluation[] = [];

  for (const check of checks) {
    const result = await executeGraphqlRequest(
      graphqlApiUrl,
      check.request,
      getSmokeCheckIdToken(check, tokens)
    );

    evaluations.push(evaluateSmokeCheck(check, result));
  }

  return evaluations;
}

export function evaluateSmokeCheck(
  check: SmokeCheck,
  result: SmokeHttpResult
): SmokeCheckEvaluation {
  if (check.expectation === "unauthorized") {
    const ok = result.httpStatus === 401 || result.httpStatus === 403 ||
      hasGraphqlErrors(result.body);

    return {
      details: ok
        ? `Rejected with HTTP ${result.httpStatus}.`
        : `Expected auth rejection, got HTTP ${result.httpStatus}.`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "invalidActorResponse") {
    const submit = getSubmitGameActionPayload(result.body);
    const ok = result.httpStatus === 200 &&
      submit?.accepted === false &&
      submit.committed === false &&
      submit.duplicate === false &&
      submit.error?.code === "INVALID_ACTOR";

    return {
      details: ok
        ? "Resolver returned INVALID_ACTOR from authenticated Cognito identity."
        : `Expected INVALID_ACTOR response. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "seededPublicSnapshot") {
    const snapshot = getObjectPayload(result.body, "getGameSnapshot");
    const serialized = JSON.stringify(snapshot);
    const ok = result.httpStatus === 200 &&
      !hasGraphqlErrors(result.body) &&
      typeof snapshot?.gameId === "string" &&
      snapshot.phase === "dealt" &&
      readSeatHandCount(snapshot, "seat0") === 7 &&
      readSeatHandCount(snapshot, "seat1") === 7 &&
      readSeatHandCount(snapshot, "seat2") === 7 &&
      readSeatHandCount(snapshot, "seat3") === 7 &&
      !serialized.includes("\"hands\"") &&
      !serialized.includes("\"viewerHand\"") &&
      !serialized.includes("\"dominoes\"");

    return {
      details: ok
        ? "Seeded public snapshot returned hand counts without private hands."
        : `Expected redacted seeded public snapshot. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "seededNonMemberDenied") {
    const summary = summarizeSmokeHttpResult(result);
    const ok = result.httpStatus === 200 &&
      hasGraphqlErrors(result.body) &&
      (summary.includes("INVALID_ACTOR") ||
        summary.includes("not a member") ||
        summary.includes("requires ownership"));

    return {
      details: ok
        ? "Seeded query rejected an authenticated non-member."
        : `Expected non-member authorization rejection. ${summary}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "seededPrivateHand") {
    const privateHand = getObjectPayload(result.body, "getMyPrivateHand");
    const ok = result.httpStatus === 200 &&
      !hasGraphqlErrors(result.body) &&
      typeof privateHand?.gameId === "string" &&
      privateHand.seatIndex === "SEAT_1" &&
      Array.isArray(privateHand.dominoes) &&
      privateHand.dominoes.length === 7;

    return {
      details: ok
        ? "Seeded private-hand query returned the authenticated actor hand."
        : `Expected seeded private hand for actor seat. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "seededPrivateHandDenied") {
    const summary = summarizeSmokeHttpResult(result);
    const ok = result.httpStatus === 200 &&
      hasGraphqlErrors(result.body) &&
      (summary.includes("INVALID_ACTOR") ||
        summary.includes("Private hand access requires ownership"));

    return {
      details: ok
        ? "Seeded private-hand query rejected another seat."
        : `Expected private hand ownership rejection. ${summary}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "acceptedAction") {
    const submit = getSubmitGameActionPayload(result.body);
    const serialized = JSON.stringify(submit);
    const ok = result.httpStatus === 200 &&
      !hasGraphqlErrors(result.body) &&
      submit?.accepted === true &&
      submit.committed === true &&
      submit.duplicate === false &&
      typeof submit.gameId === "string" &&
      Array.isArray(submit.events) &&
      submit.events.length > 0 &&
      submit.snapshot?.phase === "bidding" &&
      !serialized.includes("\"hands\"") &&
      !serialized.includes("\"viewerHand\"");

    return {
      details: ok
        ? "Seeded legal action was accepted and returned a redacted snapshot."
        : `Expected accepted seeded action. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "duplicateAction") {
    const submit = getSubmitGameActionPayload(result.body);
    const ok = result.httpStatus === 200 &&
      !hasGraphqlErrors(result.body) &&
      submit?.accepted === true &&
      submit.committed === false &&
      submit.duplicate === true;

    return {
      details: ok
        ? "Seeded duplicate action returned the prior accepted result."
        : `Expected idempotent duplicate action result. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  if (check.expectation === "reconnectAcceptedPending") {
    const reconnect = getObjectPayload(result.body, "getReconnectView");
    const serialized = JSON.stringify(reconnect);
    const ok = result.httpStatus === 200 &&
      !hasGraphqlErrors(result.body) &&
      Array.isArray(reconnect?.acceptedPendingActionIds) &&
      reconnect.acceptedPendingActionIds.length === 1 &&
      Array.isArray(reconnect.unknownPendingActionIds) &&
      reconnect.unknownPendingActionIds.length === 1 &&
      reconnect.requiresSnapshotRefresh === true &&
      reconnect.privateHand?.seatIndex === "SEAT_1" &&
      Array.isArray(reconnect.privateHand?.dominoes) &&
      reconnect.privateHand.dominoes.length === 7 &&
      reconnect.snapshot?.phase === "bidding" &&
      !serialized.includes("\"hands\"") &&
      !serialized.includes("\"viewerHand\"");

    return {
      details: ok
        ? "Seeded reconnect returned private hand and pending-action status."
        : `Expected seeded reconnect pending-action view. ${summarizeSmokeHttpResult(result)}`,
      ok,
      title: check.title
    };
  }

  const ok = result.httpStatus === 200 && hasGraphqlErrors(result.body);

  return {
    details: ok
      ? "Resolver reached Lambda/DynamoDB path and returned a GraphQL error for missing smoke data."
      : `Expected GraphQL error for missing smoke data. ${summarizeSmokeHttpResult(result)}`,
    ok,
    title: check.title
  };
}

export async function executeGraphqlRequest(
  graphqlApiUrl: string,
  request: SmokeGraphqlRequest,
  idToken?: string
): Promise<SmokeHttpResult> {
  const response = await fetch(graphqlApiUrl, {
    body: JSON.stringify(request),
    headers: {
      ...(idToken ? { Authorization: idToken } : {}),
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const text = await response.text();

  return {
    body: parseGraphqlBody(text),
    httpStatus: response.status
  };
}

export function deriveAppSyncRealtimeUrl(graphqlApiUrl: string): string {
  const url = new URL(graphqlApiUrl);

  url.protocol = "wss:";
  url.search = "";
  url.hash = "";

  if (url.hostname.includes(".appsync-api.")) {
    url.hostname = url.hostname.replace(
      ".appsync-api.",
      ".appsync-realtime-api."
    );
  } else {
    url.pathname = `${url.pathname.replace(/\/$/u, "")}/realtime`;
  }

  return url.toString();
}

export function createAppSyncRealtimeAuthorization(
  graphqlApiUrl: string,
  idToken: string
): AppSyncRealtimeAuthorization {
  return {
    Authorization: idToken,
    host: new URL(graphqlApiUrl).host
  };
}

export function createAppSyncRealtimeConnectUrl(
  graphqlApiUrl: string,
  idToken: string
): string {
  const realtimeUrl = new URL(deriveAppSyncRealtimeUrl(graphqlApiUrl));

  realtimeUrl.searchParams.set(
    "header",
    Buffer.from(
      JSON.stringify(createAppSyncRealtimeAuthorization(graphqlApiUrl, idToken)),
      "utf8"
    ).toString("base64")
  );
  realtimeUrl.searchParams.set(
    "payload",
    Buffer.from("{}", "utf8").toString("base64")
  );

  return realtimeUrl.toString();
}

export function createOnGameUpdatedSubscriptionStartMessage(
  options: {
    readonly graphqlApiUrl: string;
    readonly idToken: string;
    readonly seed: Pick<DeployedSmokeGameSeed, "gameId">;
    readonly subscriptionId: string;
  }
): AppSyncRealtimeStartMessage {
  const request = createOnGameUpdatedSubscriptionRequest(options.seed);

  return {
    id: options.subscriptionId,
    payload: {
      data: JSON.stringify({
        query: request.query,
        variables: request.variables
      }),
      extensions: {
        authorization: createAppSyncRealtimeAuthorization(
          options.graphqlApiUrl,
          options.idToken
        )
      }
    },
    type: "start"
  };
}

export function evaluateOnGameUpdatedSubscriptionPayload(
  seed: Pick<DeployedSmokeGameSeed, "gameId">,
  payload: unknown
): SmokeCheckEvaluation {
  const body = typeof payload === "object" && payload !== null
    ? payload as GraphqlResponseBody
    : null;
  const update = getObjectPayload(body, "onGameUpdated");
  const serialized = JSON.stringify(update);
  const ok = !hasGraphqlErrors(body) &&
    update?.accepted === true &&
    update.committed === true &&
    update.duplicate === false &&
    update.gameId === seed.gameId &&
    Array.isArray(update.events) &&
    update.events.length > 0 &&
    update.snapshot?.gameId === seed.gameId &&
    update.snapshot?.phase === "bidding" &&
    !serialized.includes("\"hands\"") &&
    !serialized.includes("\"viewerHand\"");

  return {
    details: ok
      ? "Subscription delivered the committed action with a public redacted snapshot."
      : `Expected onGameUpdated accepted-action payload. ${summarizeRealtimePayload(payload)}`,
    ok,
    title: SEEDED_SUBSCRIPTION_TITLE
  };
}

async function validateSeededSubscription(
  options: ValidateSeededSubscriptionOptions
): Promise<SmokeCheckEvaluation> {
  try {
    return await waitForSeededSubscriptionUpdate(options);
  } catch (error) {
    return {
      details: error instanceof Error ? error.message : String(error),
      ok: false,
      title: SEEDED_SUBSCRIPTION_TITLE
    };
  }
}

async function waitForSeededSubscriptionUpdate(
  options: ValidateSeededSubscriptionOptions
): Promise<SmokeCheckEvaluation> {
  const subscriptionId = `smoke-${randomUUID()}`;
  const webSocketFactory = options.webSocketFactory ??
    createDefaultRealtimeWebSocket;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REALTIME_SMOKE_TIMEOUT_MS;
  const connectUrl = createAppSyncRealtimeConnectUrl(
    options.graphqlApiUrl,
    options.idToken
  );

  return await new Promise((resolve) => {
    let registered = false;
    let settled = false;
    let submitted = false;
    let accepted = false;
    let mutationFinished = false;
    let pendingRealtimeError: string | null = null;
    let socket: RealtimeWebSocket | undefined;

    const timeout = setTimeout(() => {
      const waitingFor = !registered
        ? "subscription acknowledgment"
        : accepted
          ? "onGameUpdated data"
          : "accepted submitGameAction response";

      settle({
        details: `Timed out after ${timeoutMs}ms waiting for ${waitingFor}.`,
        ok: false,
        title: SEEDED_SUBSCRIPTION_TITLE
      });
    }, timeoutMs);

    const settle = (evaluation: SmokeCheckEvaluation): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (socket) {
        if (registered) {
          safelySendRealtimeMessage(socket, {
            id: subscriptionId,
            type: "stop"
          });
        }

        try {
          socket.close();
        } catch {
          // Best-effort cleanup; the smoke result above is the useful signal.
        }
      }

      resolve(evaluation);
    };

    const submitSeededAction = async (): Promise<void> => {
      if (submitted || settled) {
        return;
      }

      submitted = true;

      try {
        const result = await executeGraphqlRequest(
          options.graphqlApiUrl,
          createSeededSubmitGameActionSmokeRequest(options.seed),
          options.idToken
        );
        const evaluation = evaluateSmokeCheck(
          {
            expectation: "acceptedAction",
            request: createSeededSubmitGameActionSmokeRequest(options.seed),
            requiresAuth: true,
            title: "seeded submitGameAction accepts a legal bid for subscription"
          },
          result
        );

        mutationFinished = true;

        if (!evaluation.ok) {
          settle({
            details: pendingRealtimeError
              ? `${pendingRealtimeError} Mutation validation also failed: ${evaluation.details}`
              : `Subscription registered, but mutation validation failed. ${evaluation.details}`,
            ok: false,
            title: SEEDED_SUBSCRIPTION_TITLE
          });
          return;
        }

        accepted = true;

        if (pendingRealtimeError) {
          settle({
            details: `${pendingRealtimeError} Mutation validation succeeded, so the failure is isolated to subscription delivery/filtering.`,
            ok: false,
            title: SEEDED_SUBSCRIPTION_TITLE
          });
        }
      } catch (error) {
        mutationFinished = true;
        settle({
          details: pendingRealtimeError
            ? `${pendingRealtimeError} Mutation request also failed: ${
              error instanceof Error ? error.message : String(error)
            }`
            : error instanceof Error ? error.message : String(error),
          ok: false,
          title: SEEDED_SUBSCRIPTION_TITLE
        });
      }
    };

    try {
      socket = webSocketFactory(connectUrl, ["graphql-ws"]);
    } catch (error) {
      settle({
        details: error instanceof Error ? error.message : String(error),
        ok: false,
        title: SEEDED_SUBSCRIPTION_TITLE
      });
      return;
    }

    const handleRealtimeError = (details: string): void => {
      if (submitted && !mutationFinished) {
        pendingRealtimeError = details;
        return;
      }

      settle({
        details,
        ok: false,
        title: SEEDED_SUBSCRIPTION_TITLE
      });
    };

    socket.addEventListener("open", () => {
      safelySendRealtimeMessage(socket, {
        type: "connection_init"
      });
    });
    socket.addEventListener("message", (event) => {
      const message = parseRealtimeMessageData(event.data);

      if (!message) {
        return;
      }

      if (message.type === "connection_ack") {
        safelySendRealtimeMessage(
          socket,
          createOnGameUpdatedSubscriptionStartMessage({
            graphqlApiUrl: options.graphqlApiUrl,
            idToken: options.idToken,
            seed: options.seed,
            subscriptionId
          })
        );
        return;
      }

      if (message.type === "start_ack" && message.id === subscriptionId) {
        registered = true;
        void submitSeededAction();
        return;
      }

      if (message.type === "data" && message.id === subscriptionId) {
        settle(evaluateOnGameUpdatedSubscriptionPayload(
          options.seed,
          message.payload
        ));
        return;
      }

      if (message.type === "error" &&
        (message.id === undefined || message.id === subscriptionId)) {
        handleRealtimeError(
          `AppSync realtime returned an error. ${summarizeRealtimePayload(message.payload)}`
        );
      }
    });
    socket.addEventListener("error", () => {
      settle({
        details: "WebSocket reported an error before subscription data arrived.",
        ok: false,
        title: SEEDED_SUBSCRIPTION_TITLE
      });
    });
    socket.addEventListener("close", () => {
      if (!settled) {
        settle({
          details: "WebSocket closed before subscription data arrived.",
          ok: false,
          title: SEEDED_SUBSCRIPTION_TITLE
        });
      }
    });
  });
}

function createOnGameUpdatedSubscriptionRequest(
  seed: Pick<DeployedSmokeGameSeed, "gameId">
): SmokeGraphqlRequest {
  return {
    operationName: "SmokeOnGameUpdated",
    query: `
      subscription SmokeOnGameUpdated($gameId: ID!) {
        onGameUpdated(gameId: $gameId) {
          accepted
          committed
          duplicate
          gameId
          error {
            code
            message
          }
          events {
            actionId
            actorId
            actorSeat
            eventType
            sequence
          }
          snapshot {
            gameId
            handCounts {
              seat0
              seat1
              seat2
              seat3
            }
            lastEventSequence
            phase
            redactedState
            snapshotVersion
          }
        }
      }
    `,
    variables: {
      gameId: seed.gameId
    }
  };
}

function createSubmitGameActionSmokeRequest(gameId: string): SmokeGraphqlRequest {
  const action = {
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
    gameId,
    schemaVersion: 1
  };

  return {
    operationName: "SmokeSubmitGameAction",
    query: `
      mutation SmokeSubmitGameAction($input: SubmitGameActionInput!) {
        submitGameAction(input: $input) {
          accepted
          committed
          duplicate
          gameId
          error {
            code
            message
          }
        }
      }
    `,
    variables: {
      input: {
        action: JSON.stringify(action),
        gameId
      }
    }
  };
}

function createSeededSubmitGameActionSmokeRequest(
  seed: DeployedSmokeGameSeed
): SmokeGraphqlRequest {
  return {
    operationName: "SmokeSeededSubmitGameAction",
    query: `
      mutation SmokeSeededSubmitGameAction($input: SubmitGameActionInput!) {
        submitGameAction(input: $input) {
          accepted
          committed
          duplicate
          gameId
          error {
            code
            message
          }
          events {
            actionId
            actorId
            actorSeat
            eventType
            sequence
          }
          snapshot {
            gameId
            handCounts {
              seat0
              seat1
              seat2
              seat3
            }
            lastEventSequence
            phase
            redactedState
            snapshotVersion
          }
        }
      }
    `,
    variables: {
      input: {
        action: seed.actionJson,
        gameId: seed.gameId
      }
    }
  };
}

function createDefaultRealtimeWebSocket(
  url: string,
  protocols: readonly string[]
): RealtimeWebSocket {
  const SocketCtor = (globalThis as {
    readonly WebSocket?: new (
      url: string,
      protocols?: string | string[]
    ) => RealtimeWebSocket;
  }).WebSocket;

  if (!SocketCtor) {
    throw new DeployedSmokeError(
      "Global WebSocket is unavailable; run deployed smoke with Node.js 22 or newer."
    );
  }

  return new SocketCtor(url, [...protocols]);
}

function safelySendRealtimeMessage(
  socket: RealtimeWebSocket | undefined,
  message: unknown
): void {
  if (!socket) {
    return;
  }

  try {
    socket.send(JSON.stringify(message));
  } catch {
    // A close may already be in progress; the surrounding timeout/error path reports it.
  }
}

function parseRealtimeMessageData(data: unknown): SmokePayload | null {
  const text = readRealtimeMessageText(data);

  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    return typeof parsed === "object" && parsed !== null
      ? parsed as SmokePayload
      : null;
  } catch {
    return null;
  }
}

function readRealtimeMessageText(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      .toString("utf8");
  }

  return null;
}

function parseGraphqlBody(text: string): GraphqlResponseBody | null {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    return typeof parsed === "object" && parsed !== null
      ? parsed as GraphqlResponseBody
      : null;
  } catch {
    return null;
  }
}

function getSubmitGameActionPayload(
  body: GraphqlResponseBody | null
): SmokePayload | null {
  return getObjectPayload(body, "submitGameAction");
}

function getObjectPayload(
  body: GraphqlResponseBody | null,
  fieldName: string
): SmokePayload | null {
  const data = body?.data;
  const payload = data?.[fieldName];

  return typeof payload === "object" && payload !== null
    ? payload as SmokePayload
    : null;
}

function readSeatHandCount(
  snapshot: SmokePayload | null,
  seatKey: "seat0" | "seat1" | "seat2" | "seat3"
): number | null {
  const handCounts = snapshot?.handCounts;

  return typeof handCounts === "object" &&
    handCounts !== null &&
    typeof handCounts[seatKey] === "number"
    ? handCounts[seatKey]
    : null;
}

function getSmokeCheckIdToken(
  check: SmokeCheck,
  tokens: {
    readonly primary: string;
    readonly secondary: string | undefined;
  }
): string | undefined {
  if (!check.requiresAuth) {
    return undefined;
  }

  if (check.authUser === "secondary") {
    return tokens.secondary;
  }

  return tokens.primary;
}

function hasGraphqlErrors(body: GraphqlResponseBody | null): boolean {
  return Array.isArray(body?.errors) && body.errors.length > 0;
}

function summarizeSmokeHttpResult(result: SmokeHttpResult): string {
  return `HTTP ${result.httpStatus}; body ${JSON.stringify(result.body)}`;
}

function summarizeRealtimePayload(payload: unknown): string {
  return `payload ${JSON.stringify(payload)}`;
}

function requireStackOutput(outputs: readonly Output[], key: string): string {
  const value = outputs.find((output) => output.OutputKey === key)?.OutputValue;

  return requireEnv(value, `CloudFormation output ${key}`);
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new DeployedSmokeError(`${name} is required.`);
  }

  return value;
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolveSecondarySmokeUser(
  env: DeployedSmokeEnvironment,
  primary: DeployedSmokeUserConfig,
  options: {
    readonly createUser: boolean;
    readonly seedGame: boolean;
  }
): DeployedSmokeUserConfig | undefined {
  if (!options.seedGame) {
    return undefined;
  }

  const secondaryEmail = readOptionalEnv(env.SHAKE2_SMOKE_SECONDARY_EMAIL);
  const secondaryPassword = readOptionalEnv(env.SHAKE2_SMOKE_SECONDARY_PASSWORD);
  const secondaryUsername = readOptionalEnv(env.SHAKE2_SMOKE_SECONDARY_USERNAME);
  const hasSecondaryConfig = secondaryEmail !== undefined ||
    secondaryPassword !== undefined ||
    secondaryUsername !== undefined;

  if (!options.createUser && !hasSecondaryConfig) {
    return undefined;
  }

  return {
    password: secondaryPassword ?? primary.password,
    userEmail: secondaryEmail ?? deriveSecondaryEmail(primary.userEmail),
    username: secondaryUsername ?? `${primary.username}-nonmember`
  };
}

function deriveSecondaryEmail(primaryEmail: string): string {
  const atIndex = primaryEmail.indexOf("@");

  if (atIndex > 0) {
    return `${primaryEmail.slice(0, atIndex)}+nonmember${primaryEmail.slice(atIndex)}`;
  }

  return `nonmember-${primaryEmail}`;
}

export function parseJwtSubject(idToken: string): string {
  const payload = idToken.split(".")[1];

  if (!payload) {
    throw new DeployedSmokeError("Cognito ID token is malformed.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new DeployedSmokeError("Cognito ID token payload is malformed.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { readonly sub?: unknown }).sub !== "string" ||
    (parsed as { readonly sub: string }).sub.trim().length === 0
  ) {
    throw new DeployedSmokeError("Cognito ID token did not include a subject.");
  }

  return (parsed as { readonly sub: string }).sub;
}

function getErrorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function readOptionalDotEnvFile(path: string | null): DeployedSmokeEnvironment {
  if (!path) {
    return {};
  }

  return parseDotEnvFile(readFileSync(path, "utf8"));
}

function findDotEnvPath(cwd: string): string | null {
  for (const candidate of [
    join(cwd, ".env"),
    join(cwd, "backend", ".env"),
    fileURLToPath(new URL("../../../../.env", import.meta.url))
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isSmokeEnvironmentKey(key: string): key is keyof DeployedSmokeEnvironment {
  return [
    "AWS_REGION",
    "SHAKE2_ROOM_GAME_ID_INDEX_NAME",
    "SHAKE2_SMOKE_CREATE_USER",
    "SHAKE2_SMOKE_EMAIL",
    "SHAKE2_SMOKE_GAME_ID",
    "SHAKE2_SMOKE_PASSWORD",
    "SHAKE2_SMOKE_SEED_GAME",
    "SHAKE2_SMOKE_SEEDED_GAME_ID",
    "SHAKE2_SMOKE_SECONDARY_EMAIL",
    "SHAKE2_SMOKE_SECONDARY_PASSWORD",
    "SHAKE2_SMOKE_SECONDARY_USERNAME",
    "SHAKE2_SMOKE_STACK_NAME",
    "SHAKE2_SMOKE_USERNAME",
    "SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION"
  ].includes(key);
}

function unquoteDotEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDeployedSmoke()
    .then((evaluations) => {
      console.log(JSON.stringify({
        ok: true,
        results: evaluations
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
