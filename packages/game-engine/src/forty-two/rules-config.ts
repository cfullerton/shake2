import { TOTAL_COUNT_DOMINO_POINTS } from "../dominoes/scoring.ts";

export const FORTY_TWO_RULE_SCHEMA_VERSION = 1;

export type FortyTwoScoringMode = "marks";
export type FortyTwoAllPassBehavior = "dealerForcedBid" | "redeal";

export interface FortyTwoEnabledContracts {
  readonly eightyFour: boolean;
  readonly followMe: boolean;
  readonly markBids: boolean;
  readonly nello: boolean;
  readonly plunge: boolean;
  readonly sevens: boolean;
  readonly splash: boolean;
}

export interface FortyTwoTrumpBehavior {
  readonly doublesHigh: boolean;
  readonly trumpDominoBelongsOnlyToTrump: boolean;
}

export interface FortyTwoBiddingRules {
  readonly allPassBehavior: FortyTwoAllPassBehavior;
  readonly maximumNumericBid: number;
  readonly minimumBid: number;
}

export interface FortyTwoTableRules {
  readonly dominoesPerHand: number;
  readonly playerCount: number;
  readonly tricksPerHand: number;
}

export interface FortyTwoScoringRules {
  readonly countDominoPoints: number;
  readonly handTotalPoints: number;
  readonly trickPointValue: number;
}

export interface RuleConfig {
  readonly bidding: FortyTwoBiddingRules;
  readonly enabledContracts: FortyTwoEnabledContracts;
  readonly schemaVersion: typeof FORTY_TWO_RULE_SCHEMA_VERSION;
  readonly scoring: FortyTwoScoringRules;
  readonly scoringMode: FortyTwoScoringMode;
  readonly table: FortyTwoTableRules;
  readonly targetMarks: number;
  readonly trumpBehavior: FortyTwoTrumpBehavior;
}

export const standardRules = {
  bidding: {
    allPassBehavior: "dealerForcedBid",
    maximumNumericBid: 42,
    minimumBid: 30
  },
  enabledContracts: {
    eightyFour: false,
    followMe: false,
    markBids: false,
    nello: false,
    plunge: false,
    sevens: false,
    splash: false
  },
  schemaVersion: FORTY_TWO_RULE_SCHEMA_VERSION,
  scoring: {
    countDominoPoints: TOTAL_COUNT_DOMINO_POINTS,
    handTotalPoints: 42,
    trickPointValue: 1
  },
  scoringMode: "marks",
  table: {
    dominoesPerHand: 7,
    playerCount: 4,
    tricksPerHand: 7
  },
  targetMarks: 7,
  trumpBehavior: {
    doublesHigh: true,
    trumpDominoBelongsOnlyToTrump: true
  }
} as const satisfies RuleConfig;
