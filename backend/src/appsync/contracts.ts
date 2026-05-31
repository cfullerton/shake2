import { extractBackendActor } from "../auth/identity.ts";
import { BackendResolverError } from "../errors/errors.ts";
import {
  getDominoKey,
  getMultiplayerSeatForPlayer,
  SEAT_INDICES,
  type Domino,
  type FortyTwoEventEnvelope,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerClientSyncState,
  type MultiplayerPrivateHandRecord,
  type MultiplayerReconnectView,
  type MultiplayerRoom,
  type MultiplayerSnapshotRecord,
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

export interface AppSyncCreateRoomInput {
  readonly displayName: string;
}

export interface AppSyncJoinRoomInput {
  readonly displayName: string;
  readonly roomCode: string;
}

export interface AppSyncTakeSeatInput {
  readonly roomId: string;
  readonly seatIndex: SeatIndex;
}

export type AppSyncSeatIndex =
  | "SEAT_0"
  | "SEAT_1"
  | "SEAT_2"
  | "SEAT_3";

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
  readonly seatIndex: AppSyncSeatIndex;
  readonly updatedAt: string;
}

export interface AppSyncSafeGameEventSummary {
  readonly actionId: string;
  readonly actorId: string;
  readonly actorSeat?: AppSyncSeatIndex;
  readonly eventId: string;
  readonly eventType: string;
  readonly sequence: number;
}

export interface AppSyncPendingActionRejection {
  readonly actionId: string;
  readonly errorCode: string;
}

export interface AppSyncRoomParticipant {
  readonly connectionStatus: string;
  readonly displayName: string;
  readonly isViewer: boolean;
  readonly joinedAt: string;
}

export interface AppSyncRoomSeat {
  readonly displayName?: string;
  readonly isViewer: boolean;
  readonly occupied: boolean;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface AppSyncRoomView {
  readonly createdAt: string;
  readonly gameId?: string;
  readonly isHost: boolean;
  readonly participantCount: number;
  readonly participants: readonly AppSyncRoomParticipant[];
  readonly roomCode: string;
  readonly roomId: string;
  readonly seats: readonly AppSyncRoomSeat[];
  readonly status: string;
  readonly updatedAt: string;
  readonly viewerSeat?: AppSyncSeatIndex;
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

export interface AppSyncReconnectRecords {
  readonly idempotency: readonly MultiplayerActionIdempotencyRecord[];
  readonly privateHand?: MultiplayerPrivateHandRecord;
  readonly snapshot: MultiplayerSnapshotRecord;
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

export function mapReconnectRecordsToAppSyncResponse(
  records: AppSyncReconnectRecords,
  actor: BackendActor,
  clientState: MultiplayerClientSyncState
): AppSyncReconnectView {
  const privateHand = records.privateHand
    ? mapPrivateHandRecordToAppSyncResponse(
        records.privateHand,
        actor,
        records.privateHand.seatIndex
      )
    : undefined;
  const pending = classifyPendingActions(
    records.idempotency,
    actor.playerId,
    clientState.pendingActionIds ?? []
  );

  return {
    ...pending,
    ...(privateHand ? { privateHand } : {}),
    requiresSnapshotRefresh:
      clientState.lastAppliedEventSequence !== records.snapshot.lastEventSequence ||
      clientState.snapshotVersion !== records.snapshot.snapshotVersion,
    serverLastEventSequence: records.snapshot.lastEventSequence,
    serverSnapshotVersion: records.snapshot.snapshotVersion,
    snapshot: toPublicGameSnapshot(records.snapshot.payload)
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
    seatIndex: toAppSyncSeatIndex(record.seatIndex),
    updatedAt: record.updatedAt
  };
}

export function toAppSyncRoomView(
  room: MultiplayerRoom,
  actor: BackendActor
): AppSyncRoomView {
  const viewerSeat = getMultiplayerSeatForPlayer(room, actor.playerId);
  const participants = Object.values(room.participants)
    .filter((participant): participant is NonNullable<typeof participant> =>
      participant !== undefined
    )
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))
    .map((participant) => ({
      connectionStatus: participant.connectionStatus,
      displayName: participant.displayName,
      isViewer: participant.playerId === actor.playerId,
      joinedAt: participant.joinedAt
    }));

  return {
    createdAt: room.createdAt,
    ...(room.gameId !== undefined ? { gameId: room.gameId } : {}),
    isHost: room.hostPlayerId === actor.playerId,
    participantCount: participants.length,
    participants,
    roomCode: room.roomCode,
    roomId: room.roomId,
    seats: SEAT_INDICES.map((seatIndex) => {
      const assignment = room.seats[seatIndex];

      return {
        ...(assignment ? { displayName: assignment.displayName } : {}),
        isViewer: assignment?.playerId === actor.playerId,
        occupied: assignment !== null,
        seatIndex: toAppSyncSeatIndex(seatIndex)
      };
    }),
    status: room.status,
    updatedAt: room.updatedAt,
    ...(viewerSeat !== null
      ? { viewerSeat: toAppSyncSeatIndex(viewerSeat) }
      : {})
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
    ...(event.actorSeat !== undefined
      ? { actorSeat: toAppSyncSeatIndex(event.actorSeat) }
      : {}),
    eventId: event.eventId,
    eventType: event.event.type,
    sequence: event.sequence
  };
}

export function toAppSyncSeatIndex(seat: SeatIndex): AppSyncSeatIndex {
  switch (seat) {
    case 0:
      return "SEAT_0";
    case 1:
      return "SEAT_1";
    case 2:
      return "SEAT_2";
    case 3:
      return "SEAT_3";
  }
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
    seatIndex: toAppSyncSeatIndex(viewerSeat),
    updatedAt: view.view.snapshot.generatedAt
  };
}

function classifyPendingActions(
  records: readonly MultiplayerActionIdempotencyRecord[],
  playerId: string,
  pendingActionIds: readonly string[]
): Pick<
  AppSyncReconnectView,
  "acceptedPendingActionIds" | "rejectedPendingActions" | "unknownPendingActionIds"
> {
  const recordsByActionId = new Map(records.map((record) => [record.actionId, record]));
  const acceptedPendingActionIds: string[] = [];
  const rejectedPendingActions: AppSyncPendingActionRejection[] = [];
  const unknownPendingActionIds: string[] = [];

  for (const actionId of pendingActionIds) {
    const record = recordsByActionId.get(actionId);

    if (!record || record.actorId !== playerId) {
      unknownPendingActionIds.push(actionId);
      continue;
    }

    if (record.accepted) {
      acceptedPendingActionIds.push(actionId);
      continue;
    }

    rejectedPendingActions.push({
      actionId,
      errorCode: record.errorCode ?? "INVALID_ACTION"
    });
  }

  return {
    acceptedPendingActionIds,
    rejectedPendingActions,
    unknownPendingActionIds
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
