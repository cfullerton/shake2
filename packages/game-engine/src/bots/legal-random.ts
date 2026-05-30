import { getEngineRandom, type EngineContext } from "../context.ts";
import { EngineError } from "../errors.ts";
import {
  getLegalBidOptions,
  getLegalDominoPlays,
  getLegalTrumpSuits,
  type LegalDominoPlay
} from "../forty-two/legal-actions.ts";
import { type FortyTwoSnapshotEnvelope } from "../forty-two/state.ts";
import { type BidCall } from "../forty-two/bidding.ts";
import { type SeatIndex } from "../forty-two/seats.ts";
import { type TrumpSuit } from "../forty-two/trump.ts";

export type LegalRandomBotDecision =
  | {
      readonly bid: BidCall;
      readonly kind: "bid";
      readonly seat: SeatIndex;
    }
  | {
      readonly kind: "callTrump";
      readonly seat: SeatIndex;
      readonly trumpSuit: TrumpSuit;
    }
  | {
      readonly kind: "playDomino";
      readonly play: LegalDominoPlay;
      readonly seat: SeatIndex;
    };

export interface LegalRandomBotInput {
  readonly context: Pick<EngineContext, "random">;
  readonly seat: SeatIndex;
  readonly snapshot: FortyTwoSnapshotEnvelope;
}

export function chooseLegalRandomBotDecision(
  input: LegalRandomBotInput
): LegalRandomBotDecision {
  const snapshot = input.snapshot.snapshot;

  if (snapshot.phase === "dealt" || snapshot.phase === "bidding") {
    return {
      bid: chooseConservativeBid(input),
      kind: "bid",
      seat: input.seat
    };
  }

  if (snapshot.phase === "trump") {
    const trumpSuit = chooseRandom(getLegalTrumpSuits(input.snapshot, input.seat), input.context);

    return {
      kind: "callTrump",
      seat: input.seat,
      trumpSuit
    };
  }

  if (snapshot.phase === "trickPlay") {
    const play = chooseRandom(getLegalDominoPlays(input.snapshot, input.seat), input.context);

    return {
      kind: "playDomino",
      play,
      seat: input.seat
    };
  }

  throw new EngineError("INVALID_PHASE", "Bot has no legal decision in this phase.");
}

function chooseConservativeBid(input: LegalRandomBotInput): BidCall {
  const legalBids = getLegalBidOptions(input.snapshot, input.seat);
  const pass = legalBids.find((option) => option.bid.kind === "pass");
  const numericBids = legalBids.filter((option) => option.bid.kind === "numeric");

  if (!pass) {
    throw new EngineError("INVALID_BID", "Bot cannot find a legal pass option.");
  }

  if (numericBids.length === 0) {
    return pass.bid;
  }

  const shouldBid = getEngineRandom(input.context) < 0.28;

  if (!shouldBid) {
    return pass.bid;
  }

  return numericBids[0]?.bid ?? pass.bid;
}

function chooseRandom<TValue>(
  values: readonly TValue[],
  context: Pick<EngineContext, "random">
): TValue {
  if (values.length === 0) {
    throw new EngineError("INVALID_ACTION", "No legal bot actions are available.");
  }

  const index = Math.floor(getEngineRandom(context) * values.length);
  const value = values[index];

  if (value === undefined) {
    throw new EngineError("INVALID_ACTION", "Bot selected an unavailable action.");
  }

  return value;
}
