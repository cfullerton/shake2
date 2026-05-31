import type { GraphqlClient } from "./graphql";
import { normalizeMultiplayerPublicGameSnapshot } from "./snapshots";
import type {
  AppSyncSeatIndex,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshotPayload,
  MultiplayerPublicGameSnapshot,
  MultiplayerSubmitGameActionResultPayload,
  MultiplayerSubmitGameActionResult
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

export class MultiplayerGameClient {
  constructor(private readonly graphql: GraphqlClient) {}

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
    return this.submitGameAction({
      action: {
        payload: {
          bid: input.bid,
          seat: toSeatNumber(input.actorSeat)
        },
        type: "fortyTwo.bid.submit"
      },
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
