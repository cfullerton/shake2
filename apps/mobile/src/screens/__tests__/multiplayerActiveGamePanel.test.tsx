import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type {
  CognitoAuthSession,
  MultiplayerLobbyGameClient
} from "../../multiplayer";
import type {
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView,
  MultiplayerSubmitGameActionResult
} from "../../multiplayer/types";
import { MultiplayerActiveGamePanel } from "../MultiplayerActiveGamePanel";

test("active game panel loads the viewer hand and submits bids", async () => {
  const hand = createPrivateHand();
  const accepted: MultiplayerSubmitGameActionResult = {
    accepted: true,
    committed: true,
    duplicate: false,
    events: [],
    gameId: "game-1",
    snapshot: createSnapshot({
      lastEventSequence: 3,
      phase: "bidding",
      redactedState: {
        bidding: {
          currentSeat: 2,
          highestBid: {
            bid: {
              amount: 31,
              kind: "numeric"
            },
            seat: 1
          }
        },
        dealer: 0,
        phase: "bidding"
      },
      snapshotVersion: 3
    })
  };
  const client = {
    getGameSnapshot: jest.fn(async () => createSnapshot()),
    getMyPrivateHand: jest.fn(async () => hand),
    submitBid: jest.fn(async () => accepted),
    submitTrump: jest.fn()
  } as unknown as MultiplayerLobbyGameClient;
  const view = render(
    <MultiplayerActiveGamePanel
      actorId="actor-sub"
      client={client}
      initialRoom={createRoomView()}
      initialSnapshot={createSnapshot()}
      session={createSession()}
    />
  );

  await waitFor(() => {
    expect(client.getMyPrivateHand).toHaveBeenCalledWith({
      gameId: "game-1",
      seatIndex: "SEAT_1"
    });
  });
  expect(view.getByLabelText("Domino 6-6")).toBeTruthy();

  fireEvent.press(view.getByText("31"));

  await waitFor(() => {
    expect(client.submitBid).toHaveBeenCalledWith({
      actorId: "actor-sub",
      actorSeat: "SEAT_1",
      bid: {
        amount: 31,
        kind: "numeric"
      },
      gameId: "game-1",
      knownLastEventSequence: 2,
      knownSnapshotVersion: 2
    });
  });
});

test("active game panel submits declarer trump calls", async () => {
  const hand = createPrivateHand();
  const accepted: MultiplayerSubmitGameActionResult = {
    accepted: true,
    committed: true,
    duplicate: false,
    events: [],
    gameId: "game-1",
    snapshot: createSnapshot({
      lastEventSequence: 7,
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
      },
      snapshotVersion: 7
    })
  };
  const client = {
    getGameSnapshot: jest.fn(async () => createTrumpSnapshot()),
    getMyPrivateHand: jest.fn(async () => hand),
    submitBid: jest.fn(),
    submitTrump: jest.fn(async () => accepted)
  } as unknown as MultiplayerLobbyGameClient;
  const view = render(
    <MultiplayerActiveGamePanel
      actorId="actor-sub"
      client={client}
      initialRoom={createRoomView()}
      initialSnapshot={createTrumpSnapshot()}
      session={createSession()}
    />
  );

  await waitFor(() => {
    expect(client.getMyPrivateHand).toHaveBeenCalledWith({
      gameId: "game-1",
      seatIndex: "SEAT_1"
    });
  });

  fireEvent.press(view.getByLabelText("Call Sixes trump"));

  await waitFor(() => {
    expect(client.submitTrump).toHaveBeenCalledWith({
      actorId: "actor-sub",
      actorSeat: "SEAT_1",
      gameId: "game-1",
      knownLastEventSequence: 6,
      knownSnapshotVersion: 6,
      trumpSuit: "sixes"
    });
  });
});

function createSession(): CognitoAuthSession {
  return {
    accessToken: "access-token",
    expiresAt: Date.now() + 60_000,
    idToken: "id-token",
    subject: "actor-sub",
    tokenType: "Bearer",
    username: "smoke-user"
  };
}

function createPrivateHand(): MultiplayerPrivateHand {
  return {
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
      handNumber: 1,
      phase: "dealt",
      rules: {
        bidding: {
          maximumNumericBid: 42,
          minimumBid: 30
        }
      }
    },
    schemaVersion: 1,
    snapshotVersion: 2,
    ...overrides
  };
}

function createTrumpSnapshot(): MultiplayerPublicGameSnapshot {
  return createSnapshot({
    lastEventSequence: 6,
    phase: "trump",
    redactedState: {
      bidding: {
        highestBid: {
          bid: {
            amount: 31,
            kind: "numeric"
          },
          forced: false,
          seat: 1
        }
      },
      dealer: 0,
      handNumber: 1,
      phase: "trump",
      trump: {
        contract: null,
        declarer: 1,
        phase: "callingTrump",
        winningBid: {
          bid: {
            amount: 31,
            kind: "numeric"
          },
          forced: false,
          seat: 1
        }
      }
    },
    snapshotVersion: 6
  });
}

function createRoomView(): MultiplayerRoomView {
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
    viewerSeat: "SEAT_1"
  };
}
