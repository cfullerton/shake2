import type { GraphqlClient } from "./graphql";
import type {
  MultiplayerGameRealtimeClient,
  MultiplayerGameUpdateObserver,
  MultiplayerGameUpdateSubscription
} from "./realtime";
import { normalizeMultiplayerPublicGameSnapshot } from "./snapshots";
import type {
  AppSyncSeatIndex,
  MultiplayerDomino,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshotPayload,
  MultiplayerPublicGameSnapshot,
  MultiplayerSubmitGameActionResultPayload,
  MultiplayerSubmitGameActionResult,
  MultiplayerTrumpSuit
} from "./types";

export type MultiplayerBid =
  | {
      readonly kind: "numeric";
      readonly amount: number;
    }
  | {
      readonly kind: "pass";
    };

export interface GetMyPrivateHandInput {
  readonly gameId: string;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface SubmitMultiplayerBidInput {
  readonly actorId: string;
  readonly actorSeat: AppSyncSeatIndex;
  readonly bid: MultiplayerBid;
  readonly gameId: string;
  readonly knownLastEventSequence: number;
  readonly knownSnapshotVersion: number;
}

export interface SubmitMultiplayerTrumpInput {
  readonly actorId: string;
  readonly actorSeat: AppSyncSeatIndex;
  readonly gameId: string;
  readonly knownLastEventSequence: number;
  readonly knownSnapshotVersion: number;
  readonly trumpSuit: MultiplayerTrumpSuit;
}

export interface SubmitMultiplayerDominoInput {
  readonly actorId: string;
  readonly actorSeat: AppSyncSeatIndex;
  readonly domino: MultiplayerDomino;
  readonly gameId: string;
  readonly knownLastEventSequence: number;
  readonly knownSnapshotVersion: number;
  readonly ledSuit?: MultiplayerTrumpSuit;
}

export class MultiplayerGameClient {
  constructor(
    private readonly graphql: GraphqlClient,
    private readonly realtime: MultiplayerGameRealtimeClient | null = null
  ) {}

  async getGameSnapshot(gameId: string): Promise<MultiplayerPublicGameSnapshot> {
    const data = await this.graphql.execute<{
      readonly getGameSnapshot: MultiplayerPublicGameSnapshotPayload;
    }>({
      operationName: "GetGameSnapshot",
      query: `
        query GetGameSnapshot($gameId: ID!) {
          getGameSnapshot(gameId: $gameId) {
            ${PUBLIC_SNAPSHOT_SELECTION}
          }
        }
      `,
      variables: {
        gameId
      }
    });

    return normalizeMultiplayerPublicGameSnapshot(data.getGameSnapshot);
  }

  async getMyPrivateHand(input: GetMyPrivateHandInput): Promise<MultiplayerPrivateHand> {
    const data = await this.graphql.execute<{
      readonly getMyPrivateHand: MultiplayerPrivateHand;
    }>({
      operationName: "GetMyPrivateHand",
      query: `
        query GetMyPrivateHand($input: GetMyPrivateHandInput!) {
          getMyPrivateHand(input: $input) {
            gameId
            handNumber
            seatIndex
            updatedAt
            dominoes {
              high
              key
              low
            }
          }
        }
      `,
      variables: {
        input
      }
    });

    return data.getMyPrivateHand;
  }

  async submitBid(
    input: SubmitMultiplayerBidInput
  ): Promise<MultiplayerSubmitGameActionResult> {
    return this.submitPlayerAction({
      action: {
        payload: {
          bid: input.bid,
          seat: toSeatNumber(input.actorSeat)
        },
        type: "fortyTwo.bid.submit"
      },
      actorId: input.actorId,
      actorSeat: input.actorSeat,
      gameId: input.gameId,
      knownLastEventSequence: input.knownLastEventSequence,
      knownSnapshotVersion: input.knownSnapshotVersion
    });
  }

