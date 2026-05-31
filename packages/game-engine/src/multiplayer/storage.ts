import { type Domino } from "../dominoes/domino.ts";
import {
  EngineError,
  type EngineErrorCode
} from "../errors.ts";
import {
  type FortyTwoEvent,
  type FortyTwoEventEnvelope
} from "../forty-two/events.ts";
import {
  SEAT_INDICES,
  FORTY_TWO_TEAM_IDS,
  type FortyTwoTeamId,
  type SeatIndex
} from "../forty-two/seats.ts";
import {
  FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
  FORTY_TWO_STATE_SCHEMA_VERSION,
  type FortyTwoBiddingPhaseState,
  type FortyTwoDealtState,
  type FortyTwoSnapshotEnvelope,
  type FortyTwoState,
  type FortyTwoTrickPlayState,
  type FortyTwoTrumpPhaseState
} from "../forty-two/state.ts";
import {
  assertFortyTwoEventEnvelope,
  assertFortyTwoSnapshotEnvelope,
  replayValidatedFortyTwoEvents
} from "../forty-two/validation.ts";
import {
  createMultiplayerVisibleSnapshot,
  getMultiplayerPlayerView,
  type MultiplayerActionResultIndex,
  type MultiplayerGameSession,
  type MultiplayerPlayerView,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerSubmitActionResult,
  type MultiplayerVisibleFortyTwoState,
  type MultiplayerVisibleSnapshotEnvelope
} from "./session.ts";
import {
  parseMultiplayerClientSyncState,
  parseMultiplayerStoredGameRecords
} from "./schema.ts";

export interface MultiplayerRoomRecord {
  readonly createdAt: string;
  readonly gameId?: string;
  readonly hostPlayerId: string;
  readonly pk: `ROOM#${string}`;
  readonly publicRoomListKey?: "PUBLIC#OPEN";
  readonly room: MultiplayerRoom;
  readonly roomCode: string;
  readonly roomId: string;
  readonly sk: "META";
  readonly status: MultiplayerRoom["status"];
  readonly updatedAt: string;
  readonly visibility: MultiplayerRoom["visibility"];
}

export interface MultiplayerGameEventRecord<
  TEvent extends FortyTwoEvent = FortyTwoEvent
> {
  readonly actionId: string;
  readonly actorId: string;
  readonly actorSeat?: SeatIndex;
  readonly createdAt: string;
  readonly envelope: FortyTwoEventEnvelope<TEvent>;
  readonly eventId: string;
  readonly eventType: TEvent["type"];
  readonly gameId: string;
  readonly payload: TEvent["payload"];
  readonly pk: `GAME#${string}`;
  readonly sequence: number;
  readonly sk: `EVENT#${number}`;
}

export interface MultiplayerSnapshotRecord {
  readonly gameId: string;
  readonly lastCompletedHand?: MultiplayerCompletedHandSummary;
  readonly lastEventSequence: number;
  readonly payload: MultiplayerPublicSnapshotEnvelope;
  readonly pk: `GAME#${string}`;
  readonly sk: "SNAPSHOT#LATEST";
  readonly snapshotVersion: number;
  readonly updatedAt: string;
}

export type MultiplayerPublicSnapshotEnvelope = MultiplayerVisibleSnapshotEnvelope;

export interface MultiplayerTeamTotals {
  readonly teamA: number;
  readonly teamB: number;
}

export interface MultiplayerCompletedHandSummary {
  readonly awardedTeamId?: FortyTwoTeamId;
  readonly bidAmount: number;
  readonly biddingTeamId: FortyTwoTeamId;
  readonly biddingTeamPoints: number;
  readonly completedAt: string;
  readonly declarer: SeatIndex;
  readonly handNumber: number;
  readonly markAwards: MultiplayerTeamTotals;
  readonly outcome: "made" | "set";
  readonly teamPoints: MultiplayerTeamTotals;
  readonly teamTrickCounts: MultiplayerTeamTotals;
  readonly totalPoints: number;
}

export interface MultiplayerPrivateHandRecord {
  readonly gameId: string;
  readonly hand: readonly Domino[];
  readonly handNumber: number;
  readonly pk: `GAME#${string}`;
  readonly playerId: string;
  readonly seatIndex: SeatIndex;
  readonly sk: `PRIVATE_HAND#${SeatIndex}`;
  readonly updatedAt: string;
}

export interface MultiplayerActionIdempotencyRecord {
  readonly accepted: boolean;
  readonly actionId: string;
  readonly actorId: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly eventIds: readonly string[];
  readonly expiresAt?: number;
  readonly gameId: string;
  readonly pk: `ACTION#${string}`;
  readonly sk: "RESULT";
  readonly updatedAt: string;
}

