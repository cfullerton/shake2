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
  type PlayFortyTwoDominoAction,
  type SubmitFortyTwoBidAction
} from "./actions.ts";
import {
  FORTY_TWO_EVENT_SCHEMA_VERSION,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope
} from "./events.ts";
import { applyFortyTwoEvent } from "./reducer.ts";
import {
  FORTY_TWO_TRICKS_PER_HAND,
  scoreCompletedHand
} from "./scoring.ts";
import {
  createInitialFortyTwoSnapshot,
  type FortyTwoSnapshotEnvelope
} from "./state.ts";
import {
  FORTY_TWO_TEAM_IDS,
  assertSeatIndex,
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import {
  callTrump,
  createTrumpCallState,
  getContractTrumpSuit
} from "./trump.ts";
import {
  determineTrickWinnerForContract,
  isTrickComplete,
  playDominoToTrick,
  startTrick
} from "./tricks.ts";

type FortyTwoGameCreatedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.game.created" }
>;
type FortyTwoHandDealtEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.dealt" }
>;
type FortyTwoBidSubmittedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.bid.submitted" }
>;
type FortyTwoBiddingCompletedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.bidding.completed" }
>;
type FortyTwoTrumpCalledEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.trump.called" }
>;
type FortyTwoDominoPlayedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.domino.played" }
>;
type FortyTwoTrickCompletedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.trick.completed" }
>;
type FortyTwoHandCompletedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>;
type FortyTwoGameCompletedEvent = Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.game.completed" }
>;
type FortyTwoPlayDominoEvent =
  | FortyTwoDominoPlayedEvent
  | FortyTwoTrickCompletedEvent
  | FortyTwoHandCompletedEvent
  | FortyTwoGameCompletedEvent;

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
): FortyTwoCommandResult<FortyTwoGameCreatedEvent> {
  return runFortyTwoCommand(() => {
    assertActionEnvelope(action);
    const initialSnapshot = createInitialFortyTwoSnapshot(
      {
        dealer: action.action.payload.dealer,
        gameId: action.gameId,
        ...(action.action.payload.mode
          ? { mode: action.action.payload.mode }
          : {}),
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
): FortyTwoCommandResult<FortyTwoHandDealtEvent> {
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
): FortyTwoCommandResult<FortyTwoBidSubmittedEvent> {
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
): FortyTwoCommandResult<FortyTwoBiddingCompletedEvent> {
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
): FortyTwoCommandResult<FortyTwoTrumpCalledEvent> {
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

export function handlePlayFortyTwoDominoCommand(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope<PlayFortyTwoDominoAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult<FortyTwoPlayDominoEvent> {
  return runFortyTwoCommand(() => {
    assertActionForSnapshot(snapshot, action);

    if (snapshot.snapshot.phase !== "trickPlay") {
      throw new EngineError("INVALID_PHASE", "Dominoes can only be played during trick play.");
    }

    assertActorSeat(action, action.action.payload.seat);

    const playResult = playDominoToTrick({
      domino: action.action.payload.domino,
      hands: snapshot.snapshot.hands,
      ...(action.action.payload.ledSuit
        ? { ledSuit: action.action.payload.ledSuit }
        : {}),
      seat: action.action.payload.seat,
      trick: snapshot.snapshot.currentTrick,
      trumpSuit: getContractTrumpSuit(snapshot.snapshot.contract)
    });
    const playedEvent = createEventEnvelope(
      snapshot,
      action,
      {
        payload: {
          currentTrick: playResult.trick,
          hands: playResult.hands
        },
        type: "fortyTwo.domino.played"
      },
      context
    );
    const events: FortyTwoEventEnvelope<FortyTwoPlayDominoEvent>[] = [
      playedEvent
    ];
    let nextSnapshot = applyFortyTwoEvent(snapshot, playedEvent);

    if (!isTrickComplete(playResult.trick)) {
      return {
        events,
        ok: true,
        snapshot: nextSnapshot
      };
    }

    const winner = determineTrickWinnerForContract(
      playResult.trick,
      snapshot.snapshot.contract
    );
    const trickCompletedEvent = createEventEnvelope(
      nextSnapshot,
      action,
      {
        payload: {
          completedTrick: {
            trick: playResult.trick,
            winner
          },
          currentTrick: startTrick(winner)
        },
        type: "fortyTwo.trick.completed"
      },
      context
    );
    events.push(trickCompletedEvent);
    nextSnapshot = applyFortyTwoEvent(nextSnapshot, trickCompletedEvent);

    if (
      nextSnapshot.snapshot.phase === "trickPlay" &&
      nextSnapshot.snapshot.completedTricks.length === FORTY_TWO_TRICKS_PER_HAND
    ) {
      const handCompletedEvent = createEventEnvelope(
        nextSnapshot,
        action,
        {
          payload: {
            completedTricks: nextSnapshot.snapshot.completedTricks,
            handScore: scoreCompletedHand(
              nextSnapshot.snapshot.completedTricks,
              nextSnapshot.snapshot.contract,
              nextSnapshot.snapshot.rules
            )
          },
          type: "fortyTwo.hand.completed"
        },
        context
      );
      events.push(handCompletedEvent);
      nextSnapshot = applyFortyTwoEvent(nextSnapshot, handCompletedEvent);

      const winningTeamId = getGameWinningTeamId(
        nextSnapshot.snapshot.marks,
        nextSnapshot.snapshot.rules.targetMarks
      );

      if (winningTeamId) {
        const completedAt = getEngineTimestamp(context);
        const gameCompletedEvent = createEventEnvelope(
          nextSnapshot,
          action,
          {
            payload: {
              completedAt,
              winningTeamId
            },
            type: "fortyTwo.game.completed"
          },
          context,
          completedAt
        );
        events.push(gameCompletedEvent);
        nextSnapshot = applyFortyTwoEvent(nextSnapshot, gameCompletedEvent);
      }
    }

    return {
      events,
      ok: true,
      snapshot: nextSnapshot
    };
  });
}

function getGameWinningTeamId(
  marks: Readonly<Record<FortyTwoTeamId, number>>,
  targetMarks: number
): FortyTwoTeamId | null {
  return FORTY_TWO_TEAM_IDS.find((teamId) => marks[teamId] >= targetMarks) ?? null;
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
  return applyCommandEvents(snapshot, [event]);
}

function applyCommandEvents<TEvent extends FortyTwoEvent>(
  snapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope<TEvent>[]
): FortyTwoCommandResult<TEvent> {
  const nextSnapshot = events.reduce(applyFortyTwoEvent, snapshot);

  return {
    events,
    ok: true,
    snapshot: nextSnapshot
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
