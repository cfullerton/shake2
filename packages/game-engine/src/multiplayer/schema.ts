import {
  isPip,
  type Domino
} from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  type CallFortyTwoTrumpActionPayload,
  type CompleteFortyTwoGameActionPayload,
  type CompleteFortyTwoHandActionPayload,
  type CompleteFortyTwoTrickActionPayload,
  type CreateFortyTwoGameActionPayload,
  type DealFortyTwoHandActionPayload,
  type FortyTwoAction,
  type FortyTwoActionEnvelope,
  type PlayFortyTwoDominoActionPayload,
  type SubmitFortyTwoBidActionPayload
} from "../forty-two/actions.ts";
import {
  type BidCall
} from "../forty-two/bidding.ts";
import {
  type FortyTwoEventEnvelope
} from "../forty-two/events.ts";
import {
  FORTY_TWO_RULE_SCHEMA_VERSION,
  type FortyTwoAllPassBehavior,
  type FortyTwoScoringMode,
  type RuleConfig
} from "../forty-two/rules-config.ts";
import {
  FORTY_TWO_TEAM_IDS,
  SEAT_INDICES,
  isSeatIndex,
  type FortyTwoTeamId,
  type SeatIndex
} from "../forty-two/seats.ts";
import {
  FORTY_TWO_PHASES,
  FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
  FORTY_TWO_STATE_SCHEMA_VERSION,
  type FortyTwoGameMode
} from "../forty-two/state.ts";
import {
  type DominoSuit
} from "../forty-two/tricks.ts";
import {
  isTrumpSuit,
  type TrumpSuit
} from "../forty-two/trump.ts";
import {
  assertFortyTwoEventEnvelope
} from "../forty-two/validation.ts";
import {
  type MultiplayerClientSyncState,
  type MultiplayerGameEventRecord,
  type MultiplayerPrivateHandRecord,
  type MultiplayerPublicSnapshotEnvelope,
  type MultiplayerSnapshotRecord,
  type MultiplayerSyncConnectionStatus,
  type MultiplayerStoredGameRecords,
  type MultiplayerActionIdempotencyRecord,
  type MultiplayerRoomRecord
} from "./storage.ts";
import {
  type MultiplayerConnectionStatus,
  type MultiplayerParticipant,
  type MultiplayerParticipants,
  type MultiplayerRoom,
  type MultiplayerRoomStatus,
  type MultiplayerRoomVisibility,
  type MultiplayerSeatAssignment,
  type MultiplayerSeats,
  type MultiplayerVisibleFortyTwoState
} from "./session.ts";

const MULTIPLAYER_ROOM_STATUSES = [
  "waiting",
  "ready",
  "inGame",
  "completed"
] as const satisfies readonly MultiplayerRoomStatus[];

const MULTIPLAYER_ROOM_VISIBILITIES = [
  "private",
  "public"
] as const satisfies readonly MultiplayerRoomVisibility[];

const MULTIPLAYER_CONNECTION_STATUSES = [
  "online",
  "backgrounded",
  "disconnected"
] as const satisfies readonly MultiplayerConnectionStatus[];

const MULTIPLAYER_SYNC_CONNECTION_STATUSES = [
  "connected",
  "reconnecting",
  "offline"
] as const satisfies readonly MultiplayerSyncConnectionStatus[];

const FORTY_TWO_GAME_MODES = [
  "localPractice",
  "multiplayer"
] as const satisfies readonly FortyTwoGameMode[];

const FORTY_TWO_SCORING_MODES = [
  "marks"
] as const satisfies readonly FortyTwoScoringMode[];

const FORTY_TWO_ALL_PASS_BEHAVIORS = [
  "dealerForcedBid",
  "redeal"
] as const satisfies readonly FortyTwoAllPassBehavior[];

export function parseFortyTwoActionEnvelope(
  value: unknown
): FortyTwoActionEnvelope {
  const envelope = parseRecord(value, "Forty Two action envelope");
  assertSchemaVersion(
    envelope.schemaVersion,
    FORTY_TWO_ACTION_SCHEMA_VERSION,
    "Forty Two action"
  );

  return {
    action: parseFortyTwoAction(envelope.action),
    actionId: parseNonEmptyString(envelope.actionId, "action.actionId"),
    actorId: parseNonEmptyString(envelope.actorId, "action.actorId"),
    ...(envelope.actorSeat !== undefined
      ? { actorSeat: parseSeatIndex(envelope.actorSeat, "action.actorSeat") }
      : {}),
    clientCreatedAt: parseTimestamp(
      envelope.clientCreatedAt,
      "action.clientCreatedAt"
    ),
    gameId: parseNonEmptyString(envelope.gameId, "action.gameId"),
    ...(envelope.knownLastEventSequence !== undefined
      ? {
          knownLastEventSequence: parseNonNegativeInteger(
            envelope.knownLastEventSequence,
            "action.knownLastEventSequence"
          )
        }
      : {}),
    ...(envelope.knownSnapshotVersion !== undefined
      ? {
          knownSnapshotVersion: parseNonNegativeInteger(
            envelope.knownSnapshotVersion,
            "action.knownSnapshotVersion"
          )
        }
      : {}),
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  };
}

