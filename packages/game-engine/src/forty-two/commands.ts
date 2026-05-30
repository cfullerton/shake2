import {
  getEngineId,
  getEngineTimestamp,
  type EngineContext
} from "../context.ts";
import { EngineError } from "../errors.ts";
import {
  createBiddingState,
  submitBid
} from "./bidding.ts";
import { dealDoubleSixDominoes } from "./deal.ts";
import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  type CallFortyTwoTrumpAction,
  type CompleteFortyTwoBiddingAction,
  type CreateFortyTwoGameAction,
  type DealFortyTwoHandAction,
  type FortyTwoAction,
  type FortyTwoActionEnvelope,
  type SubmitFortyTwoBidAction
} from "./actions.ts";
import {
  FORTY_TWO_EVENT_SCHEMA_VERSION,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope
} from "./events.ts";
import { applyFortyTwoEvent } from "./reducer.ts";
import {
  createInitialFortyTwoSnapshot,
  type FortyTwoSnapshotEnvelope
} from "./state.ts";
import {
  assertSeatIndex,
  type SeatIndex
} from "./seats.ts";
import {
  callTrump,
  createTrumpCallState
} from "./trump.ts";
import { startTrick } from "./tricks.ts";

export type FortyTwoCommandResult<TEvent extends FortyTwoEvent = FortyTwoEvent> =
  | {
      readonly events: readonly FortyTwoEventEnvelope<TEvent>[];
      readonly ok: true;
      readonly snapshot: FortyTwoSnapshotEnvelope;
    }
  | {
      readonly error: EngineError;
      readonly ok: false;
    };

