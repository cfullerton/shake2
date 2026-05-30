import {
  createBiddingState,
  submitBid,
  type BidCall
} from "./bidding.ts";
import {
  type FortyTwoHands,
  getDealtDominoKeys
} from "./deal.ts";
import {
  normalizeDomino,
  type Domino
} from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import {
  FORTY_TWO_EVENT_SCHEMA_VERSION,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope
} from "./events.ts";
import { applyFortyTwoEvent } from "./reducer.ts";
import {
  scoreCompletedHand,
  type CompletedTrick,
  type HandScore
} from "./scoring.ts";
import {
  SEAT_INDICES,
  assertSeatIndex,
  type SeatIndex
} from "./seats.ts";
import {
  FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
  FORTY_TWO_STATE_SCHEMA_VERSION,
  type FortyTwoSnapshotEnvelope
} from "./state.ts";
import {
  determineTrickWinner,
  playDominoToTrick,
  startTrick
} from "./tricks.ts";
import {
  callTrump,
  createTrumpCallState
} from "./trump.ts";

export function assertFortyTwoSnapshotEnvelope(
  value: unknown
): asserts value is FortyTwoSnapshotEnvelope {
  const snapshot = assertRecord(value, "Forty Two snapshot envelope");
  assertNonEmptyString(snapshot.gameId, "snapshot.gameId");
  assertValidTimestamp(snapshot.generatedAt, "snapshot.generatedAt");
  assertInteger(snapshot.lastEventSequence, "snapshot.lastEventSequence");
  assertInteger(snapshot.snapshotVersion, "snapshot.snapshotVersion");

  if (snapshot.schemaVersion !== FORTY_TWO_SNAPSHOT_SCHEMA_VERSION) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      "Unsupported Forty Two snapshot schema version."
    );
  }

  const state = assertRecord(snapshot.snapshot, "snapshot.snapshot");

  if (state.schemaVersion !== FORTY_TWO_STATE_SCHEMA_VERSION) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      "Unsupported Forty Two state schema version."
    );
  }

  if (state.gameId !== snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Snapshot state belongs to a different game.");
  }
}

export function assertFortyTwoEventEnvelope(
  value: unknown
): asserts value is FortyTwoEventEnvelope {
  const eventEnvelope = assertRecord(value, "Forty Two event envelope");
  assertNonEmptyString(eventEnvelope.actionId, "event.actionId");
  assertNonEmptyString(eventEnvelope.actorId, "event.actorId");
  assertNonEmptyString(eventEnvelope.eventId, "event.eventId");
  assertNonEmptyString(eventEnvelope.gameId, "event.gameId");
  assertInteger(eventEnvelope.sequence, "event.sequence");
  assertValidTimestamp(eventEnvelope.serverCreatedAt, "event.serverCreatedAt");

  if (eventEnvelope.actorSeat !== undefined) {
    assertSeatIndex(eventEnvelope.actorSeat);
  }

  if (eventEnvelope.schemaVersion !== FORTY_TWO_EVENT_SCHEMA_VERSION) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      "Unsupported Forty Two event schema version."
    );
  }

  const event = assertRecord(eventEnvelope.event, "event.event");
  assertNonEmptyString(event.type, "event.event.type");
  assertRecord(event.payload, "event.event.payload");
}

export function validateAcceptedFortyTwoEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope
): void {
  assertFortyTwoSnapshotEnvelope(snapshot);
  assertFortyTwoEventEnvelope(event);

  if (event.gameId !== snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Event belongs to a different game.");
  }

  if (event.sequence !== snapshot.lastEventSequence + 1) {
    throw new EngineError(
      "STALE_ACTION",
      "Event sequence must advance the snapshot by exactly one."
    );
  }

  switch (event.event.type) {
    case "fortyTwo.game.created":
      validateGameCreatedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.game.created" }
      >>);
      return;
    case "fortyTwo.hand.dealt":
      validateHandDealtEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.hand.dealt" }
      >>);
      return;
    case "fortyTwo.bid.submitted":
      validateBidSubmittedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.bid.submitted" }
      >>);
      return;
    case "fortyTwo.bidding.completed":
      validateBiddingCompletedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.bidding.completed" }
      >>);
      return;
    case "fortyTwo.trump.called":
      validateTrumpCalledEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.trump.called" }
      >>);
      return;
    case "fortyTwo.domino.played":
      validateDominoPlayedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.domino.played" }
      >>);
      return;
    case "fortyTwo.trick.completed":
      validateTrickCompletedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.trick.completed" }
      >>);
      return;
    case "fortyTwo.hand.completed":
      validateHandCompletedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.hand.completed" }
      >>);
      return;
    case "fortyTwo.game.completed":
      validateGameCompletedEvent(snapshot, event as FortyTwoEventEnvelope<Extract<
        FortyTwoEvent,
        { readonly type: "fortyTwo.game.completed" }
      >>);
      return;
  }
}

export function applyValidatedFortyTwoEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope
): FortyTwoSnapshotEnvelope {
  validateAcceptedFortyTwoEvent(snapshot, event);
  return applyFortyTwoEvent(snapshot, event);
}