export function parseMultiplayerStoredGameRecords(
  value: unknown
): MultiplayerStoredGameRecords {
  const records = parseRecord(value, "multiplayer stored game records");
  const room = parseMultiplayerRoomRecord(records.room);
  const snapshot = parseMultiplayerSnapshotRecord(records.snapshot);
  const events = parseArray(
    records.events,
    "records.events",
    parseMultiplayerGameEventRecord
  );
  const privateHands = parseArray(
    records.privateHands,
    "records.privateHands",
    parseMultiplayerPrivateHandRecord
  );
  const idempotency = parseArray(
    records.idempotency,
    "records.idempotency",
    parseMultiplayerActionIdempotencyRecord
  );

  if (room.gameId !== undefined && room.gameId !== snapshot.gameId) {
    throw new EngineError(
      "GAME_NOT_FOUND",
      "Room record belongs to a different game than the snapshot."
    );
  }

  assertRecordsBelongToGame(snapshot.gameId, events, privateHands, idempotency);

  return {
    events,
    idempotency,
    privateHands,
    room,
    snapshot
  };
}

export function parseMultiplayerRoomRecord(
  value: unknown
): MultiplayerRoomRecord {
  const record = parseRecord(value, "room record");
  const room = parseMultiplayerRoom(record.room);
  const createdAt = parseTimestamp(record.createdAt, "roomRecord.createdAt");
  const hostPlayerId = parseNonEmptyString(
    record.hostPlayerId,
    "roomRecord.hostPlayerId"
  );
  const roomCode = parseNonEmptyString(record.roomCode, "roomRecord.roomCode");
  const roomId = parseNonEmptyString(record.roomId, "roomRecord.roomId");
  const updatedAt = parseTimestamp(record.updatedAt, "roomRecord.updatedAt");
  const status = parseRoomStatus(record.status, "roomRecord.status");
  const visibility = parseRoomVisibility(
    record.visibility ?? room.visibility,
    "roomRecord.visibility"
  );
  const pk = parseNonEmptyString(record.pk, "roomRecord.pk");
  const sk = parseNonEmptyString(record.sk, "roomRecord.sk");

  if (pk !== `ROOM#${roomId}` || sk !== "META") {
    throw new EngineError("INVALID_ACTION", "Room record key is invalid.");
  }

  if (
    room.roomId !== roomId ||
    room.roomCode !== roomCode ||
    room.hostPlayerId !== hostPlayerId ||
    room.status !== status ||
    room.visibility !== visibility ||
    room.createdAt !== createdAt ||
    room.updatedAt !== updatedAt
  ) {
    throw new EngineError(
      "INVALID_ACTION",
      "Room record metadata does not match room payload."
    );
  }

  if (
    record.gameId !== undefined &&
    parseNonEmptyString(record.gameId, "roomRecord.gameId") !== room.gameId
  ) {
    throw new EngineError(
      "GAME_NOT_FOUND",
      "Room record game ID does not match room payload."
    );
  }

  return {
    createdAt,
    ...(room.gameId !== undefined ? { gameId: room.gameId } : {}),
    hostPlayerId,
    pk: `ROOM#${roomId}`,
    ...(record.publicRoomListKey === "PUBLIC#OPEN"
      ? { publicRoomListKey: "PUBLIC#OPEN" as const }
      : {}),
    room,
    roomCode,
    roomId,
    sk: "META",
    status,
    updatedAt,
    visibility
  };
}

export function parseMultiplayerGameEventRecord(
  value: unknown
): MultiplayerGameEventRecord {
  const record = parseRecord(value, "game event record");
  const envelopeValue = record.envelope;

  assertFortyTwoEventEnvelope(envelopeValue);

  const envelope = envelopeValue as FortyTwoEventEnvelope;
  const pk = parseNonEmptyString(record.pk, "eventRecord.pk");
  const sk = parseNonEmptyString(record.sk, "eventRecord.sk");
  const actionId = parseNonEmptyString(record.actionId, "eventRecord.actionId");
  const actorId = parseNonEmptyString(record.actorId, "eventRecord.actorId");
  const createdAt = parseTimestamp(record.createdAt, "eventRecord.createdAt");
  const eventId = parseNonEmptyString(record.eventId, "eventRecord.eventId");
  const eventType = parseNonEmptyString(record.eventType, "eventRecord.eventType");
  const gameId = parseNonEmptyString(record.gameId, "eventRecord.gameId");
  const sequence = parseNonNegativeInteger(record.sequence, "eventRecord.sequence");

  if (
    pk !== `GAME#${gameId}` ||
    sk !== `EVENT#${sequence}` ||
    actionId !== envelope.actionId ||
    actorId !== envelope.actorId ||
    createdAt !== envelope.serverCreatedAt ||
    eventId !== envelope.eventId ||
    eventType !== envelope.event.type ||
    gameId !== envelope.gameId ||
    sequence !== envelope.sequence
  ) {
    throw new EngineError(
      "INVALID_ACTION",
      "Event record metadata does not match event envelope."
    );
  }

  if (record.actorSeat !== undefined) {
    const actorSeat = parseSeatIndex(record.actorSeat, "eventRecord.actorSeat");

    if (actorSeat !== envelope.actorSeat) {
      throw new EngineError(
        "INVALID_ACTOR",
        "Event record actor seat does not match event envelope."
      );
    }
  }

  if (!deepEqual(record.payload, envelope.event.payload)) {
    throw new EngineError(
      "INVALID_ACTION",
      "Event record payload does not match event envelope."
    );
  }

  return {
    actionId,
    actorId,
    ...(envelope.actorSeat !== undefined ? { actorSeat: envelope.actorSeat } : {}),
    createdAt,
    envelope,
    eventId,
    eventType: envelope.event.type,
    gameId,
    payload: envelope.event.payload,
    pk: `GAME#${gameId}`,
    sequence,
    sk: `EVENT#${sequence}`
  };
}

