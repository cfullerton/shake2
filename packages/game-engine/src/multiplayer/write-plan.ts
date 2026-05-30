import { EngineError } from "../errors.ts";
import {
  type FortyTwoEventEnvelope
} from "../forty-two/events.ts";
import {
  type FortyTwoSnapshotEnvelope
} from "../forty-two/state.ts";
import {
  replayValidatedFortyTwoEvents
} from "../forty-two/validation.ts";
import {
  type MultiplayerGameSession,
  type MultiplayerRoom,
  type MultiplayerSubmitActionResult
} from "./session.ts";
import {
  createMultiplayerActionIdempotencyRecord,
  createMultiplayerGameEventRecord,
  createMultiplayerPrivateHandRecords,
  createMultiplayerRoomRecord,
  createMultiplayerSnapshotRecord,
  type CreateMultiplayerStorageRecordsOptions,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerGameEventRecord,
  type MultiplayerPrivateHandRecord,
  type MultiplayerRoomRecord,
  type MultiplayerSnapshotRecord
} from "./storage.ts";

export type MultiplayerWritePlanKind =
  | "gameStart"
  | "acceptedAction"
  | "rejectedAction";

export type MultiplayerWriteCondition =
  | {
      readonly kind: "mustNotExist";
      readonly pk: string;
      readonly sk: string;
    }
  | {
      readonly expectedGameId: string | null;
      readonly expectedStatus: MultiplayerRoom["status"];
      readonly kind: "roomStateMatches";
      readonly pk: MultiplayerRoomRecord["pk"];
      readonly sk: MultiplayerRoomRecord["sk"];
    }
  | {
      readonly expectedLastEventSequence: number;
      readonly expectedSnapshotVersion: number;
      readonly gameId: string;
      readonly kind: "snapshotMatches";
    };

export type MultiplayerWriteOperation =
  | {
      readonly condition: MultiplayerWriteCondition;
      readonly kind: "putRoom";
      readonly record: MultiplayerRoomRecord;
    }
  | {
      readonly condition: MultiplayerWriteCondition;
      readonly kind: "putEvent";
      readonly record: MultiplayerGameEventRecord;
    }
  | {
      readonly condition: MultiplayerWriteCondition;
      readonly kind: "putSnapshot";
      readonly record: MultiplayerSnapshotRecord;
    }
  | {
      readonly condition: MultiplayerWriteCondition;
      readonly kind: "putPrivateHand";
      readonly record: MultiplayerPrivateHandRecord;
    }
  | {
      readonly condition: MultiplayerWriteCondition;
      readonly kind: "putActionResult";
      readonly record: MultiplayerActionIdempotencyRecord;
    };

export interface MultiplayerWritePlan {
  readonly gameId: string;
  readonly kind: MultiplayerWritePlanKind;
  readonly operations: readonly MultiplayerWriteOperation[];
}

export function createMultiplayerGameStartWritePlan(
  readyRoom: MultiplayerRoom,
  session: MultiplayerGameSession
): MultiplayerWritePlan {
  assertGameStartSession(readyRoom, session);
  assertValidatedReplay(
    session.initialSnapshot,
    session.events,
    session.snapshot
  );

  const roomRecord = createMultiplayerRoomRecord(session.room);
  const eventOperations = session.events.map(createEventWriteOperation);
  const snapshotRecord = createMultiplayerSnapshotRecord(session.snapshot);
  const privateHandOperations = createMultiplayerPrivateHandRecords(session)
    .map((record) => createPutOperation(
      "putPrivateHand",
      record,
      createMustNotExistCondition(record.pk, record.sk)
    ));

  return {
    gameId: session.snapshot.gameId,
    kind: "gameStart",
    operations: [
      createPutOperation(
        "putRoom",
        roomRecord,
        createRoomStateMatchesCondition(readyRoom)
      ),
      ...eventOperations,
      createPutOperation(
        "putSnapshot",
        snapshotRecord,
        createMustNotExistCondition(snapshotRecord.pk, snapshotRecord.sk)
      ),
      ...privateHandOperations
    ]
  };
}

