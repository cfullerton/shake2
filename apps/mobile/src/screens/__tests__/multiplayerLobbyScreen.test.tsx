import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import type {
  MultiplayerLobbyController,
  MultiplayerLobbyGameClient
} from "../../multiplayer";
import type { CognitoAuthSession } from "../../multiplayer/auth";
import type {
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "../../multiplayer/types";
import { MultiplayerLobbyContent } from "../MultiplayerLobbyScreen";

test("lobby screen gates missing multiplayer configuration", () => {
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        configured: false,
        configError: "EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL is required."
      })}
    />
  );

  expect(view.getByText("Multiplayer config missing")).toBeTruthy();
  expect(
    view.getByText("EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL is required.")
  ).toBeTruthy();
  expect(view.queryByText("Sign In")).toBeNull();
});

test("lobby screen signs in without exposing the password", async () => {
  const signIn = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        session: null,
        signIn
      })}
    />
  );

  fireEvent.changeText(view.getByLabelText("Username"), "smoke-user");
  fireEvent.changeText(view.getByLabelText("Password"), "temporary-password");
  expect(view.queryByLabelText("Email")).toBeNull();
  expect(view.queryByLabelText("Confirm Password")).toBeNull();
  fireEvent.press(view.getByText("Sign In"));

  await waitFor(() => {
    expect(signIn).toHaveBeenCalledWith({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  expect(view.queryByText("temporary-password")).toBeNull();
});

test("lobby screen creates accounts with username, email, and matching passwords", async () => {
  const signUp = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        session: null,
        signUp
      })}
    />
  );

  expect(view.queryByLabelText("Email")).toBeNull();
  expect(view.queryByLabelText("Confirm Password")).toBeNull();

  fireEvent.press(view.getByText("Create Account"));

  expect(view.getByLabelText("Email")).toBeTruthy();
  expect(view.getByLabelText("Confirm Password")).toBeTruthy();

  fireEvent.changeText(view.getByLabelText("Username"), "new-player");
  fireEvent.changeText(view.getByLabelText("Password"), "secure-password");
  fireEvent.changeText(view.getByLabelText("Email"), "new-player@example.com");
  fireEvent.changeText(view.getByLabelText("Confirm Password"), "secure-password");
  fireEvent.press(view.getByText("Create Account"));

  await waitFor(() => {
    expect(signUp).toHaveBeenCalledWith({
      email: "new-player@example.com",
      password: "secure-password",
      username: "new-player"
    });
  });
});

test("lobby screen verifies pending account confirmations", async () => {
  const confirmSignUp = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        confirmSignUp,
        pendingSignUpConfirmation: {
          deliveryDestination: "n***@example.com",
          deliveryMedium: "EMAIL",
          username: "new-player"
        },
        session: null
      })}
    />
  );

  expect(view.getAllByText("Verify Account").length).toBeGreaterThan(0);
  expect(
    view.getByText("Verification code sent by email to n***@example.com.")
  ).toBeTruthy();

  fireEvent.changeText(view.getByLabelText("Verification Code"), "123456");
  const verifyButtons = view.getAllByText("Verify Account");
  fireEvent.press(verifyButtons[verifyButtons.length - 1]!);

  await waitFor(() => {
    expect(confirmSignUp).toHaveBeenCalledWith({
      confirmationCode: "123456",
      password: "",
      username: "new-player"
    });
  });
});

test("lobby screen returns account creation fields to sign-in mode", () => {
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        session: null
      })}
    />
  );

  fireEvent.press(view.getByText("Create Account"));
  expect(view.getByLabelText("Email")).toBeTruthy();
  expect(view.getByLabelText("Confirm Password")).toBeTruthy();

  fireEvent.press(view.getByText("Sign In Instead"));
  expect(view.queryByLabelText("Email")).toBeNull();
  expect(view.queryByLabelText("Confirm Password")).toBeNull();
});

test("lobby screen hides table controls when signed out", () => {
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        session: null
      })}
    />
  );

  expect(view.getByText("Sign In")).toBeTruthy();
  expect(view.queryByText("Table Name")).toBeNull();
  expect(view.queryByText("Create")).toBeNull();
  expect(view.queryByText("Join")).toBeNull();
  expect(view.queryByText("Create Room")).toBeNull();
  expect(view.queryByText("Join Room")).toBeNull();
});

