import {
  type BidCall,
  type BiddingState
} from "./bidding.ts";
import {
  type FortyTwoHands
} from "./deal.ts";
import {
  type FortyTwoActorId,
  type FortyTwoActionId
} from "./actions.ts";
import {
  type RuleConfig
} from "./rules-config.ts";
import {
  type CompletedTrick,
  type HandScore
} from "./scoring.ts";
import {
  type FortyTwoGameMode,
  type FortyTwoMarks,
  type FortyTwoPlayers,
  type FortyTwoTeams
} from "./state.ts";
import {
  type FortyTwoTeamId,
  type SeatIndex
} from "./seats.ts";
import {
  type Trick
} from "./tricks.ts";
import {
  type StandardNumericContract,
  type TrumpCallState
} from "./trump.ts";

export const FORTY_TWO_EVENT_SCHEMA_VERSION = 1;

export type FortyTwoEventId = string;
export type FortyTwoEventSequence = number;

export interface FortyTwoGameCreatedPayload {
  readonly createdAt: string;
  readonly dealer: SeatIndex;
  readonly handNumber: number;
  readonly marks: FortyTwoMarks;
  readonly mode: FortyTwoGameMode;
  readonly players: FortyTwoPlayers;
  readonly rules: RuleConfig;
  readonly teams: FortyTwoTeams;
}

export interface FortyTwoHandDealtPayload {
  readonly dealer: SeatIndex;
  readonly handNumber: number;
  readonly hands: FortyTwoHands;
}

export interface FortyTwoBidSubmittedPayload {
  readonly bid: BidCall;
  readonly bidding: BiddingState;
  readonly seat: SeatIndex;
}

export interface FortyTwoBiddingCompletedPayload {
  readonly bidding: BiddingState;
  readonly trump: TrumpCallState;
}

export interface FortyTwoTrumpCalledPayload {
  readonly contract: StandardNumericContract;
  readonly currentTrick: Trick;
  readonly trump: TrumpCallState;
}

export interface FortyTwoDominoPlayedPayload {
  readonly currentTrick: Trick;
  readonly hands: FortyTwoHands;
}

export interface FortyTwoTrickCompletedPayload {
  readonly completedTrick: CompletedTrick;
  readonly currentTrick: Trick;
}

export interface FortyTwoHandCompletedPayload {
  readonly completedTricks: readonly CompletedTrick[];
  readonly handScore: HandScore;
}

export interface FortyTwoGameCompletedPayload {
  readonly completedAt: string;
  readonly winningTeamId: FortyTwoTeamId;
}

export type FortyTwoEvent =
  | {
      readonly payload: FortyTwoGameCreatedPayload;
      readonly type: "fortyTwo.game.created";
    }
  | {
      readonly payload: FortyTwoHandDealtPayload;
      readonly type: "fortyTwo.hand.dealt";
    }
  | {
      readonly payload: FortyTwoBidSubmittedPayload;
      readonly type: "fortyTwo.bid.submitted";
    }
  | {
      readonly payload: FortyTwoBiddingCompletedPayload;
      readonly type: "fortyTwo.bidding.completed";
    }
  | {
      readonly payload: FortyTwoTrumpCalledPayload;
      readonly type: "fortyTwo.trump.called";
    }
  | {
      readonly payload: FortyTwoDominoPlayedPayload;
      readonly type: "fortyTwo.domino.played";
    }
  | {
      readonly payload: FortyTwoTrickCompletedPayload;
      readonly type: "fortyTwo.trick.completed";
    }
  | {
      readonly payload: FortyTwoHandCompletedPayload;
      readonly type: "fortyTwo.hand.completed";
    }
  | {
      readonly payload: FortyTwoGameCompletedPayload;
      readonly type: "fortyTwo.game.completed";
    };

export interface FortyTwoEventEnvelope<
  TEvent extends FortyTwoEvent = FortyTwoEvent
> {
  readonly actionId: FortyTwoActionId;
  readonly actorId: FortyTwoActorId;
  readonly actorSeat?: SeatIndex;
  readonly event: TEvent;
  readonly eventId: FortyTwoEventId;
  readonly gameId: string;
  readonly schemaVersion: typeof FORTY_TWO_EVENT_SCHEMA_VERSION;
  readonly sequence: FortyTwoEventSequence;
  readonly serverCreatedAt: string;
}