export function createMultiplayerAcceptedActionWritePlan(
  previousSession: MultiplayerGameSession,
  result: Extract<MultiplayerSubmitActionResult, { readonly ok: true }>,
  options: CreateMultiplayerStorageRecordsOptions = {}
): MultiplayerWritePlan {
  if (result.duplicate) {
    throw new EngineError("DUPLICATE_ACTION", "Duplicate actions do not need a write plan.");
  }

  assertSessionLineage(previousSession, result.session);
  assertValidatedReplay(previousSession.snapshot, result.events, result.snapshot);
  assertSnapshotsMatch(result.snapshot, result.session.snapshot);

  const actionId = getSingleNewActionResultId(
    previousSession,
    result.session,
    true
  );
  const snapshotCondition = createSnapshotMatchesCondition(previousSession.snapshot);
  const snapshotRecord = createMultiplayerSnapshotRecord(result.session.snapshot);

  return {
    gameId: result.session.snapshot.gameId,
    kind: "acceptedAction",
    operations: [
      ...createRoomOperations(previousSession.room, result.session.room),
      ...result.events.map(createEventWriteOperation),
      createPutOperation(
        "putSnapshot",
        snapshotRecord,
        snapshotCondition
      ),
      ...createMultiplayerPrivateHandRecords(result.session).map((record) =>
        createPutOperation("putPrivateHand", record, snapshotCondition)
      ),
      createPutOperation(
        "putActionResult",
        createMultiplayerActionIdempotencyRecord(
          result.session,
          actionId,
          options
        ),
        createMustNotExistCondition(`ACTION#${actionId}`, "RESULT")
      )
    ]
  };
}

export function createMultiplayerRejectedActionWritePlan(
  previousSession: MultiplayerGameSession,
  result: Extract<MultiplayerSubmitActionResult, { readonly ok: false }>,
  options: CreateMultiplayerStorageRecordsOptions = {}
): MultiplayerWritePlan {
  if (result.duplicate) {
    throw new EngineError("DUPLICATE_ACTION", "Duplicate actions do not need a write plan.");
  }

  assertSessionLineage(previousSession, result.session);

  const actionId = getSingleNewActionResultId(
    previousSession,
    result.session,
    false
  );

  return {
    gameId: result.session.snapshot.gameId,
    kind: "rejectedAction",
    operations: [
      createPutOperation(
        "putActionResult",
        createMultiplayerActionIdempotencyRecord(
          result.session,
          actionId,
          options
        ),
        createMustNotExistCondition(`ACTION#${actionId}`, "RESULT")
      )
    ]
  };
}

function createRoomOperations(
  previousRoom: MultiplayerRoom,
  nextRoom: MultiplayerRoom
): readonly MultiplayerWriteOperation[] {
  if (deepEqual(previousRoom, nextRoom)) {
    return [];
  }

  return [
    createPutOperation(
      "putRoom",
      createMultiplayerRoomRecord(nextRoom),
      createRoomStateMatchesCondition(previousRoom)
    )
  ];
}

function createEventWriteOperation(
  event: FortyTwoEventEnvelope
): MultiplayerWriteOperation {
  const record = createMultiplayerGameEventRecord(event);

  return createPutOperation(
    "putEvent",
    record,
    createMustNotExistCondition(record.pk, record.sk)
  );
}