test("lobby screen completes new password challenges", async () => {
  const completeNewPassword = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        completeNewPassword,
        newPasswordChallenge: {
          challengeName: "NEW_PASSWORD_REQUIRED",
          session: "challenge-session",
          username: "canonical-user"
        },
        session: null
      })}
    />
  );

  expect(view.getByText("New Password Required")).toBeTruthy();

  fireEvent.changeText(view.getByLabelText("New Password"), "permanent-password");
  fireEvent.press(view.getByText("Set Password"));

  await waitFor(() => {
    expect(completeNewPassword).toHaveBeenCalledWith({
      newPassword: "permanent-password"
    });
  });
  expect(view.queryByText("permanent-password")).toBeNull();
});

test("lobby screen renders seats and starts ready host rooms", async () => {
  const room = createRoomView({
    status: "ready"
  });
  const addBot = jest.fn(async () => undefined);
  const startGame = jest.fn(async () => undefined);
  const takeSeat = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        addBot,
        room,
        startGame,
        takeSeat
      })}
    />
  );

  expect(view.getByText("ROOM42")).toBeTruthy();
  expect(view.getAllByText("Alice").length).toBeGreaterThan(0);

  fireEvent.press(view.getByLabelText("East seat empty"));
  await waitFor(() => {
    expect(takeSeat).toHaveBeenCalledWith({
      roomId: "room-1",
      seatIndex: "SEAT_1"
    });
  });

  fireEvent.press(view.getByText("Fill Bots"));
  await waitFor(() => {
    expect(addBot).toHaveBeenCalledWith({
      roomId: "room-1",
      seatIndex: "SEAT_1"
    });
  });

  fireEvent.press(view.getByText("Start Game"));
  await waitFor(() => {
    expect(startGame).toHaveBeenCalledWith({
      roomId: "room-1",
      targetMarks: 7
    });
  });
  expect(view.queryByText("Game starting")).toBeNull();
});

test("lobby screen starts host rooms with no-trump enabled", async () => {
  const room = createRoomView({
    status: "ready"
  });
  const startGame = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        room,
        startGame
      })}
    />
  );

  fireEvent.press(view.getByLabelText("No Trump"));
  fireEvent.press(view.getByText("Start Game"));

  await waitFor(() => {
    expect(startGame).toHaveBeenCalledWith({
      noTrump: true,
      roomId: "room-1",
      targetMarks: 7
    });
  });
});

test("lobby screen starts host rooms with mark bids enabled", async () => {
  const room = createRoomView({
    status: "ready"
  });
  const startGame = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        room,
        startGame
      })}
    />
  );

  fireEvent.press(view.getByLabelText("Mark Bids"));
  fireEvent.press(view.getByText("Start Game"));

  await waitFor(() => {
    expect(startGame).toHaveBeenCalledWith({
      markBids: true,
      roomId: "room-1",
      targetMarks: 7
    });
  });
});

test("lobby screen creates public rooms and joins public listings", async () => {
  const publicRoom = createRoomView({
    participantCount: 1,
    status: "waiting",
    visibility: "public"
  });
  const createRoom = jest.fn(async () => undefined);
  const joinRoom = jest.fn(async () => undefined);
  const refreshPublicRooms = jest.fn(async () => undefined);
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        createRoom,
        joinRoom,
        publicRooms: [publicRoom],
        refreshPublicRooms
      })}
    />
  );

  fireEvent.press(view.getByText("Public"));
  fireEvent.press(view.getByText("Create Room"));

  await waitFor(() => {
    expect(createRoom).toHaveBeenCalledWith({
      displayName: "smoke-user",
      visibility: "public"
    });
  });

  fireEvent.press(view.getByLabelText("Refresh public rooms"));
  await waitFor(() => {
    expect(refreshPublicRooms).toHaveBeenCalled();
  });

  const joinButtons = view.getAllByText("Join");
  fireEvent.press(joinButtons[joinButtons.length - 1]!);
  await waitFor(() => {
    expect(joinRoom).toHaveBeenCalledWith({
      displayName: "smoke-user",
      roomCode: "ROOM42"
    });
  });
});

test("lobby screen hands started games to the active-game surface", () => {
  const room = createRoomView({
    status: "ready"
  });
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        room,
        startedGame: createStartedGame(room)
      })}
    />
  );

  expect(view.getByText("Game starting")).toBeTruthy();
  expect(view.queryByText("Create Room")).toBeNull();
  expect(view.queryByText("Start Game")).toBeNull();
});

