import { createMultiplayerActiveGameView } from "../activeGame";
import type {
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView
} from "../types";

test("active game view exposes the current bidder hand and legal opening bids", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: createPrivateHand(),
    room: createRoomView({
      viewerSeat: "SEAT_1"
    }),
    snapshot: createSnapshot({
      phase: "dealt",
      redactedState: {
        dealer: 0,
        handNumber: 1,
        marks: {
          teamA: 1,
          teamB: 2
        },
        phase: "dealt",
        rules: {
          bidding: {
            maximumNumericBid: 42,
            minimumBid: 30
          }
        }
      }
    })
  });

  expect(view.canPass).toBe(true);
  expect(view.currentTurnLabel).toBe("East (You)");
  expect(view.legalBidAmounts[0]).toBe(30);
  expect(view.legalBidAmounts.at(-1)).toBe(42);
  expect(view.privateHand).toHaveLength(2);
  expect(view.teams).toEqual([
    {
      id: "teamA",
      marks: 1,
      name: "North/South"
    },
    {
      id: "teamB",
      marks: 2,
      name: "East/West"
    }
  ]);
  expect(
    view.seatSummaries.find((seat) => seat.seatIndex === "SEAT_1")
  ).toMatchObject({
    handCount: 7,
    isCurrentTurn: true,
    isViewer: true
  });
});

test("active game view raises the next numeric bid above the high bid", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: null,
    room: createRoomView({
      viewerSeat: "SEAT_2"
    }),
    snapshot: createSnapshot({
      phase: "bidding",
      redactedState: {
        bidding: {
          currentSeat: 2,
          highestBid: {
            bid: {
              amount: 34,
              kind: "numeric"
            },
            seat: 1
          }
        },
        dealer: 0,
        phase: "bidding"
      }
    })
  });

  expect(view.canPass).toBe(true);
  expect(view.currentBidLabel).toBe("34");
  expect(view.currentTurnLabel).toBe("South (You)");
  expect(view.legalBidAmounts[0]).toBe(35);
});

test("active game view hides bidding controls while waiting on another seat", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: null,
    room: createRoomView({
      viewerSeat: "SEAT_3"
    }),
    snapshot: createSnapshot({
      phase: "bidding",
      redactedState: {
        bidding: {
          currentSeat: 1
        },
        dealer: 0,
        phase: "bidding"
      }
    })
  });

  expect(view.canPass).toBe(false);
  expect(view.canSubmitBid).toBe(false);
  expect(view.legalBidAmounts).toEqual([]);
  expect(view.waitingMessage).toBe("Waiting for East.");
});

test("active game view exposes trump selection only to the declarer", () => {
  const declarerView = createMultiplayerActiveGameView({
    privateHand: null,
    room: createRoomView({
      viewerSeat: "SEAT_1"
    }),
    snapshot: createSnapshot({
      phase: "trump",
      redactedState: {
        bidding: {
          highestBid: {
            bid: {
              amount: 35,
              kind: "numeric"
            },
            forced: false,
            seat: 1
          }
        },
        dealer: 0,
        phase: "trump",
        trump: {
          contract: null,
          declarer: 1,
          phase: "callingTrump",
          winningBid: {
            bid: {
              amount: 35,
              kind: "numeric"
            },
            forced: false,
            seat: 1
          }
        }
      }
    })
  });
  const partnerView = createMultiplayerActiveGameView({
    privateHand: null,
    room: createRoomView({
      viewerSeat: "SEAT_3"
    }),
    snapshot: declarerViewSnapshot()
  });

  expect(declarerView.canCallTrump).toBe(true);
  expect(declarerView.currentBidLabel).toBe("35");
  expect(declarerView.currentTrumpLabel).toBe("Not called");
  expect(declarerView.currentTurnLabel).toBe("East (You)");
  expect(declarerView.legalTrumpSuits).toEqual([
    "blanks",
    "ones",
    "twos",
    "threes",
    "fours",
    "fives",
    "sixes"
  ]);
  expect(declarerView.waitingMessage).toBe("Call trump.");

  expect(partnerView.canCallTrump).toBe(false);
  expect(partnerView.legalTrumpSuits).toEqual([]);
  expect(partnerView.waitingMessage).toBe("Waiting for East.");
});