export interface MultiplayerStoredGameRecords {
  readonly events: readonly MultiplayerGameEventRecord[];
  readonly idempotency: readonly MultiplayerActionIdempotencyRecord[];
  readonly privateHands: readonly MultiplayerPrivateHandRecord[];
  readonly room: MultiplayerRoomRecord;
  readonly snapshot: MultiplayerSnapshotRecord;
}

export interface CreateMultiplayerStorageRecordsOptions {
  readonly actionExpiresAt?: number;
}

export type MultiplayerSyncConnectionStatus =
  | "connected"
  | "reconnecting"
  | "offline";

export interface MultiplayerClientSyncState {
  readonly connectionStatus: MultiplayerSyncConnectionStatus;
  readonly gameId: string;
  readonly lastAppliedEventSequence: number;
  readonly pendingActionIds?: readonly string[];
  readonly snapshotVersion: number;
}

export interface MultiplayerPendingActionRejection {
  readonly actionId: string;
  readonly errorCode: string;
}

export interface MultiplayerReconnectView {
  readonly acceptedPendingActionIds: readonly string[];
  readonly rejectedPendingActions: readonly MultiplayerPendingActionRejection[];
  readonly requiresSnapshotRefresh: boolean;
  readonly serverLastEventSequence: number;
  readonly serverSnapshotVersion: number;
  readonly unknownPendingActionIds: readonly string[];
  readonly view: MultiplayerPlayerView;
}

type RestoredHandState =
  | FortyTwoDealtState
  | FortyTwoBiddingPhaseState
  | FortyTwoTrumpPhaseState
  | FortyTwoTrickPlayState;

type PublicHandState = Extract<
  MultiplayerVisibleFortyTwoState,
  { readonly handCounts: Readonly<Record<SeatIndex, number>> }
>;

export function createMultiplayerStorageRecords(
  session: MultiplayerGameSession,
  options: CreateMultiplayerStorageRecordsOptions = {}
): MultiplayerStoredGameRecords {
  return {
    events: session.events.map(createMultiplayerGameEventRecord),
    idempotency: createMultiplayerActionIdempotencyRecords(session, options),
    privateHands: createMultiplayerPrivateHandRecords(session),
    room: createMultiplayerRoomRecord(session.room),
    snapshot: createMultiplayerSnapshotRecord(session.snapshot, session.events)
  };
}

export function restoreMultiplayerSessionFromRecords(
  records: unknown
): MultiplayerResult<MultiplayerGameSession> {
  return runStorageResult(() => {
    const parsedRecords = parseMultiplayerStoredGameRecords(records);
    const events = sortEventRecords(parsedRecords.events).map((record) => record.envelope);
    const snapshot = restoreSnapshotFromRecords(
      parsedRecords.snapshot,
      parsedRecords.privateHands
    );
    const initialSnapshot = restoreInitialSnapshot(events);
    const replayedSnapshot = replayValidatedFortyTwoEvents(initialSnapshot, events);

    assertSnapshotsMatch(replayedSnapshot, snapshot);

    return {
      actionResults: restoreActionResults(parsedRecords.idempotency, events),
      events,
      initialSnapshot,
      room: parsedRecords.room.room,
      snapshot
    };
  });
}

export function getMultiplayerReconnectView(
  records: unknown,
  playerId: string,
  clientState: unknown
): MultiplayerResult<MultiplayerReconnectView> {
  return runStorageResult(() => {
    const parsedRecords = parseMultiplayerStoredGameRecords(records);
    const parsedClientState = parseMultiplayerClientSyncState(clientState);
    const restored = unwrapStorageResult(
      restoreMultiplayerSessionFromRecords(parsedRecords)
    );

    if (parsedClientState.gameId !== restored.snapshot.gameId) {
      throw new EngineError("GAME_NOT_FOUND", "Client sync state belongs to a different game.");
    }

    const view = unwrapStorageResult(
      getMultiplayerPlayerView(restored, playerId)
    );
    const pending = classifyPendingActions(
      parsedRecords.idempotency,
      playerId,
      parsedClientState.pendingActionIds ?? []
    );

    return {
      ...pending,
      requiresSnapshotRefresh:
        parsedClientState.lastAppliedEventSequence !== restored.snapshot.lastEventSequence ||
        parsedClientState.snapshotVersion !== restored.snapshot.snapshotVersion,
      serverLastEventSequence: restored.snapshot.lastEventSequence,
      serverSnapshotVersion: restored.snapshot.snapshotVersion,
      view
    };
  });
}