export function parseMultiplayerSnapshotRecord(
  value: unknown
): MultiplayerSnapshotRecord {
  const record = parseRecord(value, "snapshot record");
  const payload = parseMultiplayerPublicSnapshotEnvelope(record.payload);
  const gameId = parseNonEmptyString(record.gameId, "snapshotRecord.gameId");
  const lastEventSequence = parseNonNegativeInteger(
    record.lastEventSequence,
    "snapshotRecord.lastEventSequence"
  );
  const snapshotVersion = parseNonNegativeInteger(
    record.snapshotVersion,
    "snapshotRecord.snapshotVersion"
  );
  const updatedAt = parseTimestamp(record.updatedAt, "snapshotRecord.updatedAt");
  const pk = parseNonEmptyString(record.pk, "snapshotRecord.pk");
  const sk = parseNonEmptyString(record.sk, "snapshotRecord.sk");

  if (
    pk !== `GAME#${gameId}` ||
    sk !== "SNAPSHOT#LATEST" ||
    payload.gameId !== gameId ||
    payload.lastEventSequence !== lastEventSequence ||
    payload.snapshotVersion !== snapshotVersion ||
    payload.generatedAt !== updatedAt
  ) {
    throw new EngineError(
      "INVALID_ACTION",
      "Snapshot record metadata does not match payload."
    );
  }

  return {
    gameId,
    lastEventSequence,
    payload,
    pk: `GAME#${gameId}`,
    sk: "SNAPSHOT#LATEST",
    snapshotVersion,
    updatedAt
  };
}

export function parseMultiplayerPrivateHandRecord(
  value: unknown
): MultiplayerPrivateHandRecord {
  const record = parseRecord(value, "private hand record");
  const gameId = parseNonEmptyString(record.gameId, "privateHand.gameId");
  const seatIndex = parseSeatIndex(record.seatIndex, "privateHand.seatIndex");
  const hand = parseDominoArray(record.hand, "privateHand.hand");
  const handNumber = parsePositiveInteger(record.handNumber, "privateHand.handNumber");
  const playerId = parseNonEmptyString(record.playerId, "privateHand.playerId");
  const updatedAt = parseTimestamp(record.updatedAt, "privateHand.updatedAt");
  const pk = parseNonEmptyString(record.pk, "privateHand.pk");
  const sk = parseNonEmptyString(record.sk, "privateHand.sk");

  if (pk !== `GAME#${gameId}` || sk !== `PRIVATE_HAND#${seatIndex}`) {
    throw new EngineError("INVALID_ACTION", "Private hand record key is invalid.");
  }

  return {
    gameId,
    hand,
    handNumber,
    pk: `GAME#${gameId}`,
    playerId,
    seatIndex,
    sk: `PRIVATE_HAND#${seatIndex}`,
    updatedAt
  };
}

export function parseMultiplayerActionIdempotencyRecord(
  value: unknown
): MultiplayerActionIdempotencyRecord {
  const record = parseRecord(value, "action idempotency record");
  const accepted = parseBoolean(record.accepted, "actionResult.accepted");
  const actionId = parseNonEmptyString(record.actionId, "actionResult.actionId");
  const actorId = parseNonEmptyString(record.actorId, "actionResult.actorId");
  const eventIds = parseArray(
    record.eventIds,
    "actionResult.eventIds",
    (eventId, label) => parseNonEmptyString(eventId, label)
  );
  const gameId = parseNonEmptyString(record.gameId, "actionResult.gameId");
  const pk = parseNonEmptyString(record.pk, "actionResult.pk");
  const sk = parseNonEmptyString(record.sk, "actionResult.sk");
  const updatedAt = parseTimestamp(record.updatedAt, "actionResult.updatedAt");

  if (pk !== `ACTION#${actionId}` || sk !== "RESULT") {
    throw new EngineError("INVALID_ACTION", "Action result record key is invalid.");
  }

  if (accepted && eventIds.length === 0) {
    throw new EngineError(
      "INVALID_ACTION",
      "Accepted action result must reference at least one event."
    );
  }

  if (!accepted && record.errorCode === undefined) {
    throw new EngineError(
      "INVALID_ACTION",
      "Rejected action result must include an error code."
    );
  }

  return {
    accepted,
    actionId,
    actorId,
    ...(record.errorCode !== undefined
      ? { errorCode: parseNonEmptyString(record.errorCode, "actionResult.errorCode") }
      : {}),
    ...(record.errorMessage !== undefined
      ? {
          errorMessage: parseNonEmptyString(
            record.errorMessage,
            "actionResult.errorMessage"
          )
        }
      : {}),
    eventIds,
    ...(record.expiresAt !== undefined
      ? { expiresAt: parseNonNegativeInteger(record.expiresAt, "actionResult.expiresAt") }
      : {}),
    gameId,
    pk: `ACTION#${actionId}`,
    sk: "RESULT",
    updatedAt
  };
}

