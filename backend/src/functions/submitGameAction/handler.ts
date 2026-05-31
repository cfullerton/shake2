import { extractBackendActor } from "../../auth/identity.ts";
import {
  type MultiplayerStore,
  createUnimplementedMultiplayerStore
} from "../../dynamodb/store.ts";
import {
  BackendResolverError,
  createBackendErrorResponse
} from "../../errors/errors.ts";
import {
  createMultiplayerAcceptedActionWritePlan,
  createMultiplayerCompletedHandSummary,
  createMultiplayerDynamoDbTransactionWritePlan,
  createMultiplayerRejectedActionWritePlan,
  createMultiplayerVisibleSnapshot,
  getMultiplayerSeatForPlayer,
  parseFortyTwoActionEnvelope,
  restoreMultiplayerSessionFromRecords,
  submitMultiplayerGameAction,
  type EngineContext,
  type FortyTwoActionEnvelope,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameSession,
  type MultiplayerStoredGameRecords,
  type MultiplayerSubmitActionResult,
  type MultiplayerWritePlan
} from "../../game-engine.ts";
import {
  type ResolverContext,
  type SubmitGameActionAppSyncEvent,
  type SubmitGameActionRequest,
  type SubmitGameActionResponse
} from "../../types/index.ts";

export interface SubmitGameActionHandlerDependencies {
  readonly engineContext: EngineContext;
  readonly resolverContext: ResolverContext;
  readonly store: MultiplayerStore;
}

export type SubmitGameActionHandler = (
  event: SubmitGameActionAppSyncEvent
) => Promise<SubmitGameActionResponse>;

export function createSubmitGameActionHandler(
  dependencies: SubmitGameActionHandlerDependencies
): SubmitGameActionHandler {
  return async (event) => {
    try {
      const actor = extractBackendActor(event.identity);
      const request = parseSubmitGameActionRequest(event.arguments?.input);
      const action = parseFortyTwoActionEnvelope(request.action);

      assertActionMatchesRequest(request, action);
      assertActorMatchesAction(actor.playerId, action);

      const idempotencyResult = await dependencies.store.loadIdempotencyResult({
        actionId: action.actionId,
        gameId: action.gameId
      });

      const previousSession = restoreSession(
        addLoadedIdempotencyResult(
          await dependencies.store.loadGameSnapshot({
            gameId: request.gameId
          }),
          idempotencyResult
        )
      );
      const result = submitMultiplayerGameAction(
        previousSession,
        action,
        dependencies.engineContext
      );

      if (result.ok) {
        return handleAcceptedResult(
          dependencies,
          previousSession,
          result,
          actor.playerId
        );
      }

      return handleRejectedResult(
        dependencies,
        previousSession,
        result
      );
    } catch (error) {
      return {
        accepted: false,
        committed: false,
        duplicate: false,
        error: createBackendErrorResponse(error)
      };
    }
  };
}

export const submitGameActionHandler = createSubmitGameActionHandler({
  engineContext: createSystemEngineContext(),
  resolverContext: {
    requestId: "unconfigured",
    tableName: "UNCONFIGURED_MULTIPLAYER_TABLE"
  },
  store: createUnimplementedMultiplayerStore()
});

async function handleAcceptedResult(
  dependencies: SubmitGameActionHandlerDependencies,
  previousSession: MultiplayerGameSession,
  result: Extract<MultiplayerSubmitActionResult, { readonly ok: true }>,
  playerId: string
): Promise<SubmitGameActionResponse> {
  if (result.duplicate) {
    const lastCompletedHand = createMultiplayerCompletedHandSummary(
      result.snapshot,
      result.session.events
    );

    return {
      accepted: true,
      committed: false,
      duplicate: true,
      events: result.events,
      ...(lastCompletedHand ? { lastCompletedHand } : {}),
      snapshot: createMultiplayerVisibleSnapshot(
        result.snapshot,
        getMultiplayerSeatForPlayer(result.session.room, playerId)
      )
    };
  }

  const writePlan = createMultiplayerAcceptedActionWritePlan(
    previousSession,
    result,
    {
      ...(dependencies.resolverContext.actionExpiresAt !== undefined
        ? { actionExpiresAt: dependencies.resolverContext.actionExpiresAt }
        : {})
    }
  );
  const transaction = createTransaction(writePlan, dependencies.resolverContext);

  await dependencies.store.commitWritePlan({
    gameId: result.snapshot.gameId,
    transaction,
    writePlan
  });

  const lastCompletedHand = createMultiplayerCompletedHandSummary(
    result.snapshot,
    result.session.events
  );

  return {
    accepted: true,
    committed: true,
    duplicate: false,
    events: result.events,
    ...(lastCompletedHand ? { lastCompletedHand } : {}),
    snapshot: createMultiplayerVisibleSnapshot(
      result.snapshot,
      getMultiplayerSeatForPlayer(result.session.room, playerId)
    ),
    transaction
  };
}

