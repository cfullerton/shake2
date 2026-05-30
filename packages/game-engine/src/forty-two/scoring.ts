import {
  getDominoKey,
  type Domino,
  type DominoKey
} from "../dominoes/domino.ts";
import {
  getDominoCountPoints,
  getTotalCountPoints
} from "../dominoes/scoring.ts";
import {
  createDoubleSixSet,
  DOUBLE_SIX_DOMINO_COUNT
} from "../dominoes/set.ts";
import { EngineError } from "../errors.ts";
import { standardRules } from "./rules-config.ts";
import {
  FORTY_TWO_TEAM_IDS,
  getTeamForSeat,
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import {
  isTrickComplete,
  TRICK_PLAY_COUNT,
  type Trick
} from "./tricks.ts";
import { type WinningBid } from "./bidding.ts";

export const FORTY_TWO_TRICKS_PER_HAND = standardRules.table.tricksPerHand;
export const FORTY_TWO_TRICK_POINT_VALUE = standardRules.scoring.trickPointValue;
export const FORTY_TWO_HAND_TOTAL_POINTS = standardRules.scoring.handTotalPoints;

export type BidOutcome = "made" | "set";
export type TeamPointTotals = Readonly<Record<FortyTwoTeamId, number>>;
export type TeamMarkAwards = Readonly<Record<FortyTwoTeamId, number>>;

export interface CompletedTrick {
  readonly trick: Trick;
  readonly winner: SeatIndex;
}

export interface CompletedTrickScore {
  readonly capturedDominoes: readonly Domino[];
  readonly countPoints: number;
  readonly totalPoints: number;
  readonly trick: Trick;
  readonly trickPoints: number;
  readonly winner: SeatIndex;
  readonly winningTeamId: FortyTwoTeamId;
}

export interface HandScore {
  readonly bidAmount: number;
  readonly biddingTeamId: FortyTwoTeamId;
  readonly biddingTeamPoints: number;
  readonly markAwards: TeamMarkAwards;
  readonly outcome: BidOutcome;
  readonly teamPoints: TeamPointTotals;
  readonly teamTrickCounts: TeamPointTotals;
  readonly totalPoints: number;
  readonly trickScores: readonly CompletedTrickScore[];
  readonly tricksByTeam: Readonly<Record<FortyTwoTeamId, readonly CompletedTrickScore[]>>;
}

export interface CurrentHandPointScore {
  readonly teamPoints: TeamPointTotals;
  readonly teamTrickCounts: TeamPointTotals;
  readonly totalPoints: number;
  readonly trickScores: readonly CompletedTrickScore[];
  readonly tricksByTeam: Readonly<Record<FortyTwoTeamId, readonly CompletedTrickScore[]>>;
}

export function scoreCompletedTrick(
  completedTrick: CompletedTrick
): CompletedTrickScore {
  assertCompletedTrick(completedTrick);

  const capturedDominoes = completedTrick.trick.playedDominoes.map(
    (play) => play.domino
  );
  const countPoints = getTotalCountPoints(capturedDominoes);

  return {
    capturedDominoes,
    countPoints,
    totalPoints: FORTY_TWO_TRICK_POINT_VALUE + countPoints,
    trick: completedTrick.trick,
    trickPoints: FORTY_TWO_TRICK_POINT_VALUE,
    winner: completedTrick.winner,
    winningTeamId: getTeamForSeat(completedTrick.winner)
  };
}

export function scoreCompletedTricks(
  completedTricks: readonly CompletedTrick[]
): CurrentHandPointScore {
  const trickScores = completedTricks.map(scoreCompletedTrick);
  const teamPoints = createEmptyTeamTotals();
  const teamTrickCounts = createEmptyTeamTotals();
  const tricksByTeam: Record<FortyTwoTeamId, CompletedTrickScore[]> = {
    teamA: [],
    teamB: []
  };

  for (const trickScore of trickScores) {
    teamPoints[trickScore.winningTeamId] += trickScore.totalPoints;
    teamTrickCounts[trickScore.winningTeamId] += 1;
    tricksByTeam[trickScore.winningTeamId].push(trickScore);
  }

  return {
    teamPoints,
    teamTrickCounts,
    totalPoints: sumTeamTotals(teamPoints),
    trickScores,
    tricksByTeam
  };
}

export function scoreCompletedHand(
  completedTricks: readonly CompletedTrick[],
  winningBid: WinningBid
): HandScore {
  if (completedTricks.length !== FORTY_TWO_TRICKS_PER_HAND) {
    throw new EngineError(
      "INVALID_PHASE",
      `A completed hand must have ${FORTY_TWO_TRICKS_PER_HAND} tricks.`
    );
  }

  const currentScore = scoreCompletedTricks(completedTricks);
  assertCompleteHandDominoes(currentScore.trickScores);

  if (currentScore.totalPoints !== FORTY_TWO_HAND_TOTAL_POINTS) {
    throw new EngineError(
      "INVALID_DOMINO",
      `A completed hand must total ${FORTY_TWO_HAND_TOTAL_POINTS} points.`
    );
  }

  const biddingTeamId = getTeamForSeat(winningBid.seat);
  const biddingTeamPoints = currentScore.teamPoints[biddingTeamId];
  const outcome: BidOutcome =
    biddingTeamPoints >= winningBid.bid.amount ? "made" : "set";

  return {
    bidAmount: winningBid.bid.amount,
    biddingTeamId,
    biddingTeamPoints,
    markAwards: getMarkAwards(biddingTeamId, outcome),
    outcome,
    teamPoints: currentScore.teamPoints,
    teamTrickCounts: currentScore.teamTrickCounts,
    totalPoints: currentScore.totalPoints,
    trickScores: currentScore.trickScores,
    tricksByTeam: currentScore.tricksByTeam
  };
}

export function getCompletedTrickCountPoints(
  completedTrick: CompletedTrick
): number {
  return completedTrick.trick.playedDominoes.reduce(
    (total, play) => total + getDominoCountPoints(play.domino),
    0
  );
}

function assertCompletedTrick(completedTrick: CompletedTrick): void {
  if (!isTrickComplete(completedTrick.trick)) {
    throw new EngineError("INVALID_PHASE", "Scoring requires a completed trick.");
  }

  if (
    completedTrick.trick.ledDomino === null ||
    completedTrick.trick.ledSuit === null
  ) {
    throw new EngineError("INVALID_PHASE", "Completed trick is missing lead data.");
  }

  const playedSeats = new Set<SeatIndex>();
  let winnerPlayed = false;

  for (const play of completedTrick.trick.playedDominoes) {
    playedSeats.add(play.seat);

    if (play.seat === completedTrick.winner) {
      winnerPlayed = true;
    }
  }

  if (playedSeats.size !== TRICK_PLAY_COUNT) {
    throw new EngineError(
      "INVALID_SEAT",
      `A completed trick must include ${TRICK_PLAY_COUNT} distinct seats.`
    );
  }

  if (!winnerPlayed) {
    throw new EngineError("INVALID_SEAT", "Trick winner must have played in the trick.");
  }
}

function assertCompleteHandDominoes(
  trickScores: readonly CompletedTrickScore[]
): void {
  const capturedDominoKeys = trickScores.flatMap((trickScore) =>
    trickScore.capturedDominoes.map(getDominoKey)
  );

  if (capturedDominoKeys.length !== DOUBLE_SIX_DOMINO_COUNT) {
    throw new EngineError(
      "INVALID_DOMINO",
      `A completed hand must contain ${DOUBLE_SIX_DOMINO_COUNT} dominoes.`
    );
  }

  const uniqueCapturedDominoKeys = new Set(capturedDominoKeys);

  if (uniqueCapturedDominoKeys.size !== DOUBLE_SIX_DOMINO_COUNT) {
    throw new EngineError(
      "INVALID_DOMINO",
      "A completed hand cannot contain duplicate dominoes."
    );
  }

  const expectedDominoKeys = new Set<DominoKey>(
    createDoubleSixSet().map(getDominoKey)
  );

  for (const dominoKey of uniqueCapturedDominoKeys) {
    if (!expectedDominoKeys.has(dominoKey)) {
      throw new EngineError(
        "INVALID_DOMINO",
        `Unexpected domino in completed hand: ${dominoKey}.`
      );
    }
  }
}

function getMarkAwards(
  biddingTeamId: FortyTwoTeamId,
  outcome: BidOutcome
): TeamMarkAwards {
  const markAwards = createEmptyTeamTotals();
  const awardedTeamId =
    outcome === "made" ? biddingTeamId : getOpposingTeamId(biddingTeamId);

  markAwards[awardedTeamId] = 1;
  return markAwards;
}

function getOpposingTeamId(teamId: FortyTwoTeamId): FortyTwoTeamId {
  return teamId === "teamA" ? "teamB" : "teamA";
}

function createEmptyTeamTotals(): Record<FortyTwoTeamId, number> {
  return {
    teamA: 0,
    teamB: 0
  };
}

function sumTeamTotals(teamTotals: TeamPointTotals): number {
  return FORTY_TWO_TEAM_IDS.reduce(
    (total, teamId) => total + teamTotals[teamId],
    0
  );
}
