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
  readonly SHAKE2_SMOKE_STACK_NAME?: string;
  readonly SHAKE2_SMOKE_USERNAME?: string;
}

export interface DeployedSmokeConfig {
  readonly createUser: boolean;
  readonly gameId: string;
  readonly password: string;
  readonly region: string;
  readonly roomGameIdIndexName: string;
  readonly seedGame: boolean;
  readonly seededGameId?: string;
  readonly stackName: string;
  readonly userEmail: string;
  readonly username: string;
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
  | "seededPrivateHand"
  | "seededPrivateHandDenied"
  | "acceptedAction"
  | "duplicateAction"
  | "reconnectAcceptedPending";

export interface SmokeCheck {
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
  }

  const idToken = await authenticateSmokeUser(cognito, outputs, config);
  const checks = [
    ...createSmokeChecks(config.gameId)
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

    checks.push(...createSeededSmokeChecks(seed));
  }

  const evaluations: SmokeCheckEvaluation[] = [];

  for (const check of checks) {
    const result = await executeGraphqlRequest(
      outputs.graphqlApiUrl,
      check.request,
      check.requiresAuth ? idToken : undefined
    );

    evaluations.push(evaluateSmokeCheck(check, result));
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
  const seededGameId = readOptionalEnv(env.SHAKE2_SMOKE_SEEDED_GAME_ID);

  return {
    createUser: env.SHAKE2_SMOKE_CREATE_USER === "true",
    gameId: env.SHAKE2_SMOKE_GAME_ID ?? "smoke-missing-game",
    password: requireEnv(env.SHAKE2_SMOKE_PASSWORD, "SHAKE2_SMOKE_PASSWORD"),
    region: env.AWS_REGION ?? "us-east-1",
    roomGameIdIndexName: env.SHAKE2_ROOM_GAME_ID_INDEX_NAME ?? "GameIdIndex",
    seedGame: env.SHAKE2_SMOKE_SEED_GAME === "true",
    ...(seededGameId !== undefined ? { seededGameId } : {}),
    stackName: env.SHAKE2_SMOKE_STACK_NAME ?? "shake2-dev-multiplayer-infra",
    userEmail,
    username: env.SHAKE2_SMOKE_USERNAME ?? userEmail
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

function hasGraphqlErrors(body: GraphqlResponseBody | null): boolean {
  return Array.isArray(body?.errors) && body.errors.length > 0;
}

function summarizeSmokeHttpResult(result: SmokeHttpResult): string {
  return `HTTP ${result.httpStatus}; body ${JSON.stringify(result.body)}`;
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
    "SHAKE2_SMOKE_STACK_NAME",
    "SHAKE2_SMOKE_USERNAME"
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