export function parseMultiplayerClientSyncState(
  value: unknown
): MultiplayerClientSyncState {
  const state = parseRecord(value, "client sync state");
  const pendingActionIds = state.pendingActionIds === undefined
    ? undefined
    : parseArray(
        state.pendingActionIds,
        "clientSync.pendingActionIds",
        (actionId, label) => parseNonEmptyString(actionId, label)
      );

  return {
    connectionStatus: parseSyncConnectionStatus(
      state.connectionStatus,
      "clientSync.connectionStatus"
    ),
    gameId: parseNonEmptyString(state.gameId, "clientSync.gameId"),
    lastAppliedEventSequence: parseNonNegativeInteger(
      state.lastAppliedEventSequence,
      "clientSync.lastAppliedEventSequence"
    ),
    ...(pendingActionIds !== undefined ? { pendingActionIds } : {}),
    snapshotVersion: parseNonNegativeInteger(
      state.snapshotVersion,
      "clientSync.snapshotVersion"
    )
  };
}

function parseFortyTwoAction(value: unknown): FortyTwoAction {
  const action = parseRecord(value, "action.action");
  const type = parseNonEmptyString(action.type, "action.action.type");

  switch (type) {
    case "fortyTwo.game.create":
      return {
        payload: parseCreateGamePayload(action.payload),
        type
      };
    case "fortyTwo.hand.deal":
      return {
        payload: parseDealHandPayload(action.payload),
        type
      };
    case "fortyTwo.bid.submit":
      return {
        payload: parseSubmitBidPayload(action.payload),
        type
      };
    case "fortyTwo.bidding.complete":
      parseRecord(action.payload, "action.payload");
      return {
        payload: {},
        type
      };
    case "fortyTwo.trump.call":
      return {
        payload: parseCallTrumpPayload(action.payload),
        type
      };
    case "fortyTwo.domino.play":
      return {
        payload: parsePlayDominoPayload(action.payload),
        type
      };
    case "fortyTwo.trick.complete":
      return {
        payload: parseCompleteTrickPayload(action.payload),
        type
      };
    case "fortyTwo.hand.complete":
      return {
        payload: parseCompleteHandPayload(action.payload),
        type
      };
    case "fortyTwo.game.complete":
      return {
        payload: parseCompleteGamePayload(action.payload),
        type
      };
    default:
      throw new EngineError("INVALID_ACTION", `Unsupported action type: ${type}.`);
  }
}

function parseCreateGamePayload(
  value: unknown
): CreateFortyTwoGameActionPayload {
  const payload = parseRecord(value, "createGame.payload");

  return {
    dealer: parseSeatIndex(payload.dealer, "createGame.dealer"),
    ...(payload.mode !== undefined
      ? { mode: parseGameMode(payload.mode, "createGame.mode") }
      : {}),
    ...(payload.playerNames !== undefined
      ? {
          playerNames: parsePartialSeatNames(
            payload.playerNames,
            "createGame.playerNames"
          )
        }
      : {}),
    ...(payload.rules !== undefined
      ? { rules: parseRuleConfig(payload.rules) }
      : {}),
    ...(payload.teamNames !== undefined
      ? {
          teamNames: parsePartialTeamNames(
            payload.teamNames,
            "createGame.teamNames"
          )
        }
      : {})
  };
}

function parseDealHandPayload(value: unknown): DealFortyTwoHandActionPayload {
  const payload = parseRecord(value, "dealHand.payload");

  return {
    dealer: parseSeatIndex(payload.dealer, "dealHand.dealer"),
    handNumber: parsePositiveInteger(payload.handNumber, "dealHand.handNumber")
  };
}

function parseSubmitBidPayload(
  value: unknown
): SubmitFortyTwoBidActionPayload {
  const payload = parseRecord(value, "submitBid.payload");

  return {
    bid: parseBidCall(payload.bid),
    seat: parseSeatIndex(payload.seat, "submitBid.seat")
  };
}

function parseCallTrumpPayload(
  value: unknown
): CallFortyTwoTrumpActionPayload {
  const payload = parseRecord(value, "callTrump.payload");

  return {
    trumpSuit: parseTrumpSuit(payload.trumpSuit, "callTrump.trumpSuit")
  };
}

function parsePlayDominoPayload(
  value: unknown
): PlayFortyTwoDominoActionPayload {
  const payload = parseRecord(value, "playDomino.payload");

  return {
    domino: parseDomino(payload.domino, "playDomino.domino"),
    ...(payload.ledSuit !== undefined
      ? { ledSuit: parseDominoSuit(payload.ledSuit, "playDomino.ledSuit") }
      : {}),
    seat: parseSeatIndex(payload.seat, "playDomino.seat")
  };
}

function parseCompleteTrickPayload(
  value: unknown
): CompleteFortyTwoTrickActionPayload {
  const payload = parseRecord(value, "completeTrick.payload");

  return {
    trickIndex: parseNonNegativeInteger(
      payload.trickIndex,
      "completeTrick.trickIndex"
    )
  };
}

function parseCompleteHandPayload(
  value: unknown
): CompleteFortyTwoHandActionPayload {
  const payload = parseRecord(value, "completeHand.payload");

  return {
    handNumber: parsePositiveInteger(payload.handNumber, "completeHand.handNumber")
  };
}

function parseCompleteGamePayload(
  value: unknown
): CompleteFortyTwoGameActionPayload {
  const payload = parseRecord(value, "completeGame.payload");

  return {
    winningTeamId: parseTeamId(payload.winningTeamId, "completeGame.winningTeamId")
  };
}

