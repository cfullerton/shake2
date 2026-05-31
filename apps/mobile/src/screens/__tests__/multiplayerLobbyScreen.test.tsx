import { fireEvent, render, waitFor } from "@testing-library/react-native";

import type { MultiplayerLobbyController } from "../../multiplayer";
import type { CognitoAuthSession } from "../../multiplayer/auth";
import type {
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
  fireEvent.press(view.getByText("Sign In"));

  await waitFor(() => {
    expect(signIn).toHaveBeenCalledWith({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  expect(view.queryByText("temporary-password")).toBeNull();
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

function createLobbyController(
  overrides: Partial<MultiplayerLobbyController> = {}
): MultiplayerLobbyController {
  return {
    busyAction: null,
    addBot: jest.fn(async () => undefined),
    clearError: jest.fn(),
    completeNewPassword: jest.fn(async () => undefined),
    configError: null,
    configured: true,
    createRoom: jest.fn(async () => undefined),
    error: null,
    gameClient: null,
    joinRoom: jest.fn(async () => undefined),
    newPasswordChallenge: null,
    publicRooms: [],
    refreshPublicRooms: jest.fn(async () => undefined),
    refreshRoom: jest.fn(async () => undefined),
    room: null,
    session: createSession(),
    signIn: jest.fn(async () => undefined),
    startGame: jest.fn(async () => undefined),
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
    tokenType: "Bearer",
    username: "smoke-user"
  };
}

function createStartedGame(room: MultiplayerRoomView): MultiplayerStartGameResult {
  return {
    room: {
      ...room,
      gameId: "game-1",
      status: "inGame"
    },
    snapshot: {
      gameId: "game-1",
      generatedAt: "2026-05-31T00:00:00.000Z",
      lastEventSequence: 2,
      phase: "dealt",
      redactedState: {},
      schemaVersion: 1,
      snapshotVersion: 2
    }
  };
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
