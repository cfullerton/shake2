import {
  createDomino,
  dominoContainsPip,
  isDouble,
  PIPS,
  type Domino,
  type Pip
} from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import {
  type BiddingState,
  type NumericBid,
  type WinningBid
} from "./bidding.ts";
import {
  assertSeatIndex,
  type SeatIndex
} from "./seats.ts";

export const TRUMP_SUITS = [
  "blanks",
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes"
] as const;

export type TrumpSuit = (typeof TRUMP_SUITS)[number];

export const TRUMP_SUIT_PIPS: Record<TrumpSuit, Pip> = {
  blanks: 0,
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6
};

export interface StandardNumericContract {
  readonly bid: NumericBid;
  readonly declarer: SeatIndex;
  readonly kind: "standardNumeric";
  readonly trumpSuit: TrumpSuit;
}

export type TrumpCallPhase = "callingTrump" | "trumpCalled";

export interface TrumpCallState {
  readonly contract: StandardNumericContract | null;
  readonly declarer: SeatIndex;
  readonly phase: TrumpCallPhase;
  readonly winningBid: WinningBid;
}

export function createTrumpCallState(bidding: BiddingState): TrumpCallState {
  if (
    bidding.status !== "complete" ||
    bidding.declarer === null ||
    bidding.highestBid === null
  ) {
    throw new EngineError(
      "INVALID_PHASE",
      "Trump can only be called after bidding completes."
    );
  }

  return {
    contract: null,
    declarer: bidding.declarer,
    phase: "callingTrump",
    winningBid: bidding.highestBid
  };
}

export function callTrump(
  state: TrumpCallState,
  actor: SeatIndex,
  trumpSuit: TrumpSuit
): TrumpCallState {
  if (state.phase !== "callingTrump") {
    throw new EngineError("INVALID_PHASE", "Trump has already been called.");
  }

  assertSeatIndex(actor);

  if (actor !== state.declarer) {
    throw new EngineError("INVALID_ACTOR", "Only the declarer can call trump.");
  }

  assertTrumpSuit(trumpSuit);

  return {
    ...state,
    contract: {
      bid: state.winningBid.bid,
      declarer: state.declarer,
      kind: "standardNumeric",
      trumpSuit
    },
    phase: "trumpCalled"
  };
}

export function isDominoTrump(domino: Domino, trumpSuit: TrumpSuit): boolean {
  return dominoContainsPip(domino, getTrumpSuitPip(trumpSuit));
}

export function getTrumpDominoRank(domino: Domino, trumpSuit: TrumpSuit): number {
  if (!isDominoTrump(domino, trumpSuit)) {
    throw new EngineError("INVALID_TRUMP", "Cannot rank a non-trump domino.");
  }

  const trumpPip = getTrumpSuitPip(trumpSuit);

  if (isDouble(domino)) {
    return PIPS.length;
  }

  return domino.high === trumpPip ? domino.low : domino.high;
}

export function compareTrumpDominoes(
  left: Domino,
  right: Domino,
  trumpSuit: TrumpSuit
): number {
  return getTrumpDominoRank(right, trumpSuit) - getTrumpDominoRank(left, trumpSuit);
}

export function getTrumpDominoesHighToLow(trumpSuit: TrumpSuit): readonly Domino[] {
  const trumpPip = getTrumpSuitPip(trumpSuit);
  const otherPips = [...PIPS]
    .filter((pip) => pip !== trumpPip)
    .sort((left, right) => right - left);

  return [
    createDomino(trumpPip, trumpPip),
    ...otherPips.map((pip) => createDomino(trumpPip, pip))
  ];
}

export function getTrumpSuitPip(trumpSuit: TrumpSuit): Pip {
  assertTrumpSuit(trumpSuit);
  return TRUMP_SUIT_PIPS[trumpSuit];
}

export function isTrumpSuit(value: unknown): value is TrumpSuit {
  return TRUMP_SUITS.includes(value as TrumpSuit);
}

export function assertTrumpSuit(value: unknown): asserts value is TrumpSuit {
  if (!isTrumpSuit(value)) {
    throw new EngineError("INVALID_TRUMP", `Invalid trump suit: ${String(value)}`);
  }
}