function parseBidCall(value: unknown): BidCall {
  const bid = parseRecord(value, "bid");

  if (bid.kind === "pass") {
    return {
      kind: "pass"
    };
  }

  if (bid.kind === "numeric") {
    return {
      amount: parseInteger(bid.amount, "bid.amount"),
      kind: "numeric"
    };
  }

  throw new EngineError("INVALID_BID", "Bid kind must be pass or numeric.");
}

function parseMultiplayerRoom(value: unknown): MultiplayerRoom {
  const room = parseRecord(value, "room");
  const participants = parseParticipants(room.participants, "room.participants");
  const seats = parseSeats(room.seats, "room.seats");
  const hostPlayerId = parseNonEmptyString(room.hostPlayerId, "room.hostPlayerId");

  if (!participants[hostPlayerId]) {
    throw new EngineError("INVALID_ACTOR", "Room host must be a participant.");
  }

  assertSeatAssignmentsHaveParticipants(seats, participants);

  return {
    createdAt: parseTimestamp(room.createdAt, "room.createdAt"),
    ...(room.gameId !== undefined
      ? { gameId: parseNonEmptyString(room.gameId, "room.gameId") }
      : {}),
    hostPlayerId,
    participants,
    roomCode: parseNonEmptyString(room.roomCode, "room.roomCode"),
    roomId: parseNonEmptyString(room.roomId, "room.roomId"),
    seats,
    status: parseRoomStatus(room.status, "room.status"),
    updatedAt: parseTimestamp(room.updatedAt, "room.updatedAt"),
    visibility: parseRoomVisibility(
      room.visibility ?? "private",
      "room.visibility"
    )
  };
}

function parseMultiplayerPublicSnapshotEnvelope(
  value: unknown
): MultiplayerPublicSnapshotEnvelope {
  const envelope = parseRecord(value, "public snapshot envelope");
  assertSchemaVersion(
    envelope.schemaVersion,
    FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
    "Forty Two snapshot"
  );

  const gameId = parseNonEmptyString(envelope.gameId, "snapshot.gameId");
  const snapshot = parseVisibleState(envelope.snapshot, "snapshot.snapshot");

  if (snapshot.gameId !== gameId) {
    throw new EngineError(
      "GAME_NOT_FOUND",
      "Snapshot state belongs to a different game."
    );
  }

  return {
    gameId,
    generatedAt: parseTimestamp(envelope.generatedAt, "snapshot.generatedAt"),
    lastEventSequence: parseNonNegativeInteger(
      envelope.lastEventSequence,
      "snapshot.lastEventSequence"
    ),
    schemaVersion: FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
    snapshot,
    snapshotVersion: parseNonNegativeInteger(
      envelope.snapshotVersion,
      "snapshot.snapshotVersion"
    )
  };
}

function parseVisibleState(
  value: unknown,
  label: string
): MultiplayerVisibleFortyTwoState {
  const state = parseRecord(value, label);
  assertSchemaVersion(
    state.schemaVersion,
    FORTY_TWO_STATE_SCHEMA_VERSION,
    "Forty Two state"
  );

  if ("hands" in state) {
    throw new EngineError(
      "INVALID_ACTION",
      "Public multiplayer snapshots must not include private hands."
    );
  }

  if ("viewerHand" in state) {
    throw new EngineError(
      "INVALID_ACTION",
      "Stored public snapshots must not include a viewer hand."
    );
  }

  const phase = parseFortyTwoPhase(state.phase, `${label}.phase`);
  const hasPublicHands = "handCounts" in state;

  if (isHandHoldingPhase(phase) && !hasPublicHands) {
    throw new EngineError(
      "INVALID_ACTION",
      "Public hand-phase snapshots must include hand counts."
    );
  }

  if (!isHandHoldingPhase(phase) && hasPublicHands) {
    throw new EngineError(
      "INVALID_ACTION",
      "Public non-hand snapshots must not include hand counts."
    );
  }

  const parsedState = {
    ...state,
    createdAt: parseTimestamp(state.createdAt, `${label}.createdAt`),
    dealer: parseSeatIndex(state.dealer, `${label}.dealer`),
    gameId: parseNonEmptyString(state.gameId, `${label}.gameId`),
    handNumber: parsePositiveInteger(state.handNumber, `${label}.handNumber`),
    ...(hasPublicHands
      ? { handCounts: parseHandCounts(state.handCounts, `${label}.handCounts`) }
      : {}),
    marks: parseMarks(state.marks, `${label}.marks`),
    mode: parseGameMode(state.mode, `${label}.mode`),
    phase,
    players: parsePlayers(state.players, `${label}.players`),
    rules: parseRuleConfig(state.rules),
    schemaVersion: FORTY_TWO_STATE_SCHEMA_VERSION,
    teams: parseTeams(state.teams, `${label}.teams`),
    updatedAt: parseTimestamp(state.updatedAt, `${label}.updatedAt`)
  };

  return parsedState as unknown as MultiplayerVisibleFortyTwoState;
}

