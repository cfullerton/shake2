import {
  getEngineId,
  getEngineTimestamp,
  type EngineContext
} from "../context.ts";
import {
  type BiddingState
} from "./bidding.ts";
import {
  type FortyTwoHands
} from "./deal.ts";
import {
  FORTY_TWO_TEAMS,
  assertSeatIndex,
  type FortyTwoTeam,
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import {
  standardRules,
  type RuleConfig
} from "./rules-config.ts";
import {
  type CompletedTrick,
  type HandScore,
  type TeamMarkAwards
} from "./scoring.ts";
import {
  type Trick
} from "./tricks.ts";
import {
  type StandardNumericContract,
  type TrumpCallState
} from "./trump.ts";

export const FORTY_TWO_STATE_SCHEMA_VERSION = 1;
export const FORTY_TWO_SNAPSHOT_SCHEMA_VERSION = 1;
export const FORTY_TWO_INITIAL_SNAPSHOT_VERSION = 0;
export const FORTY_TWO_INITIAL_EVENT_SEQUENCE = 0;

export const FORTY_TWO_PHASES = [
  "setup",
  "dealt",
  "bidding",
  "trump",
  "trickPlay",
  "handComplete",
  "gameComplete"
] as const;

export type FortyTwoPhase = (typeof FORTY_TWO_PHASES)[number];
export type FortyTwoGameMode = "localPractice";

export interface FortyTwoPlayer {
  readonly name: string;
  readonly seat: SeatIndex;
}

export type FortyTwoPlayers = Readonly<Record<SeatIndex, FortyTwoPlayer>>;
export type FortyTwoTeams = Readonly<Record<FortyTwoTeamId, FortyTwoTeam>>;
export type FortyTwoMarks = TeamMarkAwards;

export interface FortyTwoStateBase<TPhase extends FortyTwoPhase> {
  readonly createdAt: string;
  readonly dealer: SeatIndex;
  readonly gameId: string;
  readonly handNumber: number;
  readonly marks: FortyTwoMarks;
  readonly mode: FortyTwoGameMode;
  readonly phase: TPhase;
  readonly players: FortyTwoPlayers;
  readonly rules: RuleConfig;
  readonly schemaVersion: typeof FORTY_TWO_STATE_SCHEMA_VERSION;
  readonly teams: FortyTwoTeams;
  readonly updatedAt: string;
}

export interface FortyTwoSetupState extends FortyTwoStateBase<"setup"> {}

export interface FortyTwoDealtState extends FortyTwoStateBase<"dealt"> {
  readonly hands: FortyTwoHands;
}

export interface FortyTwoBiddingPhaseState extends FortyTwoStateBase<"bidding"> {
  readonly bidding: BiddingState;
  readonly hands: FortyTwoHands;
}

export interface FortyTwoTrumpPhaseState extends FortyTwoStateBase<"trump"> {
  readonly bidding: BiddingState;
  readonly hands: FortyTwoHands;
  readonly trump: TrumpCallState;
}

export interface FortyTwoTrickPlayState extends FortyTwoStateBase<"trickPlay"> {
  readonly bidding: BiddingState;
  readonly completedTricks: readonly CompletedTrick[];
  readonly contract: StandardNumericContract;
  readonly currentTrick: Trick;
  readonly hands: FortyTwoHands;
}

export interface FortyTwoHandCompleteState extends FortyTwoStateBase<"handComplete"> {
  readonly completedTricks: readonly CompletedTrick[];
  readonly handScore: HandScore;
}

export interface FortyTwoGameCompleteState extends FortyTwoStateBase<"gameComplete"> {
  readonly completedAt: string;
  readonly winningTeamId: FortyTwoTeamId;
}

export type FortyTwoState =
  | FortyTwoSetupState
  | FortyTwoDealtState
  | FortyTwoBiddingPhaseState
  | FortyTwoTrumpPhaseState
  | FortyTwoTrickPlayState
  | FortyTwoHandCompleteState
  | FortyTwoGameCompleteState;

export interface FortyTwoSnapshotEnvelope {
  readonly gameId: string;
  readonly generatedAt: string;
  readonly lastEventSequence: number;
  readonly schemaVersion: typeof FORTY_TWO_SNAPSHOT_SCHEMA_VERSION;
  readonly snapshot: FortyTwoState;
  readonly snapshotVersion: number;
}

export interface CreateInitialFortyTwoSnapshotInput {
  readonly dealer: SeatIndex;
  readonly gameId?: string;
  readonly playerNames?: Partial<Record<SeatIndex, string>>;
  readonly rules?: RuleConfig;
  readonly teamNames?: Partial<Record<FortyTwoTeamId, string>>;
}

export function createInitialFortyTwoSnapshot(
  input: CreateInitialFortyTwoSnapshotInput,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoSnapshotEnvelope {
  assertSeatIndex(input.dealer);

  const generatedAt = getEngineTimestamp(context);
  const gameId = input.gameId ?? getEngineId(context);
  const rules = input.rules ?? standardRules;
  const state: FortyTwoSetupState = {
    createdAt: generatedAt,
    dealer: input.dealer,
    gameId,
    handNumber: 1,
    marks: createEmptyMarks(),
    mode: "localPractice",
    phase: "setup",
    players: createPlayers(input.playerNames),
    rules,
    schemaVersion: FORTY_TWO_STATE_SCHEMA_VERSION,
    teams: createTeams(input.teamNames),
    updatedAt: generatedAt
  };

  return {
    gameId,
    generatedAt,
    lastEventSequence: FORTY_TWO_INITIAL_EVENT_SEQUENCE,
    schemaVersion: FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
    snapshot: state,
    snapshotVersion: FORTY_TWO_INITIAL_SNAPSHOT_VERSION
  };
}

function createEmptyMarks(): FortyTwoMarks {
  return {
    teamA: 0,
    teamB: 0
  };
}

function createPlayers(
  playerNames: Partial<Record<SeatIndex, string>> | undefined
): FortyTwoPlayers {
  return {
    0: {
      name: playerNames?.[0] ?? "Seat 0",
      seat: 0
    },
    1: {
      name: playerNames?.[1] ?? "Seat 1",
      seat: 1
    },
    2: {
      name: playerNames?.[2] ?? "Seat 2",
      seat: 2
    },
    3: {
      name: playerNames?.[3] ?? "Seat 3",
      seat: 3
    }
  };
}

function createTeams(
  teamNames: Partial<Record<FortyTwoTeamId, string>> | undefined
): FortyTwoTeams {
  return {
    teamA: {
      ...FORTY_TWO_TEAMS.teamA,
      name: teamNames?.teamA ?? FORTY_TWO_TEAMS.teamA.name
    },
    teamB: {
      ...FORTY_TWO_TEAMS.teamB,
      name: teamNames?.teamB ?? FORTY_TWO_TEAMS.teamB.name
    }
  };
}
