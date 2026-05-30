import { EngineError } from "../errors.ts";
import {
  FORTY_TWO_EVENT_SCHEMA_VERSION,
  type FortyTwoEventEnvelope
} from "./events.ts";
import {
  FORTY_TWO_STATE_SCHEMA_VERSION,
  type FortyTwoGameCompleteState,
  type FortyTwoHandCompleteState,
  type FortyTwoSnapshotEnvelope,
  type FortyTwoState,
  type FortyTwoStateBase,
  type FortyTwoPhase,
  type FortyTwoSetupState,
  type FortyTwoDealtState,
  type FortyTwoBiddingPhaseState,
  type FortyTwoTrumpPhaseState,
  type FortyTwoTrickPlayState
} from "./state.ts";
import { type FortyTwoMarks } from "./state.ts";

export function applyFortyTwoEvent(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope
): FortyTwoSnapshotEnvelope {
  assertEventCanApply(snapshot, event);

  const nextState = applyEventToState(snapshot.snapshot, event);

  return {
    ...snapshot,
    generatedAt: event.serverCreatedAt,
    lastEventSequence: event.sequence,
    snapshot: nextState,
    snapshotVersion: snapshot.snapshotVersion + 1
  };
}

export function replayFortyTwoEvents(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoSnapshotEnvelope {
  return events.reduce(applyFortyTwoEvent, initialSnapshot);
}

function applyEventToState(
  state: FortyTwoState,
  event: FortyTwoEventEnvelope
): FortyTwoState {
  switch (event.event.type) {
    case "fortyTwo.game.created": {
      const payload = event.event.payload;
      const nextState: FortyTwoSetupState = {
        createdAt: payload.createdAt,
        dealer: payload.dealer,
        gameId: event.gameId,
        handNumber: payload.handNumber,
        marks: payload.marks,
        mode: payload.mode,
        phase: "setup",
        players: payload.players,
        rules: payload.rules,
        schemaVersion: FORTY_TWO_STATE_SCHEMA_VERSION,
        teams: payload.teams,
        updatedAt: event.serverCreatedAt
      };

      return nextState;
    }

    case "fortyTwo.hand.dealt": {
      const payload = event.event.payload;
      const nextState: FortyTwoDealtState = {
        ...createStateBase(state, "dealt", event.serverCreatedAt),
        dealer: payload.dealer,
        handNumber: payload.handNumber,
        hands: payload.hands
      };

      return nextState;
    }

    case "fortyTwo.bid.submitted": {
      const nextState: FortyTwoBiddingPhaseState = {
        ...createStateBase(state, "bidding", event.serverCreatedAt),
        bidding: event.event.payload.bidding,
        hands: getHandsForEvent(state, event)
      };

      return nextState;
    }

    case "fortyTwo.bidding.completed": {
      const nextState: FortyTwoTrumpPhaseState = {
        ...createStateBase(state, "trump", event.serverCreatedAt),
        bidding: event.event.payload.bidding,
        hands: getHandsForEvent(state, event),
        trump: event.event.payload.trump
      };

      return nextState;
    }

    case "fortyTwo.trump.called": {
      const currentState = assertTrumpStateForEvent(state, event);
      const nextState: FortyTwoTrickPlayState = {
        ...createStateBase(state, "trickPlay", event.serverCreatedAt),
        bidding: currentState.bidding,
        completedTricks: [],
        contract: event.event.payload.contract,
        currentTrick: event.event.payload.currentTrick,
        hands: currentState.hands
      };

      return nextState;
    }

    case "fortyTwo.domino.played": {
      const currentState = assertTrickPlayStateForEvent(state, event);
      const nextState: FortyTwoTrickPlayState = {
        ...createStateBase(state, "trickPlay", event.serverCreatedAt),
        bidding: currentState.bidding,
        completedTricks: currentState.completedTricks,
        contract: currentState.contract,
        currentTrick: event.event.payload.currentTrick,
        hands: event.event.payload.hands
      };

      return nextState;
    }

    case "fortyTwo.trick.completed": {
      const currentState = assertTrickPlayStateForEvent(state, event);
      const nextState: FortyTwoTrickPlayState = {
        ...createStateBase(state, "trickPlay", event.serverCreatedAt),
        bidding: currentState.bidding,
        completedTricks: [
          ...currentState.completedTricks,
          event.event.payload.completedTrick
        ],
        contract: currentState.contract,
        currentTrick: event.event.payload.currentTrick,
        hands: currentState.hands
      };

      return nextState;
    }

    case "fortyTwo.hand.completed": {
      const nextState: FortyTwoHandCompleteState = {
        ...createStateBase(state, "handComplete", event.serverCreatedAt, {
          marks: addMarks(state.marks, event.event.payload.handScore.markAwards)
        }),
        completedTricks: event.event.payload.completedTricks,
        handScore: event.event.payload.handScore
      };

      return nextState;
    }

    case "fortyTwo.game.completed": {
      const nextState: FortyTwoGameCompleteState = {
        ...createStateBase(state, "gameComplete", event.serverCreatedAt),
        completedAt: event.event.payload.completedAt,
        winningTeamId: event.event.payload.winningTeamId
      };

      return nextState;
    }
  }
}

function assertEventCanApply(
  snapshot: FortyTwoSnapshotEnvelope,
  event: FortyTwoEventEnvelope
): void {
  if (event.schemaVersion !== FORTY_TWO_EVENT_SCHEMA_VERSION) {
    throw new EngineError(
      "SCHEMA_VERSION_UNSUPPORTED",
      "Unsupported Forty Two event schema version."
    );
  }

  if (event.gameId !== snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Event belongs to a different game.");
  }

  if (event.sequence !== snapshot.lastEventSequence + 1) {
    throw new EngineError(
      "STALE_ACTION",
      "Event sequence must advance the snapshot by exactly one."
    );
  }
}

function createStateBase<TPhase extends FortyTwoPhase>(
  state: FortyTwoState,
  phase: TPhase,
  updatedAt: string,
  overrides: Partial<Pick<FortyTwoStateBase<TPhase>, "marks">> = {}
): FortyTwoStateBase<TPhase> {
  return {
    createdAt: state.createdAt,
    dealer: state.dealer,
    gameId: state.gameId,
    handNumber: state.handNumber,
    marks: overrides.marks ?? state.marks,
    mode: state.mode,
    phase,
    players: state.players,
    rules: state.rules,
    schemaVersion: state.schemaVersion,
    teams: state.teams,
    updatedAt
  };
}

function getHandsForEvent(
  state: FortyTwoState,
  event: FortyTwoEventEnvelope
): FortyTwoDealtState["hands"] {
  if ("hands" in state) {
    return state.hands;
  }

  throw new EngineError(
    "INVALID_PHASE",
    `Cannot apply ${event.event.type} without dealt hands.`
  );
}

function assertTrumpStateForEvent(
  state: FortyTwoState,
  event: FortyTwoEventEnvelope
): FortyTwoTrumpPhaseState {
  if (state.phase === "trump") {
    return state;
  }

  throw new EngineError(
    "INVALID_PHASE",
    `Cannot apply ${event.event.type} outside trump phase.`
  );
}

function assertTrickPlayStateForEvent(
  state: FortyTwoState,
  event: FortyTwoEventEnvelope
): FortyTwoTrickPlayState {
  if (state.phase === "trickPlay") {
    return state;
  }

  throw new EngineError(
    "INVALID_PHASE",
    `Cannot apply ${event.event.type} outside trick play phase.`
  );
}

function addMarks(
  currentMarks: FortyTwoMarks,
  awardedMarks: FortyTwoMarks
): FortyTwoMarks {
  return {
    teamA: currentMarks.teamA + awardedMarks.teamA,
    teamB: currentMarks.teamB + awardedMarks.teamB
  };
}