function parseRuleConfig(value: unknown): RuleConfig {
  const rules = parseRecord(value, "rules");
  const bidding = parseRecord(rules.bidding, "rules.bidding");
  const enabledContracts = parseRecord(
    rules.enabledContracts,
    "rules.enabledContracts"
  );
  const scoring = parseRecord(rules.scoring, "rules.scoring");
  const table = parseRecord(rules.table, "rules.table");
  const trumpBehavior = parseRecord(rules.trumpBehavior, "rules.trumpBehavior");

  assertSchemaVersion(
    rules.schemaVersion,
    FORTY_TWO_RULE_SCHEMA_VERSION,
    "Forty Two rule config"
  );

  return {
    bidding: {
      allPassBehavior: parseEnum(
        bidding.allPassBehavior,
        FORTY_TWO_ALL_PASS_BEHAVIORS,
        "rules.bidding.allPassBehavior",
        "INVALID_ACTION"
      ),
      maximumNumericBid: parseInteger(
        bidding.maximumNumericBid,
        "rules.bidding.maximumNumericBid"
      ),
      minimumBid: parseInteger(bidding.minimumBid, "rules.bidding.minimumBid")
    },
    enabledContracts: {
      eightyFour: parseBoolean(
        enabledContracts.eightyFour,
        "rules.enabledContracts.eightyFour"
      ),
      followMe: parseBoolean(
        enabledContracts.followMe,
        "rules.enabledContracts.followMe"
      ),
      markBids: parseBoolean(
        enabledContracts.markBids,
        "rules.enabledContracts.markBids"
      ),
      nello: parseBoolean(
        enabledContracts.nello,
        "rules.enabledContracts.nello"
      ),
      plunge: parseBoolean(
        enabledContracts.plunge,
        "rules.enabledContracts.plunge"
      ),
      sevens: parseBoolean(
        enabledContracts.sevens,
        "rules.enabledContracts.sevens"
      ),
      splash: parseBoolean(
        enabledContracts.splash,
        "rules.enabledContracts.splash"
      )
    },
    schemaVersion: FORTY_TWO_RULE_SCHEMA_VERSION,
    scoring: {
      countDominoPoints: parseInteger(
        scoring.countDominoPoints,
        "rules.scoring.countDominoPoints"
      ),
      handTotalPoints: parseInteger(
        scoring.handTotalPoints,
        "rules.scoring.handTotalPoints"
      ),
      trickPointValue: parseInteger(
        scoring.trickPointValue,
        "rules.scoring.trickPointValue"
      )
    },
    scoringMode: parseEnum(
      rules.scoringMode,
      FORTY_TWO_SCORING_MODES,
      "rules.scoringMode",
      "INVALID_ACTION"
    ),
    table: {
      dominoesPerHand: parseInteger(
        table.dominoesPerHand,
        "rules.table.dominoesPerHand"
      ),
      playerCount: parseInteger(table.playerCount, "rules.table.playerCount"),
      tricksPerHand: parseInteger(
        table.tricksPerHand,
        "rules.table.tricksPerHand"
      )
    },
    targetMarks: parsePositiveInteger(rules.targetMarks, "rules.targetMarks"),
    trumpBehavior: {
      doublesHigh: parseBoolean(
        trumpBehavior.doublesHigh,
        "rules.trumpBehavior.doublesHigh"
      ),
      trumpDominoBelongsOnlyToTrump: parseBoolean(
        trumpBehavior.trumpDominoBelongsOnlyToTrump,
        "rules.trumpBehavior.trumpDominoBelongsOnlyToTrump"
      )
    }
  };
}

function parseParticipants(
  value: unknown,
  label: string
): MultiplayerParticipants {
  const participants = parseRecord(value, label);
  const parsed: Record<string, MultiplayerParticipant> = {};

  for (const [playerId, participantValue] of Object.entries(participants)) {
    const participant = parseParticipant(participantValue, `${label}.${playerId}`);

    if (participant.playerId !== playerId) {
      throw new EngineError(
        "INVALID_ACTOR",
        "Participant key does not match participant player ID."
      );
    }

    parsed[playerId] = participant;
  }

  return parsed;
}

function parseParticipant(
  value: unknown,
  label: string
): MultiplayerParticipant {
  const participant = parseRecord(value, label);

  return {
    connectionStatus: parseConnectionStatus(
      participant.connectionStatus,
      `${label}.connectionStatus`
    ),
    displayName: parseNonEmptyString(participant.displayName, `${label}.displayName`),
    joinedAt: parseTimestamp(participant.joinedAt, `${label}.joinedAt`),
    playerId: parseNonEmptyString(participant.playerId, `${label}.playerId`)
  };
}

function parseSeats(value: unknown, label: string): MultiplayerSeats {
  const seats = parseRecord(value, label);
  const parsed: Record<SeatIndex, MultiplayerSeatAssignment | null> = {
    0: null,
    1: null,
    2: null,
    3: null
  };

  for (const seat of SEAT_INDICES) {
    const key = String(seat);

    if (!(key in seats)) {
      throw new EngineError("INVALID_SEAT", `${label}.${key} is required.`);
    }

    const assignmentValue = seats[key];

    if (assignmentValue === null) {
      parsed[seat] = null;
      continue;
    }

    const assignment = parseSeatAssignment(
      assignmentValue,
      `${label}.${key}`
    );

    if (assignment.seat !== seat) {
      throw new EngineError(
        "INVALID_SEAT",
        "Seat assignment does not match its seat key."
      );
    }

    parsed[seat] = assignment;
  }

  return parsed;
}

