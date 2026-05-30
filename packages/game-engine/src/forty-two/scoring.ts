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
import {
  standardRules,
  type RuleConfig
} from "./rules-config.ts";
import {
  FORTY_TWO_TEAM_IDS,
  getTeamForSeat,
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import {
  type Contract
} from "./trump.ts";
import {
  isTrickComplete,
  TRICK_PLAY_COUNT,
  type Trick
} from "./tricks.ts";
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
  readonly declarer: SeatIndex;
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
  contract: Contract,
  rules: RuleConfig
): HandScore {
  if (completedTricks.length !== rules.table.tricksPerHand) {
    throw new EngineError(
      "INVALID_PHASE",
      `A completed hand must have ${rules.table.tricksPerHand} tricks.`
    );
  }

  const currentScore = scoreCompletedTricks(completedTricks);
  assertCompleteHandDominoes(currentScore.trickScores);

  if (currentScore.totalPoints !== rules.scoring.handTotalPoints) {
    throw new EngineError(
      "INVALID_DOMINO",
      `A completed hand must total ${rules.scoring.handTotalPoints} points.`
    );
  }

  const biddingTeamId = getTeamForSeat(contract.declarer);
  const biddingTeamPoints = currentScore.teamPoints[biddingTeamId];
  const bidAmount = getContractBidAmount(contract);
  const outcome: BidOutcome = biddingTeamPoints >= bidAmount ? "made" : "set";

  return {
    bidAmount,
    biddingTeamId,
    biddingTeamPoints,
    declarer: contract.declarer,
    markAwards: getContractMarkAwards(contract, biddingTeamId, outcome),
    outcome,
    teamPoints: currentScore.teamPoints,
    teamTrickCounts: currentScore.teamTrickCounts,
    totalPoints: currentScore.totalPoints,
    trickScores: currentScore.trickScores,
    tricksByTeam: currentScore.tricksByTeam
  };
}

export function getContractMarkAwards(
  contract: Contract,
  biddingTeamId: FortyTwoTeamId,
  outcome: BidOutcome
): TeamMarkAwards {
  switch (contract.kind) {
    case "standardNumeric":
      return getStandardNumericMarkAwards(biddingTeamId, outcome);
  }
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

function getStandardNumericMarkAwards(
  biddingTeamId: FortyTwoTeamId,
  outcome: BidOutcome
): TeamMarkAwards {
  const markAwards = createEmptyTeamTotals();
  const awardedTeamId =
    outcome === "made" ? biddingTeamId : getOpposingTeamId(biddingTeamId);

  markAwards[awardedTeamId] = 1;
  return markAwards;
}

function getContractBidAmount(contract: Contract): number {
  switch (contract.kind) {
    case "standardNumeric":
      return contract.bid.amount;
  }
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