test("active game view reads called trump from trick-play contracts", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: null,
    room: createRoomView(),
    snapshot: createSnapshot({
      phase: "trickPlay",
      redactedState: {
        contract: {
          declarer: 1,
          kind: "standardNumeric",
          trump: {
            kind: "pip",
            suit: "fives"
          }
        },
        currentTrick: {
          leader: 1,
          playedDominoes: []
        },
        dealer: 0,
        phase: "trickPlay"
      }
    })
  });

  expect(view.canCallTrump).toBe(false);
  expect(view.currentTrumpLabel).toBe("Fives");
});

test("active game view exposes legal domino plays for the trick leader", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: createPrivateHand(),
    room: createRoomView({
      viewerSeat: "SEAT_1"
    }),
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
          leader: 1,
          playedDominoes: []
        },
        dealer: 0,
        phase: "trickPlay"
      }
    })
  });

  expect(view.canPlayDomino).toBe(true);
  expect(view.currentTrickLeadLabel).toBe("East (You) leads");
  expect(view.legalDominoPlays).toEqual([
    {
      domino: {
        high: 6,
        key: "6-6",
        low: 6
      },
      ledSuit: "sixes"
    },
    {
      domino: {
        high: 5,
        key: "5-4",
        low: 4
      },
      ledSuit: "fives"
    }
  ]);
});

test("active game view filters domino plays when the viewer must follow suit", () => {
  const view = createMultiplayerActiveGameView({
    privateHand: {
      ...createPrivateHand(),
      dominoes: [
        {
          high: 6,
          key: "6-5",
          low: 5
        },
        {
          high: 5,
          key: "5-4",
          low: 4
        }
      ],
      seatIndex: "SEAT_2"
    },
    room: createRoomView({
      viewerSeat: "SEAT_2"
    }),
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
  });

  expect(view.canPlayDomino).toBe(true);
  expect(view.currentTrickLeadLabel).toBe("Sixes led");
  expect(view.currentTrickPlays).toEqual([
    {
      domino: {
        high: 6,
        key: "6-6",
        low: 6
      },
      seatIndex: "SEAT_1",
      seatLabel: "East"
    }
  ]);
  expect(view.legalDominoPlays).toEqual([
    {
      domino: {
        high: 6,
        key: "6-5",
        low: 5
      }
    }
  ]);
});

function declarerViewSnapshot(): MultiplayerPublicGameSnapshot {
  return createSnapshot({
    phase: "trump",
    redactedState: {
      bidding: {
        highestBid: {
          bid: {
            amount: 35,
            kind: "numeric"
          },
          forced: false,
          seat: 1
        }
      },
      dealer: 0,
      phase: "trump",
      trump: {
        contract: null,
        declarer: 1,
        phase: "callingTrump",
        winningBid: {
          bid: {
            amount: 35,
            kind: "numeric"
          },
          forced: false,
          seat: 1
        }
      }
    }
  });
}

function createSnapshot(
  overrides: Partial<MultiplayerPublicGameSnapshot> = {}
): MultiplayerPublicGameSnapshot {
  return {
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    handCounts: {
      seat0: 7,
      seat1: 7,
      seat2: 7,
      seat3: 7
    },
    lastEventSequence: 2,
    phase: "dealt",
    redactedState: {
      dealer: 0,
      phase: "dealt"
    },
    schemaVersion: 1,
    snapshotVersion: 2,
    ...overrides
  };
}

function createPrivateHand(): MultiplayerPrivateHand {
  return {
    dominoes: [
      {
        high: 6,
        key: "6-6",
        low: 6
      },
      {
        high: 5,
        key: "5-4",
        low: 4
      }
    ],
    gameId: "game-1",
    handNumber: 1,
    seatIndex: "SEAT_1",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}

function createRoomView(
  overrides: Partial<MultiplayerRoomView> = {}
): MultiplayerRoomView {
  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    gameId: "game-1",
    isHost: true,
    participantCount: 4,
    participants: [],
    roomCode: "ROOM42",
    roomId: "room-1",
    seats: [
      {
        displayName: "North",
        isViewer: false,
        occupied: true,
        seatIndex: "SEAT_0"
      },
      {
        displayName: "East",
        isViewer: true,
        occupied: true,
        seatIndex: "SEAT_1"
      },
      {
        displayName: "South",
        isViewer: false,
        occupied: true,
        seatIndex: "SEAT_2"
      },
      {
        displayName: "West",
        isViewer: false,
        occupied: true,
        seatIndex: "SEAT_3"
      }
    ],
    status: "inGame",
    updatedAt: "2026-05-31T00:00:00.000Z",
    viewerSeat: "SEAT_1",
    visibility: "private",
    ...overrides
  };
}