function createPutOperation(
  kind: "putRoom",
  record: MultiplayerRoomRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation;
function createPutOperation(
  kind: "putEvent",
  record: MultiplayerGameEventRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation;
function createPutOperation(
  kind: "putSnapshot",
  record: MultiplayerSnapshotRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation;
function createPutOperation(
  kind: "putPrivateHand",
  record: MultiplayerPrivateHandRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation;
function createPutOperation(
  kind: "putActionResult",
  record: MultiplayerActionIdempotencyRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation;
function createPutOperation(
  kind: MultiplayerWriteOperation["kind"],
  record:
    | MultiplayerRoomRecord
    | MultiplayerGameEventRecord
    | MultiplayerSnapshotRecord
    | MultiplayerPrivateHandRecord
    | MultiplayerActionIdempotencyRecord,
  condition: MultiplayerWriteCondition
): MultiplayerWriteOperation {
  return {
    condition,
    kind,
    record
  } as MultiplayerWriteOperation;
}

function createMustNotExistCondition(
  pk: string,
  sk: string
): MultiplayerWriteCondition {
  return {
    kind: "mustNotExist",
    pk,
    sk
  };
}

function createRoomStateMatchesCondition(
  room: MultiplayerRoom
): MultiplayerWriteCondition {
  return {
    expectedGameId: room.gameId ?? null,
    expectedStatus: room.status,
    kind: "roomStateMatches",
    pk: `ROOM#${room.roomId}`,
    sk: "META"
  };
}

function createSnapshotMatchesCondition(
  snapshot: FortyTwoSnapshotEnvelope
): MultiplayerWriteCondition {
  return {
    expectedLastEventSequence: snapshot.lastEventSequence,
    expectedSnapshotVersion: snapshot.snapshotVersion,
    gameId: snapshot.gameId,
    kind: "snapshotMatches"
  };
}

function assertGameStartSession(
  readyRoom: MultiplayerRoom,
  session: MultiplayerGameSession
): void {
  if (readyRoom.status !== "ready") {
    throw new EngineError("INVALID_PHASE", "Game-start writes require a ready room.");
  }

  if (
    readyRoom.roomId !== session.room.roomId ||
    session.room.status !== "inGame" ||
    session.room.gameId !== session.snapshot.gameId
  ) {
    throw new EngineError("INVALID_ACTION", "Game-start session does not match ready room.");
  }
}

function assertSessionLineage(
  previousSession: MultiplayerGameSession,
  nextSession: MultiplayerGameSession
): void {
  if (previousSession.snapshot.gameId !== nextSession.snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Write plan sessions belong to different games.");
  }

  if (nextSession.events.length < previousSession.events.length) {
    throw new EngineError("INVALID_ACTION", "Write plan cannot remove events.");
  }

  previousSession.events.forEach((event, index) => {
    if (!deepEqual(event, nextSession.events[index])) {
      throw new EngineError("INVALID_ACTION", "Write plan sessions do not share event history.");
    }
  });
}

function assertValidatedReplay(
  snapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[],
  expectedSnapshot: FortyTwoSnapshotEnvelope
): void {
  const replayedSnapshot = replayValidatedFortyTwoEvents(snapshot, events);
  assertSnapshotsMatch(replayedSnapshot, expectedSnapshot);
}

function assertSnapshotsMatch(
  actual: FortyTwoSnapshotEnvelope,
  expected: FortyTwoSnapshotEnvelope
): void {
  if (!deepEqual(actual, expected)) {
    throw new EngineError(
      "INVALID_ACTION",
      "Write plan snapshot does not match validated event replay."
    );
  }
}

function getSingleNewActionResultId(
  previousSession: MultiplayerGameSession,
  nextSession: MultiplayerGameSession,
  expectedAccepted: boolean
): string {
  const newActionIds = Object.keys(nextSession.actionResults).filter(
    (actionId) => previousSession.actionResults[actionId] === undefined
  );

  if (newActionIds.length !== 1) {
    throw new EngineError(
      "INVALID_ACTION",
      "Write plan requires exactly one new action result."
    );
  }

  const actionId = newActionIds[0];

  if (!actionId) {
    throw new EngineError("INVALID_ACTION", "Write plan action ID is missing.");
  }

  const result = nextSession.actionResults[actionId];

  if (!result || result.ok !== expectedAccepted) {
    throw new EngineError(
      "INVALID_ACTION",
      "Write plan action result has the wrong acceptance state."
    );
  }

  return actionId;
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
