import { type BidCall } from "./bidding.ts";
import { type Domino } from "../dominoes/domino.ts";
import { type DominoSuit } from "./tricks.ts";
import { type RuleConfig } from "./rules-config.ts";
import {
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import { type TrumpSuit } from "./trump.ts";

export const FORTY_TWO_ACTION_SCHEMA_VERSION = 1;

export type FortyTwoActorId = string;
export type FortyTwoActionId = string;

export interface CreateFortyTwoGameActionPayload {
  readonly dealer: SeatIndex;
  readonly playerNames?: Partial<Record<SeatIndex, string>>;
  readonly rules?: RuleConfig;
  readonly teamNames?: Partial<Record<FortyTwoTeamId, string>>;
}

export interface DealFortyTwoHandActionPayload {
  readonly dealer: SeatIndex;
  readonly handNumber: number;
}

export interface SubmitFortyTwoBidActionPayload {
  readonly bid: BidCall;
  readonly seat: SeatIndex;
}

export type CompleteFortyTwoBiddingActionPayload = Readonly<Record<string, never>>;

export interface CallFortyTwoTrumpActionPayload {
  readonly trumpSuit: TrumpSuit;
}

export interface PlayFortyTwoDominoActionPayload {
  readonly domino: Domino;
  readonly ledSuit?: DominoSuit;
  readonly seat: SeatIndex;
}

export interface CompleteFortyTwoTrickActionPayload {
  readonly trickIndex: number;
}

export interface CompleteFortyTwoHandActionPayload {
  readonly handNumber: number;
}

export interface CompleteFortyTwoGameActionPayload {
  readonly winningTeamId: FortyTwoTeamId;
}

export type FortyTwoAction =
  | {
      readonly payload: CreateFortyTwoGameActionPayload;
      readonly type: "fortyTwo.game.create";
    }
  | {
      readonly payload: DealFortyTwoHandActionPayload;
      readonly type: "fortyTwo.hand.deal";
    }
  | {
      readonly payload: SubmitFortyTwoBidActionPayload;
      readonly type: "fortyTwo.bid.submit";
    }
  | {
      readonly payload: CompleteFortyTwoBiddingActionPayload;
      readonly type: "fortyTwo.bidding.complete";
    }
  | {
      readonly payload: CallFortyTwoTrumpActionPayload;
      readonly type: "fortyTwo.trump.call";
    }
  | {
      readonly payload: PlayFortyTwoDominoActionPayload;
      readonly type: "fortyTwo.domino.play";
    }
  | {
      readonly payload: CompleteFortyTwoTrickActionPayload;
      readonly type: "fortyTwo.trick.complete";
    }
  | {
      readonly payload: CompleteFortyTwoHandActionPayload;
      readonly type: "fortyTwo.hand.complete";
    }
  | {
      readonly payload: CompleteFortyTwoGameActionPayload;
      readonly type: "fortyTwo.game.complete";
    };

export type CreateFortyTwoGameAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.game.create" }
>;

export type DealFortyTwoHandAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.hand.deal" }
>;

export type SubmitFortyTwoBidAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.bid.submit" }
>;

export type CompleteFortyTwoBiddingAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.bidding.complete" }
>;

export type CallFortyTwoTrumpAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.trump.call" }
>;

export type PlayFortyTwoDominoAction = Extract<
  FortyTwoAction,
  { readonly type: "fortyTwo.domino.play" }
>;

export interface FortyTwoActionEnvelope<
  TAction extends FortyTwoAction = FortyTwoAction
> {
  readonly action: TAction;
  readonly actionId: FortyTwoActionId;
  readonly actorId: FortyTwoActorId;
  readonly actorSeat?: SeatIndex;
  readonly clientCreatedAt: string;
  readonly gameId: string;
  readonly knownLastEventSequence?: number;
  readonly knownSnapshotVersion?: number;
  readonly schemaVersion: typeof FORTY_TWO_ACTION_SCHEMA_VERSION;
}