test("lobby screen routes completed games back to new-room setup", async () => {
  const room = createRoomView({
    status: "ready"
  });
  const snapshot = createGameCompleteSnapshot();
  const gameClient = createGameClient(snapshot);
  const startNewGame = jest.fn();
  const view = render(
    <MultiplayerLobbyContent
      lobby={createLobbyController({
        gameClient,
        room,
        startedGame: createStartedGame(room, snapshot),
        startNewGame
      })}
    />
  );

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(view.getAllByText("Game Complete").length).toBeGreaterThan(0);

  fireEvent.press(view.getByText("Start New Game"));

  expect(startNewGame).toHaveBeenCalledTimes(1);
});

function createLobbyController(
  overrides: Partial<MultiplayerLobbyController> = {}
): MultiplayerLobbyController {
  return {
    busyAction: null,
    addBot: jest.fn(async () => undefined),
    clearError: jest.fn(),
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => undefined),
    configError: null,
    configured: true,
    createRoom: jest.fn(async () => undefined),
    error: null,
    gameClient: null,
    joinRoom: jest.fn(async () => undefined),
    newPasswordChallenge: null,
    pendingSignUpConfirmation: null,
    publicRooms: [],
    refreshPublicRooms: jest.fn(async () => undefined),
    refreshRoom: jest.fn(async () => undefined),
    room: null,
    session: createSession(),
    signIn: jest.fn(async () => undefined),
    signUp: jest.fn(async () => undefined),
    startGame: jest.fn(async () => undefined),
    startNewGame: jest.fn(),
    startedGame: null,
    takeSeat: jest.fn(async () => undefined),
    ...overrides
  };
}

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

function createStartedGame(
  room: MultiplayerRoomView,
  snapshot: MultiplayerPublicGameSnapshot = createSnapshot()
): MultiplayerStartGameResult {
  return {
    room: {
      ...room,
      gameId: "game-1",
      status: "inGame"
    },
    snapshot
  };
}

function createGameClient(
  snapshot: MultiplayerPublicGameSnapshot = createSnapshot()
): MultiplayerLobbyGameClient {
  return {
    getGameSnapshot: jest.fn(async () => snapshot),
    getMyPrivateHand: jest.fn(),
    submitBid: jest.fn(),
    submitDomino: jest.fn(),
    submitTrump: jest.fn()
  } as unknown as MultiplayerLobbyGameClient;
}

function createRoomView(
  overrides: Partial<MultiplayerRoomView> = {}
): MultiplayerRoomView {
  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    gameId: null,
    isHost: true,
    participantCount: 4,
    participants: [
      {
        connectionStatus: "online",
        displayName: "Alice",
        isBot: false,
        isViewer: true,
        joinedAt: "2026-05-31T00:00:00.000Z"
      }
    ],
    roomCode: "ROOM42",
    roomId: "room-1",
    seats: [
      {
        displayName: "North",
        isBot: false,
        isViewer: false,
        occupied: true,
        seatIndex: "SEAT_0"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_1"
      },
      {
        displayName: "Alice",
        isBot: false,
        isViewer: true,
        occupied: true,
        seatIndex: "SEAT_2"
      },
      {
        displayName: "West",
        isBot: false,
        isViewer: false,
        occupied: true,
        seatIndex: "SEAT_3"
      }
    ],
    status: "waiting",
    updatedAt: "2026-05-31T00:00:00.000Z",
    viewerSeat: "SEAT_2",
    visibility: "private",
    ...overrides
  };
}

function createSnapshot(
  overrides: Partial<MultiplayerPublicGameSnapshot> = {}
): MultiplayerPublicGameSnapshot {
  return {
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    lastEventSequence: 2,
    phase: "dealt",
    redactedState: {},
    schemaVersion: 1,
    snapshotVersion: 2,
    ...overrides
  };
}

function createGameCompleteSnapshot(): MultiplayerPublicGameSnapshot {
  return createSnapshot({
    handCounts: null,
    lastCompletedHand: {
      awardedTeamId: "teamB",
      bidAmount: 32,
      bidLabel: "32",
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
    },
    lastEventSequence: 35,
    phase: "gameComplete",
    redactedState: {
      dealer: 1,
      handNumber: 2,
      marks: {
        teamA: 0,
        teamB: 7
      },
      phase: "gameComplete",
      winningTeamId: "teamB"
    },
    snapshotVersion: 35
  });
}