function parseSeatAssignment(
  value: unknown,
  label: string
): MultiplayerSeatAssignment {
  const assignment = parseRecord(value, label);

  return {
    displayName: parseNonEmptyString(assignment.displayName, `${label}.displayName`),
    playerId: parseNonEmptyString(assignment.playerId, `${label}.playerId`),
    seat: parseSeatIndex(assignment.seat, `${label}.seat`)
  };
}

function parsePlayers(
  value: unknown,
  label: string
): Record<SeatIndex, { readonly name: string; readonly seat: SeatIndex }> {
  const players = parseRecord(value, label);
  const parsed: Record<SeatIndex, { readonly name: string; readonly seat: SeatIndex }> = {
    0: parsePlayer(players[0], `${label}.0`, 0),
    1: parsePlayer(players[1], `${label}.1`, 1),
    2: parsePlayer(players[2], `${label}.2`, 2),
    3: parsePlayer(players[3], `${label}.3`, 3)
  };

  return parsed;
}

function parsePlayer(
  value: unknown,
  label: string,
  expectedSeat: SeatIndex
): { readonly name: string; readonly seat: SeatIndex } {
  const player = parseRecord(value, label);
  const seat = parseSeatIndex(player.seat, `${label}.seat`);

  if (seat !== expectedSeat) {
    throw new EngineError("INVALID_SEAT", "Player seat does not match player key.");
  }

  return {
    name: parseNonEmptyString(player.name, `${label}.name`),
    seat
  };
}

function parseTeams(
  value: unknown,
  label: string
): Record<
  FortyTwoTeamId,
  {
    readonly id: FortyTwoTeamId;
    readonly name: string;
    readonly seats: readonly [SeatIndex, SeatIndex];
  }
> {
  const teams = parseRecord(value, label);

  return {
    teamA: parseTeam(teams.teamA, `${label}.teamA`, "teamA"),
    teamB: parseTeam(teams.teamB, `${label}.teamB`, "teamB")
  };
}

function parseTeam(
  value: unknown,
  label: string,
  expectedTeamId: FortyTwoTeamId
): {
  readonly id: FortyTwoTeamId;
  readonly name: string;
  readonly seats: readonly [SeatIndex, SeatIndex];
} {
  const team = parseRecord(value, label);
  const id = parseTeamId(team.id, `${label}.id`);

  if (id !== expectedTeamId) {
    throw new EngineError("INVALID_ACTION", "Team ID does not match team key.");
  }

  return {
    id,
    name: parseNonEmptyString(team.name, `${label}.name`),
    seats: parseSeatPair(team.seats, `${label}.seats`)
  };
}

function parseSeatPair(
  value: unknown,
  label: string
): readonly [SeatIndex, SeatIndex] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new EngineError("INVALID_SEAT", `${label} must contain two seats.`);
  }

  return [
    parseSeatIndex(value[0], `${label}.0`),
    parseSeatIndex(value[1], `${label}.1`)
  ];
}

function parseMarks(
  value: unknown,
  label: string
): Record<FortyTwoTeamId, number> {
  const marks = parseRecord(value, label);

  return {
    teamA: parseNonNegativeInteger(marks.teamA, `${label}.teamA`),
    teamB: parseNonNegativeInteger(marks.teamB, `${label}.teamB`)
  };
}

function parseHandCounts(
  value: unknown,
  label: string
): Record<SeatIndex, number> {
  const handCounts = parseRecord(value, label);

  return {
    0: parseNonNegativeInteger(handCounts[0], `${label}.0`),
    1: parseNonNegativeInteger(handCounts[1], `${label}.1`),
    2: parseNonNegativeInteger(handCounts[2], `${label}.2`),
    3: parseNonNegativeInteger(handCounts[3], `${label}.3`)
  };
}

function parsePartialSeatNames(
  value: unknown,
  label: string
): Partial<Record<SeatIndex, string>> {
  const names = parseRecord(value, label);
  const parsed: Partial<Record<SeatIndex, string>> = {};

  for (const [key, name] of Object.entries(names)) {
    const seat = parseSeatIndex(Number(key), `${label}.${key}`);
    parsed[seat] = parseNonEmptyString(name, `${label}.${key}`);
  }

  return parsed;
}

function parsePartialTeamNames(
  value: unknown,
  label: string
): Partial<Record<FortyTwoTeamId, string>> {
  const names = parseRecord(value, label);
  const parsed: Partial<Record<FortyTwoTeamId, string>> = {};

  for (const [key, name] of Object.entries(names)) {
    const teamId = parseTeamId(key, `${label}.${key}`);
    parsed[teamId] = parseNonEmptyString(name, `${label}.${key}`);
  }

  return parsed;
}

function parseDominoArray(value: unknown, label: string): readonly Domino[] {
  return parseArray(value, label, parseDomino);
}

function parseDomino(value: unknown, label: string): Domino {
  const domino = parseRecord(value, label);
  const high = domino.high;
  const low = domino.low;

  if (!isPip(high) || !isPip(low)) {
    throw new EngineError("INVALID_DOMINO", `${label} contains an invalid pip.`);
  }

  if (high < low) {
    throw new EngineError("INVALID_DOMINO", `${label} must be normalized.`);
  }

  return {
    high,
    low
  };
}

function parseRoomStatus(
  value: unknown,
  label: string
): MultiplayerRoomStatus {
  return parseEnum(value, MULTIPLAYER_ROOM_STATUSES, label, "INVALID_PHASE");
}