  async submitTrump(
    input: SubmitMultiplayerTrumpInput
  ): Promise<MultiplayerSubmitGameActionResult> {
    return this.submitPlayerAction({
      action: {
        payload: {
          trumpSuit: input.trumpSuit
        },
        type: "fortyTwo.trump.call"
      },
      actorId: input.actorId,
      actorSeat: input.actorSeat,
      gameId: input.gameId,
      knownLastEventSequence: input.knownLastEventSequence,
      knownSnapshotVersion: input.knownSnapshotVersion
    });
  }

  async submitDomino(
    input: SubmitMultiplayerDominoInput
  ): Promise<MultiplayerSubmitGameActionResult> {
    return this.submitPlayerAction({
      action: {
        payload: {
          domino: {
            high: input.domino.high,
            low: input.domino.low
          },
          ...(input.ledSuit ? { ledSuit: input.ledSuit } : {}),
          seat: toSeatNumber(input.actorSeat)
        },
        type: "fortyTwo.domino.play"
      },
      actorId: input.actorId,
      actorSeat: input.actorSeat,
      gameId: input.gameId,
      knownLastEventSequence: input.knownLastEventSequence,
      knownSnapshotVersion: input.knownSnapshotVersion
    });
  }

  subscribeToGameUpdates(
    input: {
      readonly gameId: string;
    },
    observer: MultiplayerGameUpdateObserver
  ): MultiplayerGameUpdateSubscription {
    if (!this.realtime) {
      observer.onStatus?.("closed");

      return {
        unsubscribe() {}
      };
    }

    return this.realtime.subscribeToGameUpdates(input, observer);
  }

  private async submitPlayerAction(input: {
    readonly action: Readonly<{
      readonly payload: Readonly<Record<string, unknown>>;
      readonly type: string;
    }>;
    readonly actorId: string;
    readonly actorSeat: AppSyncSeatIndex;
    readonly gameId: string;
    readonly knownLastEventSequence: number;
    readonly knownSnapshotVersion: number;
  }): Promise<MultiplayerSubmitGameActionResult> {
    return this.submitGameAction({
      action: input.action,
      actionId: createActionId(),
      actorId: input.actorId,
      actorSeat: toSeatNumber(input.actorSeat),
      clientCreatedAt: new Date().toISOString(),
      gameId: input.gameId,
      knownLastEventSequence: input.knownLastEventSequence,
      knownSnapshotVersion: input.knownSnapshotVersion,
      schemaVersion: 1
    });
  }

  private async submitGameAction(
    actionEnvelope: Readonly<Record<string, unknown>>
  ): Promise<MultiplayerSubmitGameActionResult> {
    const data = await this.graphql.execute<{
      readonly submitGameAction: MultiplayerSubmitGameActionResultPayload;
    }>({
      operationName: "SubmitGameAction",
      query: `
        mutation SubmitGameAction($input: SubmitGameActionInput!) {
          submitGameAction(input: $input) {
            accepted
            committed
            duplicate
            gameId
            error {
              code
              message
            }
            events {
              actionId
              actorId
              actorSeat
              eventId
              eventType
              sequence
            }
            snapshot {
              ${PUBLIC_SNAPSHOT_SELECTION}
            }
          }
        }
      `,
      variables: {
        input: {
          action: JSON.stringify(actionEnvelope),
          gameId: actionEnvelope.gameId
        }
      }
    });

    const { snapshot, ...result } = data.submitGameAction;

    if (snapshot) {
      return {
        ...result,
        snapshot: normalizeMultiplayerPublicGameSnapshot(snapshot)
      };
    }

    if (snapshot === null) {
      return {
        ...result,
        snapshot: null
      };
    }

    return result;
  }
}

const PUBLIC_SNAPSHOT_SELECTION = `
  gameId
  generatedAt
  lastEventSequence
  schemaVersion
  snapshotVersion
  phase
  handCounts {
    seat0
    seat1
    seat2
    seat3
  }
  redactedState
`;

function toSeatNumber(seat: AppSyncSeatIndex): number {
  switch (seat) {
    case "SEAT_0":
      return 0;
    case "SEAT_1":
      return 1;
    case "SEAT_2":
      return 2;
    case "SEAT_3":
      return 3;
  }
}

function createActionId(): string {
  const random = Math.random().toString(36).slice(2, 10);

  return `mobile-${Date.now()}-${random}`;
}