async function handleRejectedResult(
  dependencies: SubmitGameActionHandlerDependencies,
  previousSession: MultiplayerGameSession,
  result: Extract<MultiplayerSubmitActionResult, { readonly ok: false }>
): Promise<SubmitGameActionResponse> {
  if (result.duplicate) {
    return {
      accepted: false,
      committed: false,
      duplicate: true,
      error: createBackendErrorResponse(result.error)
    };
  }

  const writePlan = createMultiplayerRejectedActionWritePlan(
    previousSession,
    result,
    {
      ...(dependencies.resolverContext.actionExpiresAt !== undefined
        ? { actionExpiresAt: dependencies.resolverContext.actionExpiresAt }
        : {})
    }
  );
  const transaction = createTransaction(writePlan, dependencies.resolverContext);

  await dependencies.store.commitWritePlan({
    gameId: result.session.snapshot.gameId,
    transaction,
    writePlan
  });

  return {
    accepted: false,
    committed: true,
    duplicate: false,
    error: createBackendErrorResponse(result.error),
    transaction
  };
}

function createTransaction(
  writePlan: MultiplayerWritePlan,
  resolverContext: ResolverContext
) {
  return createMultiplayerDynamoDbTransactionWritePlan(writePlan, {
    tableName: resolverContext.tableName
  });
}

function restoreSession(records: unknown): MultiplayerGameSession {
  const restored = restoreMultiplayerSessionFromRecords(records);

  if (!restored.ok) {
    throw restored.error;
  }

  return restored.value;
}

function addLoadedIdempotencyResult(
  records: MultiplayerStoredGameRecords,
  idempotencyResult: MultiplayerActionIdempotencyRecord | null
): MultiplayerStoredGameRecords {
  if (!idempotencyResult) {
    return records;
  }

  const idempotency = records.idempotency.some((record) =>
    record.actionId === idempotencyResult.actionId
  )
    ? records.idempotency
    : [
        ...records.idempotency,
        idempotencyResult
      ];

  return {
    ...records,
    idempotency
  };
}

function parseSubmitGameActionRequest(value: unknown): SubmitGameActionRequest {
  const record = parseRecord(value, "submitGameAction.input");
  const gameId = parseNonEmptyString(record.gameId, "submitGameAction.gameId");

  if (record.action === undefined) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      "Submit game action input requires an action envelope."
    );
  }

  return {
    action: parseAwsJsonInput(record.action, "submitGameAction.action"),
    gameId
  };
}

function parseAwsJsonInput(value: unknown, label: string): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be valid JSON.`
    );
  }
}

function assertActionMatchesRequest(
  request: SubmitGameActionRequest,
  action: FortyTwoActionEnvelope
): void {
  if (request.gameId !== action.gameId) {
    throw new BackendResolverError(
      "GAME_NOT_FOUND",
      "Action game ID does not match request game ID."
    );
  }
}

function assertActorMatchesAction(
  playerId: string,
  action: FortyTwoActionEnvelope
): void {
  if (playerId !== action.actorId) {
    throw new BackendResolverError(
      "INVALID_ACTOR",
      "Authenticated actor does not match action actor."
    );
  }
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be an object.`
    );
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be a non-empty string.`
    );
  }

  return value;
}

function createSystemEngineContext(): EngineContext {
  let nextId = 0;

  return {
    newId: () => {
      nextId += 1;
      return `backend-${Date.now()}-${nextId}`;
    },
    now: () => new Date().toISOString(),
    random: () => Math.random()
  };
}
