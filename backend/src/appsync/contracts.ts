import { extractBackendActor } from "../auth/identity.ts";
import { BackendResolverError } from "../errors/errors.ts";
import {
  getDominoKey,
  type Domino,
  type FortyTwoEventEnvelope,
  type MultiplayerClientSyncState,
  type MultiplayerPrivateHandRecord,
  type MultiplayerReconnectView,
  type MultiplayerVisibleSnapshotEnvelope,
  type SeatIndex
} from "../game-engine.ts";
import {
  type BackendActor,
  type BackendErrorResponse,
  type SubmitGameActionAppSyncEvent,
  type SubmitGameActionRequest,
  type SubmitGameActionResponse
} from "../types/index.ts";

export type AppSyncSubmitGameActionInput = SubmitGameActionRequest;

export interface AppSyncGetGameSnapshotInput {
  readonly gameId: string;
}

export interface AppSyncGetMyPrivateHandInput {
  readonly gameId: string;
  readonly seatIndex: SeatIndex;
}

export interface AppSyncGetReconnectViewInput {
  readonly gameId: string;
  readonly lastAppliedEventSequence: number;
  readonly pendingActionIds?: readonly string[];
  readonly snapshotVersion: number;
}

export interface PrivateHandStoreBoundaryRequest {
  readonly actorPlayerId: string;
  readonly gameId: string;
  readonly requiresSeatOwnershipCheck: true;
  readonly seatIndex: SeatIndex;
}

export interface AppSyncSeatHandCounts {
  readonly seat0: number;
  readonly seat1: number;
  readonly seat2: number;
  readonly seat3: number;
}

export interface AppSyncDomino {
  readonly high: Domino["high"];
  readonly key: string;
  readonly low: Domino["low"];
}

export interface AppSyncPublicGameSnapshot {
  readonly gameId: string;
  readonly generatedAt: string;
  readonly handCounts?: AppSyncSeatHandCounts;
  readonly lastEventSequence: number;
  readonly phase: string;
  readonly redactedState: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;
  readonly snapshotVersion: number;
}

export interface AppSyncPrivateHandResponse {
  readonly dominoes: readonly AppSyncDomino[];
  readonly gameId: string;
  readonly handNumber: number;
  readonly seatIndex: SeatIndex;
  readonly updatedAt: string;
}

export interface AppSyncSafeGameEventSummary {
  readonly actionId: string;
  readonly actorId: string;
  readonly actorSeat?: SeatIndex;
  readonly eventId: string;
  readonly eventType: string;
  readonly sequence: number;
}

export interface AppSyncPendingActionRejection {
  readonly actionId: string;
  readonly errorCode: string;
}

export type AppSyncSubmitGameActionResult =
  | {
      readonly accepted: true;
      readonly committed: boolean;
      readonly duplicate: boolean;
      readonly error?: undefined;
      readonly events: readonly AppSyncSafeGameEventSummary[];
      readonly snapshot: AppSyncPublicGameSnapshot;
    }
  | {
      readonly accepted: false;
      readonly committed: boolean;
      readonly duplicate: boolean;
      readonly error: BackendErrorResponse;
      readonly events: readonly AppSyncSafeGameEventSummary[];
      readonly snapshot?: undefined;
    };

export interface AppSyncReconnectView {
  readonly acceptedPendingActionIds: readonly string[];
  readonly privateHand?: AppSyncPrivateHandResponse;
  readonly rejectedPendingActions: readonly AppSyncPendingActionRejection[];
  readonly requiresSnapshotRefresh: boolean;
  readonly serverLastEventSequence: number;
  readonly serverSnapshotVersion: number;
  readonly snapshot: AppSyncPublicGameSnapshot;
  readonly unknownPendingActionIds: readonly string[];
}

export interface AppSyncGameUpdatedNotification {
  readonly accepted: boolean;
  readonly actionIds: readonly string[];
  readonly actorIds: readonly string[];
  readonly duplicate: boolean;
  readonly eventIds: readonly string[];
  readonly eventTypes: readonly string[];
  readonly gameId: string;
  readonly lastEventSequence: number;
  readonly snapshotVersion: number;
}

export function createSubmitGameActionResolverEvent(
  input: AppSyncSubmitGameActionInput,
  identity: unknown,
  request?: SubmitGameActionAppSyncEvent["request"]
): SubmitGameActionAppSyncEvent {
  return {
    arguments: {
      input
    },
    identity,
    ...(request ? { request } : {})
  };
}

export function mapSubmitGameActionHandlerResponse(
  response: SubmitGameActionResponse
): AppSyncSubmitGameActionResult {
  if (response.accepted) {
    return {
      accepted: true,
      committed: response.committed,
      duplicate: response.duplicate,
      events: response.events.map(toSafeGameEventSummary),
      snapshot: toPublicGameSnapshot(response.snapshot)
    };
  }

  return {
    accepted: false,
    committed: response.committed,
    duplicate: response.duplicate,
    error: response.error,
    events: []
  };
}

export function mapGetReconnectViewInputToClientSyncState(
  input: AppSyncGetReconnectViewInput
): MultiplayerClientSyncState {
  return {
    connectionStatus: "reconnecting",
    gameId: input.gameId,
    lastAppliedEventSequence: input.lastAppliedEventSequence,
    pendingActionIds: input.pendingActionIds ?? [],
    snapshotVersion: input.snapshotVersion
  };
}