export function createMultiplayerRoomRecord(
  room: MultiplayerRoom
): MultiplayerRoomRecord {
  return {
    createdAt: room.createdAt,
    ...(room.gameId !== undefined ? { gameId: room.gameId } : {}),
    hostPlayerId: room.hostPlayerId,
    pk: `ROOM#${room.roomId}`,
    ...(isPublicOpenRoom(room) ? { publicRoomListKey: "PUBLIC#OPEN" as const } : {}),
    room,
    roomCode: room.roomCode,
    roomId: room.roomId,
    sk: "META",
    status: room.status,
    updatedAt: room.updatedAt,
    visibility: room.visibility
  };
}

function isPublicOpenRoom(room: MultiplayerRoom): boolean {
  return room.visibility === "public" &&
    (room.status === "waiting" || room.status === "ready");
}

export function createMultiplayerGameEventRecord(
  event: FortyTwoEventEnvelope
): MultiplayerGameEventRecord {
  return {
    actionId: event.actionId,
    actorId: event.actorId,
    ...(event.actorSeat !== undefined ? { actorSeat: event.actorSeat } : {}),
    createdAt: event.serverCreatedAt,
    envelope: event,
    eventId: event.eventId,
    eventType: event.event.type,
    gameId: event.gameId,
    payload: event.event.payload,
    pk: `GAME#${event.gameId}`,
    sequence: event.sequence,
    sk: `EVENT#${event.sequence}`
  };
}

export function createMultiplayerSnapshotRecord(
  snapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[] = []
): MultiplayerSnapshotRecord {
  const lastCompletedHand = createMultiplayerCompletedHandSummary(
    snapshot,
    events
  );

  return {
    gameId: snapshot.gameId,
    ...(lastCompletedHand ? { lastCompletedHand } : {}),
    lastEventSequence: snapshot.lastEventSequence,
    payload: createPublicSnapshot(snapshot),
    pk: `GAME#${snapshot.gameId}`,
    sk: "SNAPSHOT#LATEST",
    snapshotVersion: snapshot.snapshotVersion,
    updatedAt: snapshot.generatedAt
  };
}

export function createMultiplayerCompletedHandSummary(
  snapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[]
): MultiplayerCompletedHandSummary | undefined {
  if (!canExposeCompletedHandSummary(snapshot.snapshot.phase)) {
    return undefined;
  }

  const completedHandEvent = findLastCompletedHandEvent(events);

  if (!completedHandEvent) {
    return undefined;
  }

  const handScore = completedHandEvent.event.payload.handScore;
  const awardedTeamId = FORTY_TWO_TEAM_IDS.find(
    (teamId) => handScore.markAwards[teamId] > 0
  );

  return {
    ...(awardedTeamId ? { awardedTeamId } : {}),
    bidAmount: handScore.bidAmount,
    biddingTeamId: handScore.biddingTeamId,
    biddingTeamPoints: handScore.biddingTeamPoints,
    completedAt: completedHandEvent.serverCreatedAt,
    declarer: handScore.declarer,
    handNumber: snapshot.snapshot.phase === "setup"
      ? snapshot.snapshot.handNumber - 1
      : snapshot.snapshot.handNumber,
    markAwards: toMultiplayerTeamTotals(handScore.markAwards),
    outcome: handScore.outcome,
    teamPoints: toMultiplayerTeamTotals(handScore.teamPoints),
    teamTrickCounts: toMultiplayerTeamTotals(handScore.teamTrickCounts),
    totalPoints: handScore.totalPoints
  };
}

function createPublicSnapshot(
  snapshot: FortyTwoSnapshotEnvelope
): MultiplayerPublicSnapshotEnvelope {
  return createMultiplayerVisibleSnapshot(snapshot, null);
}

function canExposeCompletedHandSummary(phase: FortyTwoState["phase"]): boolean {
  return phase === "setup" || phase === "handComplete" || phase === "gameComplete";
}

function findLastCompletedHandEvent(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.event.type === "fortyTwo.hand.completed") {
      return event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.hand.completed" }
      >>;
    }
  }

  return undefined;
}

function toMultiplayerTeamTotals(
  totals: Readonly<Record<FortyTwoTeamId, number>>
): MultiplayerTeamTotals {
  return {
    teamA: totals.teamA,
    teamB: totals.teamB
  };
}