function parseRoomVisibility(
  value: unknown,
  label: string
): MultiplayerRoomVisibility {
  return parseEnum(
    value,
    MULTIPLAYER_ROOM_VISIBILITIES,
    label,
    "INVALID_ACTION"
  );
}

function parseConnectionStatus(
  value: unknown,
  label: string
): MultiplayerConnectionStatus {
  return parseEnum(
    value,
    MULTIPLAYER_CONNECTION_STATUSES,
    label,
    "INVALID_ACTION"
  );
}

function parseSyncConnectionStatus(
  value: unknown,
  label: string
): MultiplayerSyncConnectionStatus {
  return parseEnum(
    value,
    MULTIPLAYER_SYNC_CONNECTION_STATUSES,
    label,
    "INVALID_ACTION"
  );
}

function parseGameMode(value: unknown, label: string): FortyTwoGameMode {
  return parseEnum(value, FORTY_TWO_GAME_MODES, label, "INVALID_ACTION");
}

function parseFortyTwoPhase(
  value: unknown,
  label: string
): MultiplayerVisibleFortyTwoState["phase"] {
  return parseEnum(value, FORTY_TWO_PHASES, label, "INVALID_PHASE");
}

function parseTeamId(value: unknown, label: string): FortyTwoTeamId {
  return parseEnum(value, FORTY_TWO_TEAM_IDS, label, "INVALID_ACTION");
}

function parseTrumpSuit(value: unknown, label: string): TrumpSuit {
  if (isTrumpSuit(value)) {
    return value;
  }

  throw new EngineError("INVALID_TRUMP", `${label} must be a valid trump suit.`);
}

function parseDominoSuit(value: unknown, label: string): DominoSuit {
  return parseTrumpSuit(value, label);
}

function parseSeatIndex(value: unknown, label: string): SeatIndex {
  if (isSeatIndex(value)) {
    return value;
  }

  throw new EngineError("INVALID_SEAT", `${label} must be a seat from 0 to 3.`);
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EngineError("INVALID_ACTION", `${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseArray<TValue>(
  value: unknown,
  label: string,
  parseItem: (value: unknown, label: string) => TValue
): readonly TValue[] {
  if (!Array.isArray(value)) {
    throw new EngineError("INVALID_ACTION", `${label} must be an array.`);
  }

  return value.map((item, index) => parseItem(item, `${label}.${index}`));
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EngineError("INVALID_ACTION", `${label} must be a non-empty string.`);
  }

  return value;
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new EngineError("INVALID_ACTION", `${label} must be a valid timestamp.`);
  }

  return value;
}

function parseInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EngineError("INVALID_ACTION", `${label} must be an integer.`);
  }

  return value;
}

function parseNonNegativeInteger(value: unknown, label: string): number {
  const integer = parseInteger(value, label);

  if (integer < 0) {
    throw new EngineError("INVALID_ACTION", `${label} must not be negative.`);
  }

  return integer;
}

function parsePositiveInteger(value: unknown, label: string): number {
  const integer = parseInteger(value, label);

  if (integer < 1) {
    throw new EngineError("INVALID_ACTION", `${label} must be positive.`);
  }

  return integer;
}

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new EngineError("INVALID_ACTION", `${label} must be a boolean.`);
  }

  return value;
}

function parseEnum<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string,
  code: "INVALID_ACTION" | "INVALID_PHASE"
): TValue {
  if (typeof value === "string" && allowed.includes(value as TValue)) {
    return value as TValue;
  }

  throw new EngineError(code, `${label} is not supported.`);
}

function assertSchemaVersion(
  value: unknown,
  expected: number,
  label: string
): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EngineError("INVALID_ACTION", `${label} schema version is required.`);
  }

  if (value !== expected) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      `Unsupported ${label} schema version.`
    );
  }
}

function assertRecordsBelongToGame(
  gameId: string,
  events: readonly MultiplayerGameEventRecord[],
  privateHands: readonly MultiplayerPrivateHandRecord[],
  idempotency: readonly MultiplayerActionIdempotencyRecord[]
): void {
  for (const event of events) {
    if (event.gameId !== gameId) {
      throw new EngineError("GAME_NOT_FOUND", "Event record belongs to a different game.");
    }
  }

  for (const privateHand of privateHands) {
    if (privateHand.gameId !== gameId) {
      throw new EngineError(
        "GAME_NOT_FOUND",
        "Private hand record belongs to a different game."
      );
    }
  }

  for (const actionResult of idempotency) {
    if (actionResult.gameId !== gameId) {
      throw new EngineError(
        "GAME_NOT_FOUND",
        "Action result record belongs to a different game."
      );
    }
  }
}

function assertSeatAssignmentsHaveParticipants(
  seats: MultiplayerSeats,
  participants: MultiplayerParticipants
): void {
  for (const seat of SEAT_INDICES) {
    const assignment = seats[seat];

    if (!assignment) {
      continue;
    }

    if (!participants[assignment.playerId]) {
      throw new EngineError(
        "INVALID_ACTOR",
        "Seat assignment must reference a room participant."
      );
    }
  }
}

function isHandHoldingPhase(
  phase: MultiplayerVisibleFortyTwoState["phase"]
): boolean {
  return (
    phase === "dealt" ||
    phase === "bidding" ||
    phase === "trump" ||
    phase === "trickPlay"
  );
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