export function handleCreateFortyTwoGameCommand(
  action: FortyTwoActionEnvelope<CreateFortyTwoGameAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult<Extract<FortyTwoEvent, { readonly type: "fortyTwo.game.created" }>> {
  return runFortyTwoCommand(() => {
    assertActionEnvelope(action);
    const initialSnapshot = createInitialFortyTwoSnapshot(
      {
        dealer: action.action.payload.dealer,
        gameId: action.gameId,
        ...(action.action.payload.playerNames
          ? { playerNames: action.action.payload.playerNames }
          : {}),
        ...(action.action.payload.rules
          ? { rules: action.action.payload.rules }
          : {}),
        ...(action.action.payload.teamNames
          ? { teamNames: action.action.payload.teamNames }
          : {})
      },
      context
    );
    const event = createEventEnvelope(
      initialSnapshot,
      action,
      {
        payload: {
          createdAt: initialSnapshot.snapshot.createdAt,
          dealer: initialSnapshot.snapshot.dealer,
          handNumber: initialSnapshot.snapshot.handNumber,
          marks: initialSnapshot.snapshot.marks,
          mode: initialSnapshot.snapshot.mode,
          players: initialSnapshot.snapshot.players,
          rules: initialSnapshot.snapshot.rules,
          teams: initialSnapshot.snapshot.teams
        },
        type: "fortyTwo.game.created"
      },
      context,
      initialSnapshot.generatedAt
    );

    return applyCommandEvent(initialSnapshot, event);
  });
}

export function handleDealFortyTwoHandCommand(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope<DealFortyTwoHandAction>,
  context: Pick<EngineContext, "newId" | "now" | "random">
): FortyTwoCommandResult<Extract<FortyTwoEvent, { readonly type: "fortyTwo.hand.dealt" }>> {
  return runFortyTwoCommand(() => {
    assertActionForSnapshot(snapshot, action);

    if (snapshot.snapshot.phase !== "setup") {
      throw new EngineError("INVALID_PHASE", "A hand can only be dealt from setup.");
    }

    if (
      action.action.payload.dealer !== snapshot.snapshot.dealer ||
      action.action.payload.handNumber !== snapshot.snapshot.handNumber
    ) {
      throw new EngineError(
        "INVALID_ACTION",
        "Deal command must match current dealer and hand number."
      );
    }

    const event = createEventEnvelope(
      snapshot,
      action,
      {
        payload: {
          dealer: snapshot.snapshot.dealer,
          handNumber: snapshot.snapshot.handNumber,
          hands: dealDoubleSixDominoes(context)
        },
        type: "fortyTwo.hand.dealt"
      },
      context
    );

    return applyCommandEvent(snapshot, event);
  });
}

export function handleSubmitFortyTwoBidCommand(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope<SubmitFortyTwoBidAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult<Extract<FortyTwoEvent, { readonly type: "fortyTwo.bid.submitted" }>> {
  return runFortyTwoCommand(() => {
    assertActionForSnapshot(snapshot, action);
    assertActorSeat(action, action.action.payload.seat);

    if (snapshot.snapshot.phase !== "dealt" && snapshot.snapshot.phase !== "bidding") {
      throw new EngineError("INVALID_PHASE", "Bids can only be submitted after a hand is dealt.");
    }

    const bidding = snapshot.snapshot.phase === "bidding"
      ? snapshot.snapshot.bidding
      : createBiddingState(snapshot.snapshot.dealer);
    const nextBidding = submitBid(
      bidding,
      action.action.payload.seat,
      action.action.payload.bid
    );
    const event = createEventEnvelope(
      snapshot,
      action,
      {
        payload: {
          bid: action.action.payload.bid,
          bidding: nextBidding,
          seat: action.action.payload.seat
        },
        type: "fortyTwo.bid.submitted"
      },
      context
    );

    return applyCommandEvent(snapshot, event);
  });
}

export function handleCompleteFortyTwoBiddingCommand(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope<CompleteFortyTwoBiddingAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult<Extract<FortyTwoEvent, { readonly type: "fortyTwo.bidding.completed" }>> {
  return runFortyTwoCommand(() => {
    assertActionForSnapshot(snapshot, action);

    if (snapshot.snapshot.phase !== "bidding") {
      throw new EngineError("INVALID_PHASE", "Bidding can only complete during bidding.");
    }

    if (snapshot.snapshot.bidding.status !== "complete") {
      throw new EngineError("INVALID_PHASE", "Bidding is not complete.");
    }

    const event = createEventEnvelope(
      snapshot,
      action,
      {
        payload: {
          bidding: snapshot.snapshot.bidding,
          trump: createTrumpCallState(snapshot.snapshot.bidding)
        },
        type: "fortyTwo.bidding.completed"
      },
      context
    );

    return applyCommandEvent(snapshot, event);
  });
}

export function handleCallFortyTwoTrumpCommand(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope<CallFortyTwoTrumpAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult<Extract<FortyTwoEvent, { readonly type: "fortyTwo.trump.called" }>> {
  return runFortyTwoCommand(() => {
    assertActionForSnapshot(snapshot, action);

    if (snapshot.snapshot.phase !== "trump") {
      throw new EngineError("INVALID_PHASE", "Trump can only be called during trump phase.");
    }

    const actorSeat = getActorSeat(action);
    const trump = callTrump(
      snapshot.snapshot.trump,
      actorSeat,
      action.action.payload.trumpSuit
    );
    const contract = trump.contract;

    if (!contract) {
      throw new EngineError("INVALID_TRUMP", "Trump call did not create a contract.");
    }

    const event = createEventEnvelope(
      snapshot,
      action,
      {
        payload: {
          contract,
          currentTrick: startTrick(contract.declarer),
          trump
        },
        type: "fortyTwo.trump.called"
      },
      context
    );

    return applyCommandEvent(snapshot, event);
  });
}

function runFortyTwoCommand<TEvent extends FortyTwoEvent>(
  run: () => FortyTwoCommandResult<TEvent>
): FortyTwoCommandResult<TEvent> {
  try {
    return run();
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

function applyCommandEvent<TEvent extends FortyTwoEvent>(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope<TEvent>
): FortyTwoCommandResult<TEvent> {
  return {
    events: [event],
    ok: true,
    snapshot: applyFortyTwoEvent(snapshot, event)
  };
}

function createEventEnvelope<TEvent extends FortyTwoEvent>(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope,
  event: TEvent,
  context: Pick<EngineContext, "newId" | "now">,
  serverCreatedAt = getEngineTimestamp(context)
): FortyTwoEventEnvelope<TEvent> {
  return {
    actionId: action.actionId,
    actorId: action.actorId,
    ...(action.actorSeat !== undefined ? { actorSeat: action.actorSeat } : {}),
    event,
    eventId: getEngineId(context),
    gameId: snapshot.gameId,
    schemaVersion: FORTY_TWO_EVENT_SCHEMA_VERSION,
    sequence: snapshot.lastEventSequence + 1,
    serverCreatedAt
  };
}

function assertActionEnvelope(action: FortyTwoActionEnvelope): void {
  if (action.schemaVersion !== FORTY_TWO_ACTION_SCHEMA_VERSION) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      "Unsupported Forty Two action schema version."
    );
  }

  if (action.actionId.trim().length === 0 || action.actorId.trim().length === 0) {
    throw new EngineError("INVALID_ACTION", "Action and actor IDs are required.");
  }

  if (Number.isNaN(Date.parse(action.clientCreatedAt))) {
    throw new EngineError("INVALID_ACTION", "Action timestamp is invalid.");
  }
}

function assertActionForSnapshot(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope
): void {
  assertActionEnvelope(action);

  if (action.gameId !== snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Action belongs to a different game.");
  }

  if (
    action.knownSnapshotVersion !== undefined &&
    action.knownSnapshotVersion !== snapshot.snapshotVersion
  ) {
    throw new EngineError("STALE_ACTION", "Action was based on a stale snapshot.");
  }

  if (
    action.knownLastEventSequence !== undefined &&
    action.knownLastEventSequence !== snapshot.lastEventSequence
  ) {
    throw new EngineError("STALE_ACTION", "Action was based on a stale event sequence.");
  }
}

function assertActorSeat(
  action: FortyTwoActionEnvelope,
  expectedSeat: SeatIndex
): void {
  const actorSeat = getActorSeat(action);

  if (actorSeat !== expectedSeat) {
    throw new EngineError("INVALID_ACTOR", "Actor seat does not match command seat.");
  }
}

function getActorSeat(action: FortyTwoActionEnvelope): SeatIndex {
  if (action.actorSeat === undefined) {
    throw new EngineError("INVALID_ACTOR", "Action requires an actor seat.");
  }

  assertSeatIndex(action.actorSeat);
  return action.actorSeat;
}
