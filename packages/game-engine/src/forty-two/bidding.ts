import { EngineError } from "../errors.ts";
import {
  assertSeatIndex,
  getBidOrder,
  type SeatIndex
} from "./seats.ts";
import { standardRules } from "./rules-config.ts";

export const MIN_NUMERIC_BID = standardRules.bidding.minimumBid;
export const MAX_NUMERIC_BID = standardRules.bidding.maximumNumericBid;

export interface PassBid {
  readonly kind: "pass";
}

export interface NumericBid {
  readonly amount: number;
  readonly kind: "numeric";
}

export type BidCall = PassBid | NumericBid;

export interface BidRecord {
  readonly bid: BidCall;
  readonly seat: SeatIndex;
}

export interface WinningBid {
  readonly bid: NumericBid;
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
  bid: BidCall
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

  assertBidCall(bid);
  assertIncreasingBid(bid, state.highestBid);

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

function assertBidCall(value: BidCall): void {
  if (value.kind === "pass") {
    return;
  }

  if (value.kind !== "numeric") {
    throw new EngineError("INVALID_BID", "Bid must be pass or numeric.");
  }

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
}

function assertIncreasingBid(
  bid: BidCall,
  highestBid: WinningBid | null
): void {
  if (bid.kind === "pass" || highestBid === null) {
    return;
  }

  if (bid.amount <= highestBid.bid.amount) {
    throw new EngineError("INVALID_BID", "Numeric bids must increase.");
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
