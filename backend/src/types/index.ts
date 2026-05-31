import {
  type EngineErrorCode,
  type FortyTwoEventEnvelope,
  type MultiplayerCompletedHandSummary,
  type MultiplayerDynamoDbTransactionWritePlan,
  type MultiplayerVisibleSnapshotEnvelope
} from "../game-engine.ts";

export type BackendErrorCode =
  | EngineErrorCode
  | "MALFORMED_REQUEST"
  | "PERSISTENCE_CONFLICT"
  | "PERSISTENCE_ERROR"
  | "UNAUTHENTICATED";

export interface BackendErrorResponse {
  readonly code: BackendErrorCode;
  readonly message: string;
}

export interface BackendActor {
  readonly displayName?: string;
  readonly email?: string;
  readonly identitySource: "cognito" | "mock";
  readonly playerId: string;
  readonly username?: string;
}

export interface AppSyncCognitoIdentityClaims {
  readonly ["cognito:username"]?: string;
  readonly email?: string;
  readonly name?: string;
  readonly sub?: string;
  readonly username?: string;
}

export interface AppSyncCognitoIdentity {
  readonly claims?: AppSyncCognitoIdentityClaims;
  readonly sub?: string;
  readonly username?: string;
}

export interface MockResolverIdentity {
  readonly displayName?: string;
  readonly email?: string;
  readonly playerId: string;
  readonly username?: string;
}

export interface ResolverContext {
  readonly actionExpiresAt?: number;
  readonly requestId: string;
  readonly tableName: string;
}

export interface SubmitGameActionRequest {
  readonly action: unknown;
  readonly gameId: string;
}

export type SubmitGameActionResponse =
  | {
      readonly accepted: true;
      readonly committed: boolean;
      readonly duplicate: boolean;
      readonly events: readonly FortyTwoEventEnvelope[];
      readonly lastCompletedHand?: MultiplayerCompletedHandSummary;
      readonly snapshot: MultiplayerVisibleSnapshotEnvelope;
      readonly transaction?: MultiplayerDynamoDbTransactionWritePlan;
    }
  | {
      readonly accepted: false;
      readonly committed: boolean;
      readonly duplicate: boolean;
      readonly error: BackendErrorResponse;
      readonly transaction?: MultiplayerDynamoDbTransactionWritePlan;
    };

export interface SubmitGameActionAppSyncEvent {
  readonly arguments?: {
    readonly input?: unknown;
  };
  readonly identity?: unknown;
  readonly request?: {
    readonly headers?: Readonly<Record<string, string | undefined>>;
  };
}
