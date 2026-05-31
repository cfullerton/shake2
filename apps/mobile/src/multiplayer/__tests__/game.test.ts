import type { GraphqlClient, GraphqlRequest } from "../graphql";
import {
  MultiplayerGameClient,
  type MultiplayerBid
} from "../game";
import type {
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshotPayload,
  MultiplayerPublicGameSnapshot,
  MultiplayerSubmitGameActionResult
} from "../types";

test("MultiplayerGameClient reads snapshots and parses AWSJSON state", async () => {
  const snapshot: MultiplayerPublicGameSnapshotPayload = {
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    lastEventSequence: 2,
    phase: "dealt",
    redactedState: JSON.stringify({
      dealer: 0,
      phase: "dealt"
    }),
    schemaVersion: 1,
    snapshotVersion: 2
  };
  const graphql = new MockGraphqlClient({
    getGameSnapshot: snapshot
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(client.getGameSnapshot("game-1")).resolves.toMatchObject({
    redactedState: {
      dealer: 0,
      phase: "dealt"
    }
  });
  expect(graphql.requests[0]?.operationName).toBe("GetGameSnapshot");
  expect(graphql.requests[0]?.variables).toEqual({
    gameId: "game-1"
  });
});

test("MultiplayerGameClient reads the actor private hand", async () => {
  const hand: MultiplayerPrivateHand = {
    dominoes: [
      {
        high: 6,
        key: "6-6",
        low: 6
      }
    ],
    gameId: "game-1",
    handNumber: 1,
    seatIndex: "SEAT_1",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
  const graphql = new MockGraphqlClient({
    getMyPrivateHand: hand
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(
    client.getMyPrivateHand({
      gameId: "game-1",
      seatIndex: "SEAT_1"
    })
  ).resolves.toBe(hand);
  expect(graphql.requests[0]?.operationName).toBe("GetMyPrivateHand");
});

test("MultiplayerGameClient submits bids as AppSync AWSJSON actions", async () => {
  const result: MultiplayerSubmitGameActionResult = {
    accepted: true,
    committed: true,
    duplicate: false,
    events: [],
    gameId: "game-1",
    snapshot: createSnapshot()
  };
  const graphql = new MockGraphqlClient({
    submitGameAction: result
  });
  const client = new MultiplayerGameClient(graphql);
  const bid: MultiplayerBid = {
    amount: 31,
    kind: "numeric"
  };

  await expect(
    client.submitBid({
      actorId: "actor-sub",
      actorSeat: "SEAT_1",
      bid,
      gameId: "game-1",
      knownLastEventSequence: 2,
      knownSnapshotVersion: 2
    })
  ).resolves.toMatchObject({
    accepted: true,
    snapshot: {
      gameId: "game-1"
    }
  });

  const variables = graphql.requests[0]?.variables as {
    readonly input?: {
      readonly action?: string;
      readonly gameId?: string;
    };
  };
  const action = JSON.parse(variables.input?.action ?? "{}") as {
    readonly action?: {
      readonly payload?: {
        readonly bid?: MultiplayerBid;
        readonly seat?: number;
      };
      readonly type?: string;
    };
    readonly actorId?: string;
    readonly actorSeat?: number;
    readonly gameId?: string;
  };

  expect(graphql.requests[0]?.operationName).toBe("SubmitGameAction");
  expect(variables.input?.gameId).toBe("game-1");
  expect(action).toMatchObject({
    action: {
      payload: {
        bid,
        seat: 1
      },
      type: "fortyTwo.bid.submit"
    },
    actorId: "actor-sub",
    actorSeat: 1,
    gameId: "game-1"
  });
});

test("MultiplayerGameClient submits trump calls as AppSync AWSJSON actions", async () => {
  const graphql = new MockGraphqlClient({
    submitGameAction: {
      accepted: true,
      committed: true,
      duplicate: false,
      events: [],
      gameId: "game-1",
      snapshot: createSnapshot({
        phase: "trickPlay",
        redactedState: {
          contract: {
            declarer: 1,
            kind: "standardNumeric",
            trump: {
              kind: "pip",
              suit: "sixes"
            }
          },
          dealer: 0,
          phase: "trickPlay"
        }
      })
    } satisfies MultiplayerSubmitGameActionResult
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(
    client.submitTrump({
      actorId: "actor-sub",
      actorSeat: "SEAT_1",
      gameId: "game-1",
      knownLastEventSequence: 6,
      knownSnapshotVersion: 6,
      trumpSuit: "sixes"
    })
  ).resolves.toMatchObject({
    accepted: true,
    snapshot: {
      phase: "trickPlay",
      redactedState: {
        contract: {
          trump: {
            suit: "sixes"
          }
        }
      }
    }
  });

  const variables = graphql.requests[0]?.variables as {
    readonly input?: {
      readonly action?: string;
      readonly gameId?: string;
    };
  };
  const action = JSON.parse(variables.input?.action ?? "{}") as {
    readonly action?: {
      readonly payload?: {
        readonly trumpSuit?: string;
      };
      readonly type?: string;
    };
    readonly actorId?: string;
    readonly actorSeat?: number;
    readonly gameId?: string;
  };

  expect(graphql.requests[0]?.operationName).toBe("SubmitGameAction");
  expect(action).toMatchObject({
    action: {
      payload: {
        trumpSuit: "sixes"
      },
      type: "fortyTwo.trump.call"
    },
    actorId: "actor-sub",
    actorSeat: 1,
    gameId: "game-1"
  });
});

class MockGraphqlClient implements GraphqlClient {
  readonly requests: GraphqlRequest[] = [];

  constructor(private readonly response: Readonly<Record<string, unknown>>) {}

  async execute<TData extends Readonly<Record<string, unknown>>>(
    request: GraphqlRequest
  ): Promise<TData> {
    this.requests.push(request);

    return this.response as TData;
  }
}

function createSnapshot(
  overrides: Partial<MultiplayerPublicGameSnapshot> = {}
): MultiplayerPublicGameSnapshot {
  return {
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    lastEventSequence: 3,
    phase: "bidding",
    redactedState: {
      dealer: 0,
      phase: "bidding"
    },
    schemaVersion: 1,
    snapshotVersion: 3,
    ...overrides
  };
}