export function createMultiplayerPrivateHandRecords(
  session: MultiplayerGameSession
): readonly MultiplayerPrivateHandRecord[] {
  const state = session.snapshot.snapshot;

  if (!("hands" in state)) {
    return [];
  }

  return SEAT_INDICES.map((seat) => {
    const assignment = session.room.seats[seat];

    if (!assignment) {
      throw new EngineError(
        "INVALID_SEAT",
        "Cannot persist private hand without a seat assignment."
      );
    }

    return {
      gameId: session.snapshot.gameId,
      hand: state.hands[seat],
      handNumber: state.handNumber,
      pk: `GAME#${session.snapshot.gameId}`,
      playerId: assignment.playerId,
      seatIndex: seat,
      sk: `PRIVATE_HAND#${seat}`,
      updatedAt: session.snapshot.generatedAt
    };
  });
}

export function createMultiplayerActionIdempotencyRecords(
  session: MultiplayerGameSession,
  options: CreateMultiplayerStorageRecordsOptions
): readonly MultiplayerActionIdempotencyRecord[] {
  const records: MultiplayerActionIdempotencyRecord[] = [];

  for (const [actionId, result] of Object.entries(session.actionResults)) {
    if (!result) {
      continue;
    }

    if (result.ok) {
      const firstEvent = result.events[0];

      records.push({
        accepted: true,
        actionId,
        actorId: result.actorId,
        eventIds: result.events.map((event) => event.eventId),
        ...(options.actionExpiresAt !== undefined
          ? { expiresAt: options.actionExpiresAt }
          : {}),
        gameId: session.snapshot.gameId,
        pk: `ACTION#${actionId}`,
        sk: "RESULT",
        updatedAt: firstEvent?.serverCreatedAt ?? session.snapshot.generatedAt
      });
      continue;
    }

    records.push({
      accepted: false,
      actionId,
      actorId: result.actorId,
      errorCode: result.error.code,
      errorMessage: result.error.message,
      eventIds: [],
      ...(options.actionExpiresAt !== undefined
        ? { expiresAt: options.actionExpiresAt }
        : {}),
      gameId: session.snapshot.gameId,
      pk: `ACTION#${actionId}`,
      sk: "RESULT",
      updatedAt: session.snapshot.generatedAt
    });
  }

  return records;
}

export function createMultiplayerActionIdempotencyRecord(
  session: MultiplayerGameSession,
  actionId: string,
  options: CreateMultiplayerStorageRecordsOptions = {}
): MultiplayerActionIdempotencyRecord {
  const result = session.actionResults[actionId];

  if (!result) {
    throw new EngineError("GAME_NOT_FOUND", "Cannot persist missing action result.");
  }

  const record = createMultiplayerActionIdempotencyRecords(session, options)
    .find((idempotencyRecord) => idempotencyRecord.actionId === actionId);

  if (!record) {
    throw new EngineError("GAME_NOT_FOUND", "Cannot persist missing action result.");
  }

  return record;
}

function sortEventRecords(
  records: readonly MultiplayerGameEventRecord[]
): readonly MultiplayerGameEventRecord[] {
  return [...records].sort((left, right) => left.sequence - right.sequence);
}

function restoreSnapshotFromRecords(
  record: MultiplayerSnapshotRecord,
  privateHands: readonly MultiplayerPrivateHandRecord[]
): FortyTwoSnapshotEnvelope {
  const snapshot = {
    ...record.payload,
    snapshot: restoreStateFromRecords(record.payload.snapshot, privateHands)
  };

  assertFortyTwoSnapshotEnvelope(snapshot);

  if (
    record.gameId !== snapshot.gameId ||
    record.lastEventSequence !== snapshot.lastEventSequence ||
    record.snapshotVersion !== snapshot.snapshotVersion
  ) {
    throw new EngineError("INVALID_ACTION", "Snapshot record metadata does not match payload.");
  }

  return snapshot;
}

function restoreStateFromRecords(
  state: MultiplayerVisibleFortyTwoState,
  privateHands: readonly MultiplayerPrivateHandRecord[]
): FortyTwoState {
  if (isPublicHandState(state)) {
    const { handCounts: _handCounts, viewerHand: _viewerHand, ...publicState } = state;
    const restoredState = {
      ...publicState,
      hands: restoreHandsForState(state, privateHands)
    };

    return restoredState as RestoredHandState;
  }

  return state;
}

function isPublicHandState(
  state: MultiplayerVisibleFortyTwoState
): state is PublicHandState {
  return "handCounts" in state;
}

function restoreHandsForState(
  state: PublicHandState,
  privateHands: readonly MultiplayerPrivateHandRecord[]
): Readonly<Record<SeatIndex, readonly Domino[]>> {
  return {
    0: restoreHandForSeat(state, privateHands, 0),
    1: restoreHandForSeat(state, privateHands, 1),
    2: restoreHandForSeat(state, privateHands, 2),
    3: restoreHandForSeat(state, privateHands, 3)
  };
}