export function replayValidatedFortyTwoEvents(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoSnapshotEnvelope {
  return events.reduce(applyValidatedFortyTwoEvent, initialSnapshot);
}

function validateGameCreatedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.game.created" }
  >>
): void {
  const payload = event.event.payload;
  assertValidTimestamp(payload.createdAt, "game.createdAt");
  assertSeatIndex(payload.dealer);

  if (snapshot.lastEventSequence !== 0 || snapshot.snapshotVersion !== 0) {
    throw new EngineError("INVALID_PHASE", "Game creation must be the first event.");
  }

  if (payload.handNumber !== 1) {
    throw new EngineError("INVALID_ACTION", "Game creation must start at hand 1.");
  }
}

function validateHandDealtEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.hand.dealt" }
  >>
): void {
  if (snapshot.snapshot.phase !== "setup") {
    throw new EngineError("INVALID_PHASE", "A hand can only be dealt from setup.");
  }

  const payload = event.event.payload;

  if (
    payload.dealer !== snapshot.snapshot.dealer ||
    payload.handNumber !== snapshot.snapshot.handNumber
  ) {
    throw new EngineError("INVALID_ACTION", "Deal event does not match snapshot setup.");
  }

  assertCompleteHands(payload.hands);
}

function validateBidSubmittedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.bid.submitted" }
  >>
): void {
  if (snapshot.snapshot.phase !== "dealt" && snapshot.snapshot.phase !== "bidding") {
    throw new EngineError("INVALID_PHASE", "Bid event can only apply after a deal.");
  }

  const payload = event.event.payload;
  const bidding = snapshot.snapshot.phase === "bidding"
    ? snapshot.snapshot.bidding
    : createBiddingState(snapshot.snapshot.dealer);

  assertSeatIndex(payload.seat);
  assertBid(payload.bid);

  if (event.actorSeat !== undefined && event.actorSeat !== payload.seat) {
    throw new EngineError("INVALID_ACTOR", "Bid event actor seat does not match payload seat.");
  }

  const expectedBidding = submitBid(bidding, payload.seat, payload.bid);
  assertDeepEqual(payload.bidding, expectedBidding, "Bid event contains forged bidding state.");
}

function validateBiddingCompletedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.bidding.completed" }
  >>
): void {
  if (snapshot.snapshot.phase !== "bidding") {
    throw new EngineError("INVALID_PHASE", "Bidding can only complete during bidding.");
  }

  if (snapshot.snapshot.bidding.status !== "complete") {
    throw new EngineError("INVALID_PHASE", "Bidding is not complete.");
  }

  const expectedTrump = createTrumpCallState(snapshot.snapshot.bidding);
  assertDeepEqual(
    event.event.payload.bidding,
    snapshot.snapshot.bidding,
    "Bidding completed event contains forged bidding state."
  );
  assertDeepEqual(
    event.event.payload.trump,
    expectedTrump,
    "Bidding completed event contains forged trump state."
  );
}

function validateTrumpCalledEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.trump.called" }
  >>
): void {
  if (snapshot.snapshot.phase !== "trump") {
    throw new EngineError("INVALID_PHASE", "Trump can only be called during trump phase.");
  }

  const contract = event.event.payload.contract;

  if (event.actorSeat !== undefined && event.actorSeat !== contract.declarer) {
    throw new EngineError("INVALID_ACTOR", "Trump event actor is not the declarer.");
  }

  const expectedTrump = callTrump(
    snapshot.snapshot.trump,
    contract.declarer,
    contract.trumpSuit
  );

  assertDeepEqual(
    event.event.payload.trump,
    expectedTrump,
    "Trump called event contains forged trump state."
  );
  assertDeepEqual(
    event.event.payload.currentTrick,
    startTrick(contract.declarer),
    "Trump called event contains forged starting trick."
  );
  assertDeepEqual(
    contract,
    expectedTrump.contract,
    "Trump called event contains forged contract."
  );
}

function validateDominoPlayedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.domino.played" }
  >>
): void {
  if (snapshot.snapshot.phase !== "trickPlay") {
    throw new EngineError("INVALID_PHASE", "Domino play event can only apply during trick play.");
  }

  const previousTrick = snapshot.snapshot.currentTrick;
  const nextTrick = event.event.payload.currentTrick;
  const nextPlay = nextTrick.playedDominoes[nextTrick.playedDominoes.length - 1];

  if (nextTrick.playedDominoes.length !== previousTrick.playedDominoes.length + 1 || !nextPlay) {
    throw new EngineError("INVALID_ACTION", "Domino play event must add exactly one play.");
  }

  assertDeepEqual(
    nextTrick.playedDominoes.slice(0, previousTrick.playedDominoes.length),
    previousTrick.playedDominoes,
    "Domino play event rewrites previous plays."
  );

  if (event.actorSeat !== undefined && event.actorSeat !== nextPlay.seat) {
    throw new EngineError("INVALID_ACTOR", "Domino play event actor does not match played seat.");
  }

  const expected = playDominoToTrick({
    domino: nextPlay.domino,
    hands: snapshot.snapshot.hands,
    ...(previousTrick.playedDominoes.length === 0 && nextTrick.ledSuit
      ? { ledSuit: nextTrick.ledSuit }
      : {}),
    seat: nextPlay.seat,
    trick: previousTrick,
    trumpSuit: snapshot.snapshot.contract.trumpSuit
  });

  assertDeepEqual(
    event.event.payload.currentTrick,
    expected.trick,
    "Domino played event contains forged trick state."
  );
  assertDeepEqual(
    event.event.payload.hands,
    expected.hands,
    "Domino played event contains forged hand state."
  );
}

function validateTrickCompletedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.trick.completed" }
  >>
): void {
  if (snapshot.snapshot.phase !== "trickPlay") {
    throw new EngineError("INVALID_PHASE", "Trick completion can only apply during trick play.");
  }

  const completedTrick = event.event.payload.completedTrick;
  const expectedWinner = determineTrickWinner(
    snapshot.snapshot.currentTrick,
    snapshot.snapshot.contract.trumpSuit
  );

  assertDeepEqual(
    completedTrick.trick,
    snapshot.snapshot.currentTrick,
    "Trick completed event contains forged trick data."
  );

  if (completedTrick.winner !== expectedWinner) {
    throw new EngineError("INVALID_ACTION", "Trick completed event contains forged winner.");
  }

  assertDeepEqual(
    event.event.payload.currentTrick,
    startTrick(expectedWinner),
    "Trick completed event contains forged next trick."
  );
}

function validateHandCompletedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.hand.completed" }
  >>
): void {
  if (snapshot.snapshot.phase !== "trickPlay") {
    throw new EngineError("INVALID_PHASE", "Hand completion can only apply during trick play.");
  }

  const winningBid = snapshot.snapshot.bidding.highestBid;

  if (!winningBid) {
    throw new EngineError("INVALID_PHASE", "Hand completion requires a winning bid.");
  }

  assertDeepEqual(
    event.event.payload.completedTricks,
    snapshot.snapshot.completedTricks,
    "Hand completed event contains forged completed tricks."
  );

  const expectedScore = scoreCompletedHand(snapshot.snapshot.completedTricks, winningBid);
  assertHandScore(event.event.payload.handScore);
  assertDeepEqual(
    event.event.payload.handScore,
    expectedScore,
    "Hand completed event contains forged hand score."
  );
}

function validateGameCompletedEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.game.completed" }
  >>
): void {
  if (snapshot.snapshot.phase !== "handComplete") {
    throw new EngineError("INVALID_PHASE", "Game completion can only apply after hand completion.");
  }

  assertValidTimestamp(event.event.payload.completedAt, "game.completedAt");

  if (
    snapshot.snapshot.marks[event.event.payload.winningTeamId] <
      snapshot.snapshot.rules.targetMarks
  ) {
    throw new EngineError("INVALID_ACTION", "Game completed event contains forged winner.");
  }
}

function assertCompleteHands(hands: FortyTwoHands): void {
  const keys = getDealtDominoKeys(hands);

  if (keys.length !== 28) {
    throw new EngineError("INVALID_DOMINO", "A dealt hand must contain 28 dominoes.");
  }

  if (new Set(keys).size !== 28) {
    throw new EngineError("INVALID_DOMINO", "A dealt hand cannot contain duplicate dominoes.");
  }

  for (const seat of SEAT_INDICES) {
    if (hands[seat].length !== 7) {
      throw new EngineError("INVALID_DOMINO", `Seat ${seat} must have 7 dominoes.`);
    }

    for (const domino of hands[seat]) {
      assertDomino(domino);
    }
  }
}

function assertDomino(value: Domino): void {
  const normalized = normalizeDomino(value);
  assertDeepEqual(value, normalized, "Domino must be normalized.");
}

function assertBid(value: BidCall): void {
  const bid = assertRecord(value, "bid");

  if (bid.kind === "pass") {
    return;
  }

  if (bid.kind === "numeric") {
    assertInteger(bid.amount, "bid.amount");
    return;
  }

  throw new EngineError("INVALID_BID", "Bid kind is invalid.");
}

function assertHandScore(value: HandScore): void {
  const handScore = assertRecord(value, "handScore");
  assertInteger(handScore.totalPoints, "handScore.totalPoints");
  assertInteger(handScore.bidAmount, "handScore.bidAmount");
  assertInteger(handScore.biddingTeamPoints, "handScore.biddingTeamPoints");
}

function assertRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EngineError("INVALID_ACTION", `${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EngineError("INVALID_ACTION", `${label} must be a non-empty string.`);
  }
}

function assertInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EngineError("INVALID_ACTION", `${label} must be an integer.`);
  }
}

function assertValidTimestamp(value: unknown, label: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new EngineError("INVALID_ACTION", `${label} must be a valid timestamp.`);
  }
}

function assertDeepEqual(
  actual: unknown,
  expected: unknown,
  message: string
): void {
  if (!deepEqual(actual, expected)) {
    throw new EngineError("INVALID_ACTION", message);
  }
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
