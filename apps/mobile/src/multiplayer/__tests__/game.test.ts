import type { GraphqlClient, GraphqlRequest } from "../graphql";
import {
  MultiplayerGameClient,
  type MultiplayerBid
} from "../game";
import type {
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshotPayload,
  MultiplayerPublicGameSnapshot,
  MultiplayerSubmitGameActionResult,
  MultiplayerSubmitGameActionResultPayload
} from "../types";

test("MultiplayerGameClient reads snapshots and parses AWSJSON state", async () => {
  const snapshot: MultiplayerPublicGameSnapshotPayload = {
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    lastCompletedHand: createCompletedHandSummary(),
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
    lastCompletedHand: {
      declarer: "SEAT_0",
      outcome: "set"
    },
    redactedState: {
      dealer: 0,
      phase: "dealt"
    }
  });
  expect(graphql.requests[0]?.operationName).toBe("GetGameSnapshot");
  expect(graphql.requests[0]?.variables).toEqual({
    gameId: "game-1"
  });
  expect(graphql.requests[0]?.query).toContain("lastCompletedHand");
  expect(graphql.requests[0]?.query).toContain("teamTrickCounts");
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

test("MultiplayerGameClient reads reconnect views and parses AWSJSON snapshots", async () => {
  const hand: MultiplayerPrivateHand = {
    dominoes: [
      {
        high: 5,
        key: "5-0",
        low: 0
      }
    ],
    gameId: "game-1",
    handNumber: 1,
    seatIndex: "SEAT_1",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
  const graphql = new MockGraphqlClient({
    getReconnectView: {
      acceptedPendingActionIds: ["action-1"],
      privateHand: hand,
      rejectedPendingActions: [],
      requiresSnapshotRefresh: true,
      serverLastEventSequence: 8,
      serverSnapshotVersion: 8,
      snapshot: {
        gameId: "game-1",
        generatedAt: "2026-05-31T00:00:00.000Z",
        lastEventSequence: 8,
        phase: "trickPlay",
        redactedState: JSON.stringify({
          dealer: 0,
          phase: "trickPlay"
        }),
        schemaVersion: 1,
        snapshotVersion: 8
      },
      unknownPendingActionIds: ["action-2"]
    }
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(
    client.getReconnectView({
      gameId: "game-1",
      lastAppliedEventSequence: 6,
      pendingActionIds: ["action-1", "action-2"],
      snapshotVersion: 6
    })
  ).resolves.toMatchObject({
    acceptedPendingActionIds: ["action-1"],
    privateHand: hand,
    snapshot: {
      lastEventSequence: 8,
      redactedState: {
        dealer: 0,
        phase: "trickPlay"
      }
    },
    unknownPendingActionIds: ["action-2"]
  });
  expect(graphql.requests[0]?.operationName).toBe("GetReconnectView");
  expect(graphql.requests[0]?.variables).toEqual({
    input: {
      gameId: "game-1",
      lastAppliedEventSequence: 6,
      pendingActionIds: ["action-1", "action-2"],
      snapshotVersion: 6
    }
  });
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

test("MultiplayerGameClient starts the next hand through AppSync", async () => {
  const graphql = new MockGraphqlClient({
    startNextHand: {
      accepted: true,
      committed: true,
      duplicate: false,
      events: [
        {
          actionId: "server-deal",
          actorId: "server",
          eventId: "event-32",
          eventType: "fortyTwo.hand.dealt",
          sequence: 32
        }
      ],
      gameId: "game-1",
      snapshot: {
        gameId: "game-1",
        generatedAt: "2026-05-31T00:00:00.000Z",
        handCounts: {
          seat0: 7,
          seat1: 7,
          seat2: 7,
          seat3: 7
        },
        lastEventSequence: 32,
        phase: "dealt",
        redactedState: JSON.stringify({
          dealer: 1,
          handNumber: 2,
          phase: "dealt"
        }),
        schemaVersion: 1,
        snapshotVersion: 32
      }
    } satisfies MultiplayerSubmitGameActionResultPayload
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(
    client.startNextHand({
      gameId: "game-1"
    })
  ).resolves.toMatchObject({
    accepted: true,
    snapshot: {
      phase: "dealt",
      redactedState: {
        handNumber: 2
      }
    }
  });
  expect(graphql.requests[0]?.operationName).toBe("StartNextHand");
  expect(graphql.requests[0]?.variables).toEqual({
    input: {
      gameId: "game-1"
    }
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

test("MultiplayerGameClient submits no-trump calls as AppSync AWSJSON actions", async () => {
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
            kind: "noTrump",
            trump: {
              kind: "none"
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
      trump: {
        kind: "none"
      }
    })
  ).resolves.toMatchObject({
    accepted: true,
    snapshot: {
      redactedState: {
        contract: {
          kind: "noTrump"
        }
      }
    }
  });

  const variables = graphql.requests[0]?.variables as {
    readonly input?: {
      readonly action?: string;
    };
  };
  const action = JSON.parse(variables.input?.action ?? "{}") as {
    readonly action?: {
      readonly payload?: {
        readonly trump?: {
          readonly kind?: string;
        };
      };
    };
  };

  expect(action.action?.payload?.trump).toEqual({
    kind: "none"
  });
});

test("MultiplayerGameClient submits domino plays as AppSync AWSJSON actions", async () => {
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
          currentTrick: {
            ledDomino: {
              high: 6,
              low: 6
            },
            ledSuit: "sixes",
            leader: 1,
            playedDominoes: [
              {
                domino: {
                  high: 6,
                  low: 6
                },
                seat: 1
              }
            ]
          },
          dealer: 0,
          phase: "trickPlay"
        }
      })
    } satisfies MultiplayerSubmitGameActionResult
  });
  const client = new MultiplayerGameClient(graphql);

  await expect(
    client.submitDomino({
      actorId: "actor-sub",
      actorSeat: "SEAT_1",
      domino: {
        high: 6,
        key: "6-6",
        low: 6
      },
      gameId: "game-1",
      knownLastEventSequence: 7,
      knownSnapshotVersion: 7,
      ledSuit: "sixes"
    })
  ).resolves.toMatchObject({
    accepted: true,
    snapshot: {
      phase: "trickPlay"
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
        readonly domino?: {
          readonly high?: number;
          readonly low?: number;
        };
        readonly ledSuit?: string;
        readonly seat?: number;
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
        domino: {
          high: 6,
          low: 6
        },
        ledSuit: "sixes",
        seat: 1
      },
      type: "fortyTwo.domino.play"
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

function createCompletedHandSummary(): NonNullable<
  MultiplayerPublicGameSnapshot["lastCompletedHand"]
> {
  return {
    awardedTeamId: "teamB",
    bidAmount: 32,
    biddingTeamId: "teamA",
    biddingTeamPoints: 29,
    completedAt: "2026-05-31T00:00:00.000Z",
    declarer: "SEAT_0",
    handNumber: 1,
    markAwards: {
      teamA: 0,
      teamB: 1
    },
    outcome: "set",
    teamPoints: {
      teamA: 29,
      teamB: 13
    },
    teamTrickCounts: {
      teamA: 3,
      teamB: 4
    },
    totalPoints: 42
  };
}
