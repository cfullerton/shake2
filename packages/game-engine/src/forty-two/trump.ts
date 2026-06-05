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
  type NonPassBid,
  type WinningBid
} from "./bidding.ts";
import { type RuleConfig } from "./rules-config.ts";
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

export interface NoTrumpSelection {
  readonly kind: "none";
}

export type TrumpSelection = NoTrumpSelection | PipTrumpSelection;

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
  readonly bid: NonPassBid;
  readonly declarer: SeatIndex;
  readonly kind: "standardNumeric";
  readonly trump: PipTrumpSelection;
  readonly trumpSuit: TrumpSuit;
}

export interface NoTrumpContract {
  readonly bid: NonPassBid;
  readonly declarer: SeatIndex;
  readonly kind: "noTrump";
  readonly trump: NoTrumpSelection;
}

export type Contract = NoTrumpContract | StandardNumericContract;

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
  return callTrumpSelection(state, actor, {
    kind: "pip",
    suit: trumpSuit
  });
}

export function callTrumpSelection(
  state: TrumpCallState,
  actor: SeatIndex,
  selection: TrumpSelection,
  rules?: RuleConfig
): TrumpCallState {
  if (state.phase !== "callingTrump") {
    throw new EngineError("INVALID_PHASE", "Trump has already been called.");
  }

  assertSeatIndex(actor);

  if (actor !== state.declarer) {
    throw new EngineError("INVALID_ACTOR", "Only the declarer can call trump.");
  }

  assertTrumpSelection(selection);
  assertTrumpSelectionEnabled(selection, rules);

  return {
    ...state,
    contract: createContractForSelection(
      state.winningBid.bid,
      state.declarer,
      selection
    ),
    phase: "trumpCalled"
  };
}

export function getContractTrumpSuit(contract: Contract): TrumpSuit {
  switch (contract.kind) {
    case "noTrump":
      throw new EngineError(
        "INVALID_TRUMP",
        "No-trump contracts do not have a trump suit."
      );
    case "standardNumeric":
      return getTrumpSuitFromSelection(contract.trump);
  }
}

export function getContractTrumpSelection(contract: Contract): TrumpSelection {
  switch (contract.kind) {
    case "noTrump":
    case "standardNumeric":
      return contract.trump;
  }
}

export function isDominoTrumpForContract(domino: Domino, contract: Contract): boolean {
  switch (contract.kind) {
    case "noTrump":
      return false;
    case "standardNumeric":
      return isDominoTrump(domino, getContractTrumpSuit(contract));
  }
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

  if (contract.kind !== "standardNumeric" && contract.kind !== "noTrump") {
    throw new EngineError(
      "INVALID_ACTION",
      `Unsupported contract kind: ${String(contract.kind)}.`
    );
  }

  assertSeatIndex(contract.declarer);

  const bid = contract.bid;

  if (typeof bid !== "object" || bid === null || Array.isArray(bid)) {
    throw new EngineError("INVALID_BID", "Contract bid must be an object.");
  }

  const contractBid = bid as Record<string, unknown>;

  if (contractBid.kind === "numeric") {
    if (!Number.isInteger(contractBid.amount)) {
      throw new EngineError("INVALID_BID", "Contract numeric bid amount is invalid.");
    }
  } else if (contractBid.kind === "marks") {
    if (!Number.isInteger(contractBid.marks)) {
      throw new EngineError("INVALID_BID", "Contract mark bid count is invalid.");
    }
  } else {
    throw new EngineError("INVALID_BID", "Contract bid must be numeric or marks.");
  }

  assertTrumpSelection(contract.trump);

  if (contract.kind === "standardNumeric" && contract.trump.kind !== "pip") {
    throw new EngineError(
      "INVALID_TRUMP",
      "Standard numeric contracts must call a pip trump."
    );
  }

  if (contract.kind === "noTrump" && contract.trump.kind !== "none") {
    throw new EngineError(
      "INVALID_TRUMP",
      "No-trump contracts must use no trump selection."
    );
  }
}

export function assertTrumpSelection(value: unknown): asserts value is TrumpSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EngineError("INVALID_TRUMP", "Trump selection must be an object.");
  }

  const trump = value as Record<string, unknown>;

  if (trump.kind === "none") {
    return;
  }

  if (trump.kind !== "pip") {
    throw new EngineError(
      "INVALID_TRUMP",
      `Unsupported trump selection kind: ${String(trump.kind)}.`
    );
  }

  assertTrumpSuit(trump.suit);
}

function assertTrumpSelectionEnabled(
  selection: TrumpSelection,
  rules?: RuleConfig
): void {
  if (
    selection.kind === "none" &&
    rules?.enabledContracts.noTrump !== true
  ) {
    throw new EngineError(
      "INVALID_TRUMP",
      "No-trump contracts are not enabled for this game."
    );
  }
}

function getTrumpSuitFromSelection(selection: TrumpSelection): TrumpSuit {
  switch (selection.kind) {
    case "none":
      throw new EngineError(
        "INVALID_TRUMP",
        "No-trump selection does not have a trump suit."
      );
    case "pip":
      return selection.suit;
  }
}

function createContractForSelection(
  bid: NonPassBid,
  declarer: SeatIndex,
  selection: TrumpSelection
): Contract {
  switch (selection.kind) {
    case "none":
      return createNoTrumpContract(bid, declarer);
    case "pip":
      return createStandardNumericContract(bid, declarer, selection.suit);
  }
}

function createStandardNumericContract(
  bid: NonPassBid,
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

function createNoTrumpContract(
  bid: NonPassBid,
  declarer: SeatIndex
): NoTrumpContract {
  return {
    bid,
    declarer,
    kind: "noTrump",
    trump: {
      kind: "none"
    }
  };
}
