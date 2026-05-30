import {
  getEngineId,
  getEngineTimestamp,
  type EngineContext
} from "../context.ts";
import { type Domino } from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import { type BidCall } from "../forty-two/bidding.ts";
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
} from "../forty-two/actions.ts";
import {
  type FortyTwoCommandResult,
  handleCallFortyTwoTrumpCommand,
  handleCompleteFortyTwoBiddingCommand,
  handleCreateFortyTwoGameCommand,
  handleDealFortyTwoHandCommand,
  handlePlayFortyTwoDominoCommand,
  handleSubmitFortyTwoBidCommand
} from "../forty-two/commands.ts";
import { type FortyTwoEvent, type FortyTwoEventEnvelope } from "../forty-two/events.ts";
import {
  getLegalBidOptions,
  getLegalDominoPlays,
  getLegalTrumpSuits,
  type LegalBidOption,
  type LegalDominoPlay
} from "../forty-two/legal-actions.ts";
import { type RuleConfig, standardRules } from "../forty-two/rules-config.ts";
import { type CompletedTrick, type HandScore } from "../forty-two/scoring.ts";
import {
  SEAT_INDICES,
  type SeatIndex
} from "../forty-two/seats.ts";
import {
  createInitialFortyTwoSnapshot,
  type FortyTwoSnapshotEnvelope
} from "../forty-two/state.ts";
import {
  getExpectedTrickSeat,
  type DominoSuit
} from "../forty-two/tricks.ts";
import { type TrumpSuit } from "../forty-two/trump.ts";
import { chooseLegalRandomBotDecision } from "../bots/legal-random.ts";

export type LocalGameView =
  | {
      readonly kind: "bidding";
      readonly legalBids: readonly LegalBidOption[];
      readonly seat: SeatIndex;
    }
  | {
      readonly kind: "trumpSelection";
      readonly legalTrumpSuits: readonly TrumpSuit[];
      readonly seat: SeatIndex;
    }
  | {
      readonly kind: "trickPlay";
      readonly legalPlays: readonly LegalDominoPlay[];
      readonly seat: SeatIndex;
    }
  | {
      readonly kind: "handSummary";
      readonly summary: LocalHandSummary;
    }
  | {
      readonly kind: "gameSummary";
      readonly summary: LocalGameSummary;
    }
  | {
      readonly kind: "waiting";
    };

export interface LocalHandSummary {
  readonly completedTricks: readonly CompletedTrick[];
  readonly handNumber: number;
  readonly handScore: HandScore;
}

export interface LocalGameSummary {
  readonly completedAt: string;
  readonly winningTeamId: "teamA" | "teamB";
}

export interface LocalGameSession {
  readonly botSeats: readonly SeatIndex[];
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly humanSeat: SeatIndex;
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
  readonly lastHandSummary: LocalHandSummary | null;
  readonly snapshot: FortyTwoSnapshotEnvelope;
}

export interface CreateLocalGameSessionInput {
  readonly dealer?: SeatIndex;
  readonly gameId?: string;
  readonly humanSeat?: SeatIndex;
  readonly playerNames?: Partial<Record<SeatIndex, string>>;
  readonly rules?: RuleConfig;
  readonly targetMarks?: number;
  readonly teamNames?: {
    readonly teamA?: string;
    readonly teamB?: string;
  };
}

export function createLocalGameSession(
  input: CreateLocalGameSessionInput,
  context: EngineContext
): LocalGameSession {
  const humanSeat = input.humanSeat ?? 0;
  const rules = input.rules ?? {
    ...standardRules,
    ...(input.targetMarks !== undefined ? { targetMarks: input.targetMarks } : {})
  };
  const gameId = input.gameId ?? getEngineId(context);
  const initialSnapshot = createInitialFortyTwoSnapshot(
    {
      dealer: input.dealer ?? 0,
      gameId,
      playerNames: createDefaultPlayerNames(input.playerNames),
      rules,
      ...(input.teamNames ? { teamNames: input.teamNames } : {})
    },
    {
      newId: () => gameId,
      now: () => getEngineTimestamp(context)
    }
  );
  const created = unwrapCommandResult(
    handleCreateFortyTwoGameCommand(
      createActionEnvelope<CreateFortyTwoGameAction>(
        {
          payload: {
            dealer: input.dealer ?? 0,
            playerNames: createDefaultPlayerNames(input.playerNames),
            rules,
            ...(input.teamNames ? { teamNames: input.teamNames } : {})
          },
          type: "fortyTwo.game.create"
        },
        gameId,
        context
      ),
      context
    )
  );
  const session: LocalGameSession = {
    botSeats: SEAT_INDICES.filter((seat) => seat !== humanSeat),
    events: created.events,
    humanSeat,
    initialSnapshot,
    lastHandSummary: null,
    snapshot: created.snapshot
  };

  return advanceLocalGameSession(session, context);
}

