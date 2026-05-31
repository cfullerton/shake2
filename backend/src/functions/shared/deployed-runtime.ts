import {
  createDynamoDBMultiplayerStoreFromEnv,
  type MultiplayerStore
} from "../../dynamodb/store.ts";
import { BackendResolverError } from "../../errors/errors.ts";
import {
  type EngineContext
} from "../../game-engine.ts";
import {
  type ResolverContext
} from "../../types/index.ts";

export interface DeployedResolverEnvironment {
  readonly AWS_REGION?: string;
  readonly SHAKE2_MULTIPLAYER_TABLE_NAME?: string;
  readonly SHAKE2_ROOM_CODE_INDEX_NAME?: string;
  readonly SHAKE2_ROOM_GAME_ID_INDEX_NAME?: string;
}

export function createDeployedMultiplayerStore(
  env: DeployedResolverEnvironment = process.env
): MultiplayerStore {
  return createDynamoDBMultiplayerStoreFromEnv(env);
}

export function createDeployedResolverContext(
  env: DeployedResolverEnvironment = process.env
): ResolverContext {
  return {
    requestId: "appsync",
    tableName: requireEnvironmentValue(
      env.SHAKE2_MULTIPLAYER_TABLE_NAME,
      "SHAKE2_MULTIPLAYER_TABLE_NAME"
    )
  };
}

export function createDeployedEngineContext(): EngineContext {
  let nextId = 0;

  return {
    newId: () => {
      nextId += 1;
      return `lambda-${Date.now()}-${nextId}`;
    },
    now: () => new Date().toISOString(),
    random: () => Math.random()
  };
}

function requireEnvironmentValue(
  value: string | undefined,
  name: string
): string {
  if (!value || value.trim().length === 0) {
    throw new BackendResolverError(
      "PERSISTENCE_ERROR",
      `${name} is required.`
    );
  }

  return value;
}