export function mapReconnectViewToAppSyncResponse(
  view: MultiplayerReconnectView
): AppSyncReconnectView {
  const privateHand = createPrivateHandFromPlayerView(view);

  return {
    acceptedPendingActionIds: view.acceptedPendingActionIds,
    ...(privateHand ? { privateHand } : {}),
    rejectedPendingActions: view.rejectedPendingActions,
    requiresSnapshotRefresh: view.requiresSnapshotRefresh,
    serverLastEventSequence: view.serverLastEventSequence,
    serverSnapshotVersion: view.serverSnapshotVersion,
    snapshot: toPublicGameSnapshot(view.view.snapshot),
    unknownPendingActionIds: view.unknownPendingActionIds
  };
}

export function mapGetMyPrivateHandInputToStoreRequest(
  input: AppSyncGetMyPrivateHandInput,
  identity: unknown
): PrivateHandStoreBoundaryRequest {
  const actor = extractBackendActor(identity);

  return {
    actorPlayerId: actor.playerId,
    gameId: input.gameId,
    requiresSeatOwnershipCheck: true,
    seatIndex: input.seatIndex
  };
}

export function mapPrivateHandRecordToAppSyncResponse(
  record: MultiplayerPrivateHandRecord,
  actor: BackendActor,
  requestedSeat: SeatIndex
): AppSyncPrivateHandResponse {
  assertPrivateHandOwnership(record, actor, requestedSeat);

  return {
    dominoes: record.hand.map(toAppSyncDomino),
    gameId: record.gameId,
    handNumber: record.handNumber,
    seatIndex: record.seatIndex,
    updatedAt: record.updatedAt
  };
}

export function toPublicGameSnapshot(
  snapshot: MultiplayerVisibleSnapshotEnvelope
): AppSyncPublicGameSnapshot {
  const redactedState = redactPublicState(snapshot.snapshot);
  const handCounts = readHandCounts(redactedState);

  return {
    gameId: snapshot.gameId,
    generatedAt: snapshot.generatedAt,
    ...(handCounts ? { handCounts } : {}),
    lastEventSequence: snapshot.lastEventSequence,
    phase: readStringField(redactedState, "phase"),
    redactedState,
    schemaVersion: snapshot.schemaVersion,
    snapshotVersion: snapshot.snapshotVersion
  };
}

export function toSafeGameEventSummary(
  event: FortyTwoEventEnvelope
): AppSyncSafeGameEventSummary {
  return {
    actionId: event.actionId,
    actorId: event.actorId,
    ...(event.actorSeat !== undefined ? { actorSeat: event.actorSeat } : {}),
    eventId: event.eventId,
    eventType: event.event.type,
    sequence: event.sequence
  };
}

export function createGameUpdatedNotification(
  gameId: string,
  result: AppSyncSubmitGameActionResult
): AppSyncGameUpdatedNotification {
  return {
    accepted: result.accepted,
    actionIds: unique(result.events.map((event) => event.actionId)),
    actorIds: unique(result.events.map((event) => event.actorId)),
    duplicate: result.duplicate,
    eventIds: result.events.map((event) => event.eventId),
    eventTypes: result.events.map((event) => event.eventType),
    gameId,
    lastEventSequence: result.snapshot?.lastEventSequence ?? 0,
    snapshotVersion: result.snapshot?.snapshotVersion ?? 0
  };
}

function assertPrivateHandOwnership(
  record: MultiplayerPrivateHandRecord,
  actor: BackendActor,
  requestedSeat: SeatIndex
): void {
  if (
    record.playerId !== actor.playerId ||
    record.seatIndex !== requestedSeat
  ) {
    throw new BackendResolverError(
      "INVALID_ACTOR",
      "Private hand access requires ownership of the requested seat."
    );
  }
}

function createPrivateHandFromPlayerView(
  view: MultiplayerReconnectView
): AppSyncPrivateHandResponse | undefined {
  const viewerSeat = view.view.viewerSeat;
  const state = toRecord(view.view.snapshot.snapshot);
  const viewerHand = state.viewerHand;

  if (viewerSeat === null || !Array.isArray(viewerHand)) {
    return undefined;
  }

  return {
    dominoes: viewerHand.map((domino) => toAppSyncDomino(domino as Domino)),
    gameId: view.view.snapshot.gameId,
    handNumber: readNumberField(state, "handNumber"),
    seatIndex: viewerSeat,
    updatedAt: view.view.snapshot.generatedAt
  };
}

function redactPublicState(value: unknown): Readonly<Record<string, unknown>> {
  const state = toRecord(value);
  const redacted: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(state)) {
    if (key === "hands" || key === "viewerHand") {
      continue;
    }

    redacted[key] = field;
  }

  return redacted;
}

function readHandCounts(
  state: Readonly<Record<string, unknown>>
): AppSyncSeatHandCounts | undefined {
  const handCounts = state.handCounts;

  if (!isRecord(handCounts)) {
    return undefined;
  }

  return {
    seat0: readNumberField(handCounts, "0"),
    seat1: readNumberField(handCounts, "1"),
    seat2: readNumberField(handCounts, "2"),
    seat3: readNumberField(handCounts, "3")
  };
}

function readStringField(
  record: Readonly<Record<string, unknown>>,
  field: string
): string {
  const value = record[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${field} must be a non-empty string.`
    );
  }

  return value;
}

function readNumberField(
  record: Readonly<Record<string, unknown>>,
  field: string
): number {
  const value = record[field];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${field} must be a finite number.`
    );
  }

  return value;
}

function toAppSyncDomino(domino: Domino): AppSyncDomino {
  return {
    high: domino.high,
    key: getDominoKey(domino),
    low: domino.low
  };
}

function toRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      "Expected a resolver payload object."
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
