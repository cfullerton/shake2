import { EngineError } from "../errors.ts";
import {
  assertSeatIndex,
  getBidOrder,
  type SeatIndex
} from "./seats.ts";
import {
  standardRules,
  type RuleConfig
} from "./rules-config.ts";

export const MIN_NUMERIC_BID = standardRules.bidding.minimumBid;
export const MAX_NUMERIC_BID = standardRules.bidding.maximumNumericBid;
export const MIN_MARK_BID = 1;
export const OPENING_MAX_MARK_BID = 2;

export interface PassBid {
  readonly kind: "pass";
}

export interface NumericBid {
  readonly amount: number;
  readonly kind: "numeric";
}

export interface MarkBid {
  readonly kind: "marks";
  readonly marks: number;
}

export type NonPassBid = MarkBid | NumericBid;
export type BidCall = MarkBid | NumericBid | PassBid;

export interface BidRecord {
  readonly bid: BidCall;
  readonly seat: SeatIndex;
}

export interface WinningBid {
  readonly bid: NonPassBid;
  readonly forced: boolean;
  readonly seat: SeatIndex;
}

export type BiddingStatus = "inProgress" | "complete";

export interface BiddingState {
  readonly dealer: SeatIndex;
  readonly order: readonly [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  readonly bids: readonly BidRecord[];
  readonly currentSeat: SeatIndex | null;
  readonly highestBid: WinningBid | null;
  readonly declarer: SeatIndex | null;
  readonly status: BiddingStatus;
}

export function createPassBid(): PassBid {
  return {
    kind: "pass"
  };
}

export function createNumericBid(amount: number): NumericBid {
  return {
    amount,
    kind: "numeric"
  };
}

export function createMarkBid(marks: number): MarkBid {
  return {
    kind: "marks",
    marks
  };
}

export function createBiddingState(dealer: SeatIndex): BiddingState {
  assertSeatIndex(dealer);
  const order = getBidOrder(dealer);

  return {
    bids: [],
    currentSeat: order[0],
    dealer,
    declarer: null,
    highestBid: null,
    order,
    status: "inProgress"
  };
}

export function submitBid(
  state: BiddingState,
  seat: SeatIndex,
  bid: BidCall,
  rules: RuleConfig = standardRules
): BiddingState {
  if (state.status === "complete") {
    throw new EngineError("INVALID_BID", "Bidding is already complete.");
  }

  assertSeatIndex(seat);

  const expectedSeat = state.order[state.bids.length];
  if (expectedSeat === undefined) {
    throw new EngineError("INVALID_BID", "Bidding order is already exhausted.");
  }

  if (seat !== expectedSeat) {
    throw new EngineError(
      "NOT_PLAYERS_TURN",
      `Seat ${expectedSeat} must bid before seat ${seat}.`
    );
  }

  assertBidCall(bid, rules);
  assertIncreasingBid(bid, state.highestBid, rules);

  const bids = [
    ...state.bids,
    {
      bid,
      seat
    }
  ];
  const highestBid = getNextHighestBid(state.highestBid, seat, bid);

  if (bids.length < state.order.length) {
    const currentSeat = state.order[bids.length];

    if (currentSeat === undefined) {
      throw new EngineError("INVALID_BID", "Cannot find next bidder.");
    }

    return {
      ...state,
      bids,
      currentSeat,
      highestBid
    };
  }

  const finalHighestBid =
    highestBid ?? createForcedDealerBid(state.dealer);

  return {
    ...state,
    bids,
    currentSeat: null,
    declarer: finalHighestBid.seat,
    highestBid: finalHighestBid,
    status: "complete"
  };
}

export function formatBidLabel(bid: BidCall): string {
  switch (bid.kind) {
    case "marks":
      return `${bid.marks} ${bid.marks === 1 ? "mark" : "marks"}`;
    case "numeric":
      return String(bid.amount);
    case "pass":
      return "Pass";
  }
}

export function getLegalMarkBidValues(
  highestBid: WinningBid | null,
  rules: RuleConfig
): readonly number[] {
  if (!rules.enabledContracts.markBids) {
    return [];
  }

  const maxMarks = Math.max(MIN_MARK_BID, rules.targetMarks);

  if (highestBid?.bid.kind === "marks") {
    const nextMarks = highestBid.bid.marks + 1;

    return nextMarks <= maxMarks ? [nextMarks] : [];
  }

  const openingMax = Math.min(OPENING_MAX_MARK_BID, maxMarks);

  return Array.from(
    {
      length: openingMax
    },
    (_value, index) => index + MIN_MARK_BID
  );
}

function assertBidCall(value: BidCall, rules: RuleConfig): void {
  if (value.kind === "pass") {
    return;
  }

  if (value.kind === "numeric") {
    if (
      !Number.isInteger(value.amount) ||
      value.amount < MIN_NUMERIC_BID ||
      value.amount > MAX_NUMERIC_BID
    ) {
      throw new EngineError(
        "INVALID_BID",
        `Numeric bids must be an integer from ${MIN_NUMERIC_BID} to ${MAX_NUMERIC_BID}.`
      );
    }

    return;
  }

  if (value.kind === "marks") {
    if (!rules.enabledContracts.markBids) {
      throw new EngineError("INVALID_BID", "Mark bids are not enabled for this game.");
    }

    if (
      !Number.isInteger(value.marks) ||
      value.marks < MIN_MARK_BID ||
      value.marks > Math.max(MIN_MARK_BID, rules.targetMarks)
    ) {
      throw new EngineError(
        "INVALID_BID",
        `Mark bids must be an integer from ${MIN_MARK_BID} to ${rules.targetMarks}.`
      );
    }

    return;
  }

  throw new EngineError("INVALID_BID", "Bid must be pass, numeric, or marks.");
}

function assertIncreasingBid(
  bid: BidCall,
  highestBid: WinningBid | null,
  rules: RuleConfig
): void {
  if (bid.kind === "pass") {
    return;
  }

  if (highestBid === null && bid.kind === "numeric") {
    return;
  }

  if (bid.kind === "numeric") {
    if (highestBid === null) {
      return;
    }

    if (highestBid.bid.kind === "marks" || bid.amount <= highestBid.bid.amount) {
      throw new EngineError("INVALID_BID", "Numeric bids must increase.");
    }

    return;
  }

  if (!getLegalMarkBidValues(highestBid, rules).includes(bid.marks)) {
    throw new EngineError("INVALID_BID", "Mark bids must follow the mark-bid ladder.");
  }
}

function getNextHighestBid(
  highestBid: WinningBid | null,
  seat: SeatIndex,
  bid: BidCall
): WinningBid | null {
  if (bid.kind === "pass") {
    return highestBid;
  }

  return {
    bid,
    forced: false,
    seat
  };
}

function createForcedDealerBid(dealer: SeatIndex): WinningBid {
  return {
    bid: createNumericBid(MIN_NUMERIC_BID),
    forced: true,
    seat: dealer
  };
}