function restoreHandForSeat(
  state: PublicHandState,
  privateHands: readonly MultiplayerPrivateHandRecord[],
  seat: SeatIndex
): readonly Domino[] {
  const record = privateHands.find(
    (handRecord) =>
      handRecord.seatIndex === seat &&
      handRecord.handNumber === state.handNumber
  );

  if (!record) {
    throw new EngineError("GAME_NOT_FOUND", `Missing private hand for seat ${seat}.`);
  }

  if (record.hand.length !== state.handCounts[seat]) {
    throw new EngineError(
      "INVALID_ACTION",
      `Private hand count does not match public hand count for seat ${seat}.`
    );
  }

  return record.hand;
}

function restoreInitialSnapshot(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoSnapshotEnvelope {
  const firstEvent = events[0];

  for (const event of events) {
    assertFortyTwoEventEnvelope(event);
  }

  if (!firstEvent || firstEvent.event.type !== "fortyTwo.game.created") {
    throw new EngineError(
      "GAME_NOT_FOUND",
      "Cannot restore multiplayer session without a game-created event."
    );
  }

  const payload = firstEvent.event.payload;

  return {
    gameId: firstEvent.gameId,
    generatedAt: payload.createdAt,
    lastEventSequence: 0,
    schemaVersion: FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
    snapshot: {
      createdAt: payload.createdAt,
      dealer: payload.dealer,
      gameId: firstEvent.gameId,
      handNumber: payload.handNumber,
      marks: payload.marks,
      mode: payload.mode,
      phase: "setup",
      players: payload.players,
      rules: payload.rules,
      schemaVersion: FORTY_TWO_STATE_SCHEMA_VERSION,
      teams: payload.teams,
      updatedAt: payload.createdAt
    },
    snapshotVersion: 0
  };
}

function assertSnapshotsMatch(
  replayedSnapshot: FortyTwoSnapshotEnvelope,
  storedSnapshot: FortyTwoSnapshotEnvelope
): void {
  if (!deepEqual(replayedSnapshot, storedSnapshot)) {
    throw new EngineError(
      "INVALID_ACTION",
      "Stored multiplayer snapshot does not match validated event replay."
    );
  }
}

function restoreActionResults(
  records: readonly MultiplayerActionIdempotencyRecord[],
  events: readonly FortyTwoEventEnvelope[]
): MultiplayerActionResultIndex {
  const eventsById = new Map(events.map((event) => [event.eventId, event]));

  return records.reduce<MultiplayerActionResultIndex>((results, record) => {
    if (record.accepted) {
      return {
        ...results,
        [record.actionId]: {
          actorId: record.actorId,
          events: record.eventIds.map((eventId) => {
            const event = eventsById.get(eventId);

            if (!event) {
              throw new EngineError(
                "GAME_NOT_FOUND",
                `Missing event ${eventId} for idempotency result.`
              );
            }

            return event;
          }),
          ok: true
        }
      };
    }

    return {
      ...results,
      [record.actionId]: {
        actorId: record.actorId,
        error: new EngineError(
          toEngineErrorCode(record.errorCode),
          record.errorMessage ?? "Action was previously rejected."
        ),
        ok: false
      }
    };
  }, {});
}

function classifyPendingActions(
  records: readonly MultiplayerActionIdempotencyRecord[],
  playerId: string,
  pendingActionIds: readonly string[]
): Omit<
  MultiplayerReconnectView,
  "requiresSnapshotRefresh" | "serverLastEventSequence" | "serverSnapshotVersion" | "view"
> {
  const recordsByActionId = new Map(
    records.map((record) => [record.actionId, record])
  );
  const acceptedPendingActionIds: string[] = [];
  const rejectedPendingActions: MultiplayerPendingActionRejection[] = [];
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

function unwrapStorageResult<TValue>(result: MultiplayerResult<TValue>): TValue {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function runStorageResult<TValue>(
  run: () => TValue
): MultiplayerResult<TValue> {
  try {
    return {
      ok: true,
      value: run()
    };
  } catch (error) {
    if (error instanceof EngineError) {
      return {
        error,
        ok: false
      };
    }

    throw error;
  }
}

function toEngineErrorCode(value: string | undefined): EngineErrorCode {
  if (!value) {
    return "INVALID_ACTION";
  }

  return value as EngineErrorCode;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();

    if (!deepEqual(leftKeys, rightKeys)) {
      return false;
    }

    return leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]));
  }

  return false;
}
