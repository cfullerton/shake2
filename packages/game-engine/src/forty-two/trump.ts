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

export interface PipTrumpSelection {
  readonly kind: "pip";
  readonly suit: TrumpSuit;
}

export type TrumpSelection = PipTrumpSelection;

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
  readonly trump: TrumpSelection;
  readonly trumpSuit: TrumpSuit;
}

export type Contract = StandardNumericContract;

export type TrumpCallPhase = "callingTrump" | "trumpCalled";

export interface TrumpCallState {
  readonly contract: Contract | null;
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
    contract: createStandardNumericContract(state.winningBid.bid, state.declarer, trumpSuit),
    phase: "trumpCalled"
  };
}

export function getContractTrumpSuit(contract: Contract): TrumpSuit {
  switch (contract.kind) {
    case "standardNumeric":
      return getTrumpSuitFromSelection(contract.trump);
  }
}

export function isDominoTrumpForContract(domino: Domino, contract: Contract): boolean {
  return isDominoTrump(domino, getContractTrumpSuit(contract));
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

export function assertContract(value: unknown): asserts value is Contract {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EngineError("INVALID_ACTION", "Contract must be an object.");
  }

  const contract = value as Record<string, unknown>;

  if (contract.kind !== "standardNumeric") {
    throw new EngineError("INVALID_ACTION", `Unsupported contract kind: ${String(contract.kind)}.`);
  }

  assertSeatIndex(contract.declarer);

  const bid = contract.bid;

  if (typeof bid !== "object" || bid === null || Array.isArray(bid)) {
    throw new EngineError("INVALID_BID", "Contract bid must be an object.");
  }

  const numericBid = bid as Record<string, unknown>;

  if (numericBid.kind !== "numeric" || !Number.isInteger(numericBid.amount)) {
    throw new EngineError("INVALID_BID", "Contract bid must be numeric.");
  }

  assertTrumpSelection(contract.trump);
}

function assertTrumpSelection(value: unknown): asserts value is TrumpSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EngineError("INVALID_TRUMP", "Trump selection must be an object.");
  }

  const trump = value as Record<string, unknown>;

  if (trump.kind !== "pip") {
    throw new EngineError(
      "INVALID_TRUMP",
      `Unsupported trump selection kind: ${String(trump.kind)}.`
    );
  }

  assertTrumpSuit(trump.suit);
}

function getTrumpSuitFromSelection(selection: TrumpSelection): TrumpSuit {
  switch (selection.kind) {
    case "pip":
      return selection.suit;
  }
}

function createStandardNumericContract(
  bid: NumericBid,
  declarer: SeatIndex,
  trumpSuit: TrumpSuit
): StandardNumericContract {
  const contract = {
    bid,
    declarer,
    kind: "standardNumeric",
    trump: {
      kind: "pip" as const,
      suit: trumpSuit
    }
  };

  Object.defineProperty(contract, "trumpSuit", {
    configurable: false,
    enumerable: false,
    get: () => trumpSuit
  });

  return contract as StandardNumericContract;
}