export function restartLocalGameSession(
  session: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  return createLocalGameSession(
    {
      dealer: 0,
      humanSeat: session.humanSeat,
      rules: session.snapshot.snapshot.rules
    },
    context
  );
}

export function continueLocalGameSession(
  session: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  return advanceLocalGameSession(
    {
      ...session,
      lastHandSummary: null
    },
    context
  );
}

export function submitLocalGameBid(
  session: LocalGameSession,
  bid: BidCall,
  context: EngineContext
): LocalGameSession {
  assertHumanView(session, "bidding");
  return advanceLocalGameSession(
    applyCommandResult(
      session,
      handleSubmitFortyTwoBidCommand(
        session.snapshot,
        createActionEnvelope<SubmitFortyTwoBidAction>(
          {
            payload: {
              bid,
              seat: session.humanSeat
            },
            type: "fortyTwo.bid.submit"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          session.humanSeat
        ),
        context
      )
    ),
    context
  );
}

export function callLocalGameTrump(
  session: LocalGameSession,
  trumpSuit: TrumpSuit,
  context: EngineContext
): LocalGameSession {
  assertHumanView(session, "trumpSelection");
  return advanceLocalGameSession(
    applyCommandResult(
      session,
      handleCallFortyTwoTrumpCommand(
        session.snapshot,
        createActionEnvelope<CallFortyTwoTrumpAction>(
          {
            payload: {
              trumpSuit
            },
            type: "fortyTwo.trump.call"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          session.humanSeat
        ),
        context
      )
    ),
    context
  );
}

export function playLocalGameDomino(
  session: LocalGameSession,
  play: Omit<LegalDominoPlay, "seat"> | LegalDominoPlay,
  context: EngineContext
): LocalGameSession {
  assertHumanView(session, "trickPlay");
  return advanceLocalGameSession(
    applyCommandResult(
      session,
      handlePlayFortyTwoDominoCommand(
        session.snapshot,
        createActionEnvelope<PlayFortyTwoDominoAction>(
          {
            payload: {
              domino: play.domino,
              ...(play.ledSuit ? { ledSuit: play.ledSuit } : {}),
              seat: session.humanSeat
            },
            type: "fortyTwo.domino.play"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          session.humanSeat
        ),
        context
      )
    ),
    context
  );
}

export function getLocalGameView(session: LocalGameSession): LocalGameView {
  if (session.snapshot.snapshot.phase === "gameComplete") {
    return {
      kind: "gameSummary",
      summary: {
        completedAt: session.snapshot.snapshot.completedAt,
        winningTeamId: session.snapshot.snapshot.winningTeamId
      }
    };
  }

  if (session.lastHandSummary) {
    return {
      kind: "handSummary",
      summary: session.lastHandSummary
    };
  }

  if (session.snapshot.snapshot.phase === "dealt" || session.snapshot.snapshot.phase === "bidding") {
    const legalBids = getLegalBidOptions(session.snapshot, session.humanSeat);

    if (legalBids.length > 0) {
      return {
        kind: "bidding",
        legalBids,
        seat: session.humanSeat
      };
    }
  }

  if (session.snapshot.snapshot.phase === "trump") {
    const legalTrumpSuits = getLegalTrumpSuits(session.snapshot, session.humanSeat);

    if (legalTrumpSuits.length > 0) {
      return {
        kind: "trumpSelection",
        legalTrumpSuits,
        seat: session.humanSeat
      };
    }
  }

  if (session.snapshot.snapshot.phase === "trickPlay") {
    const legalPlays = getLegalDominoPlays(session.snapshot, session.humanSeat);

    if (legalPlays.length > 0) {
      return {
        kind: "trickPlay",
        legalPlays,
        seat: session.humanSeat
      };
    }
  }

  return {
    kind: "waiting"
  };
}

export function chooseFirstLegalHumanAction(
  session: LocalGameSession
):
  | { readonly kind: "bid"; readonly bid: BidCall }
  | { readonly kind: "callTrump"; readonly trumpSuit: TrumpSuit }
  | { readonly kind: "playDomino"; readonly play: LegalDominoPlay }
  | { readonly kind: "continue" }
  | { readonly kind: "none" } {
  const view = getLocalGameView(session);

  if (view.kind === "bidding") {
    return {
      bid: view.legalBids[0]?.bid ?? { kind: "pass" },
      kind: "bid"
    };
  }

  if (view.kind === "trumpSelection") {
    const trumpSuit = view.legalTrumpSuits[0];

    if (!trumpSuit) {
      return { kind: "none" };
    }

    return {
      kind: "callTrump",
      trumpSuit
    };
  }

  if (view.kind === "trickPlay") {
    const play = view.legalPlays[0];

    if (!play) {
      return { kind: "none" };
    }

    return {
      kind: "playDomino",
      play
    };
  }

  if (view.kind === "handSummary") {
    return {
      kind: "continue"
    };
  }

  return {
    kind: "none"
  };
}

export function applyLocalHumanAction(
  session: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  const action = chooseFirstLegalHumanAction(session);

  switch (action.kind) {
    case "bid":
      return submitLocalGameBid(session, action.bid, context);
    case "callTrump":
      return callLocalGameTrump(session, action.trumpSuit, context);
    case "playDomino":
      return playLocalGameDomino(session, action.play, context);
    case "continue":
      return continueLocalGameSession(session, context);
    case "none":
      return session;
  }
}

function advanceLocalGameSession(
  session: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  let currentSession = session;

  for (let step = 0; step < 500; step += 1) {
    if (
      currentSession.lastHandSummary ||
      currentSession.snapshot.snapshot.phase === "gameComplete"
    ) {
      return currentSession;
    }

    const nextSession = advanceOneAutomaticStep(currentSession, context);

    if (nextSession === currentSession) {
      return currentSession;
    }

    currentSession = nextSession;
  }

  throw new EngineError("INVALID_PHASE", "Local game session could not settle.");
}

function advanceOneAutomaticStep(
  session: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  const state = session.snapshot.snapshot;

  if (state.phase === "setup") {
    return applyCommandResult(
      session,
      handleDealFortyTwoHandCommand(
        session.snapshot,
        createActionEnvelope<DealFortyTwoHandAction>(
          {
            payload: {
              dealer: state.dealer,
              handNumber: state.handNumber
            },
            type: "fortyTwo.hand.deal"
          },
          session.snapshot.gameId,
          context,
          session.snapshot
        ),
        context
      )
    );
  }

  if (state.phase === "bidding" && state.bidding.status === "complete") {
    return applyCommandResult(
      session,
      handleCompleteFortyTwoBiddingCommand(
        session.snapshot,
        createActionEnvelope<CompleteFortyTwoBiddingAction>(
          {
            payload: {},
            type: "fortyTwo.bidding.complete"
          },
          session.snapshot.gameId,
          context,
          session.snapshot
        ),
        context
      )
    );
  }

  if (state.phase === "dealt" || state.phase === "bidding") {
    const currentSeat = state.phase === "bidding"
      ? state.bidding.currentSeat
      : getNextSeat(state.dealer);

    if (currentSeat === null || currentSeat === session.humanSeat) {
      return session;
    }

    const decision = chooseLegalRandomBotDecision({
      context,
      seat: currentSeat,
      snapshot: session.snapshot
    });

    if (decision.kind !== "bid") {
      throw new EngineError("INVALID_ACTION", "Expected bot bid decision.");
    }

    return applyCommandResult(
      session,
      handleSubmitFortyTwoBidCommand(
        session.snapshot,
        createActionEnvelope<SubmitFortyTwoBidAction>(
          {
            payload: {
              bid: decision.bid,
              seat: currentSeat
            },
            type: "fortyTwo.bid.submit"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          currentSeat
        ),
        context
      )
    );
  }

  if (state.phase === "trump") {
    if (state.trump.declarer === session.humanSeat) {
      return session;
    }

    const decision = chooseLegalRandomBotDecision({
      context,
      seat: state.trump.declarer,
      snapshot: session.snapshot
    });

    if (decision.kind !== "callTrump") {
      throw new EngineError("INVALID_ACTION", "Expected bot trump decision.");
    }

    return applyCommandResult(
      session,
      handleCallFortyTwoTrumpCommand(
        session.snapshot,
        createActionEnvelope<CallFortyTwoTrumpAction>(
          {
            payload: {
              trumpSuit: decision.trumpSuit
            },
            type: "fortyTwo.trump.call"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          state.trump.declarer
        ),
        context
      )
    );
  }

  if (state.phase === "trickPlay") {
    const seat = getExpectedTrickSeat(state.currentTrick);

    if (seat === session.humanSeat) {
      return session;
    }

    const decision = chooseLegalRandomBotDecision({
      context,
      seat,
      snapshot: session.snapshot
    });

    if (decision.kind !== "playDomino") {
      throw new EngineError("INVALID_ACTION", "Expected bot play decision.");
    }

    return applyCommandResult(
      session,
      handlePlayFortyTwoDominoCommand(
        session.snapshot,
        createActionEnvelope<PlayFortyTwoDominoAction>(
          {
            payload: {
              domino: decision.play.domino,
              ...(decision.play.ledSuit ? { ledSuit: decision.play.ledSuit } : {}),
              seat
            },
            type: "fortyTwo.domino.play"
          },
          session.snapshot.gameId,
          context,
          session.snapshot,
          seat
        ),
        context
      )
    );
  }

  return session;
}

function applyCommandResult<TEvent extends FortyTwoEvent>(
  session: LocalGameSession,
  result: FortyTwoCommandResult<TEvent>
): LocalGameSession {
  const success = unwrapCommandResult(result);
  const events: readonly FortyTwoEventEnvelope[] = success.events;
  const handCompletedEvent = events.find(
    (event): event is FortyTwoEventEnvelope<Extract<
      FortyTwoEvent,
      { readonly type: "fortyTwo.hand.completed" }
    >> => event.event.type === "fortyTwo.hand.completed"
  );

  return {
    ...session,
    events: [
      ...session.events,
      ...success.events
    ],
    lastHandSummary: handCompletedEvent
      ? {
          completedTricks: handCompletedEvent.event.payload.completedTricks,
          handNumber: session.snapshot.snapshot.handNumber,
          handScore: handCompletedEvent.event.payload.handScore
        }
      : session.lastHandSummary,
    snapshot: success.snapshot
  };
}

function assertHumanView(
  session: LocalGameSession,
  expectedKind: LocalGameView["kind"]
): void {
  const view = getLocalGameView(session);

  if (view.kind !== expectedKind) {
    throw new EngineError("INVALID_PHASE", `Expected ${expectedKind} human action.`);
  }
}

function createActionEnvelope<TAction extends FortyTwoAction>(
  action: TAction,
  gameId: string,
  context: Pick<EngineContext, "newId" | "now">,
  snapshot?: FortyTwoSnapshotEnvelope,
  actorSeat?: SeatIndex
): FortyTwoActionEnvelope<TAction> {
  return {
    action,
    actionId: getEngineId(context),
    actorId: actorSeat === undefined ? "local-system" : `seat-${actorSeat}`,
    ...(actorSeat !== undefined ? { actorSeat } : {}),
    clientCreatedAt: getEngineTimestamp(context),
    gameId,
    ...(snapshot
      ? {
          knownLastEventSequence: snapshot.lastEventSequence,
          knownSnapshotVersion: snapshot.snapshotVersion
        }
      : {}),
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  };
}

function createDefaultPlayerNames(
  playerNames: Partial<Record<SeatIndex, string>> | undefined
): Partial<Record<SeatIndex, string>> {
  return {
    0: playerNames?.[0] ?? "You",
    1: playerNames?.[1] ?? "Bot East",
    2: playerNames?.[2] ?? "Bot South",
    3: playerNames?.[3] ?? "Bot West"
  };
}

function unwrapCommandResult<TEvent extends FortyTwoEvent>(
  result: FortyTwoCommandResult<TEvent>
): Extract<FortyTwoCommandResult<TEvent>, { readonly ok: true }> {
  if (!result.ok) {
    throw result.error;
  }

  return result;
}

function getNextSeat(seat: SeatIndex): SeatIndex {
  return ((seat + 1) % 4) as SeatIndex;
}
