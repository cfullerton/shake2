import { act, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import {
  normalizeDisplayName,
  normalizeRoomCode,
  useMultiplayerLobby,
  type MultiplayerLobbyGameClient,
  type MultiplayerLobbyClient,
  type MultiplayerLobbyController,
  type MultiplayerLobbyDependencies
} from "../useMultiplayerLobby";
import type { CognitoAuthSession, CognitoSignUpResult } from "../auth";
import {
  CognitoNewPasswordRequiredError,
  CognitoUserNotConfirmedError
} from "../auth";
import type { MobileMultiplayerConfig } from "../config";
import type {
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "../types";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("normalizes lobby form values before room requests", async () => {
  const session = createSession();
  const room = createRoomView();
  const started: MultiplayerStartGameResult = {
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
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => room),
    createRoom: jest.fn(async () => room),
    getRoom: jest.fn(async () => room),
    joinRoom: jest.fn(async () => room),
    listPublicRooms: jest.fn(async () => [room]),
    startGame: jest.fn(async () => started),
    takeSeat: jest.fn(async () => room)
  };
  const dependencies: MultiplayerLobbyDependencies = {
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  };
  const harness = renderHookHarness(dependencies);

  await act(async () => {
    await harness.current.signIn({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  await act(async () => {
    await harness.current.createRoom({
      displayName: "   "
    });
  });
  await act(async () => {
    await harness.current.joinRoom({
      displayName: " Alice ",
      roomCode: " room-42 "
    });
  });
  await act(async () => {
    await harness.current.takeSeat({
      roomId: "room-1",
      seatIndex: "SEAT_2"
    });
  });
  await act(async () => {
    await harness.current.addBot({
      roomId: "room-1",
      seatIndex: "SEAT_0"
    });
  });
  await act(async () => {
    await harness.current.startGame({
      roomId: "room-1",
      targetMarks: 7
    });
  });

  expect(authClient.signIn).toHaveBeenCalledWith({
    password: "temporary-password",
    username: "smoke-user"
  });
  expect(roomClient.createRoom).toHaveBeenCalledWith({
    displayName: "Player"
  });
  expect(roomClient.joinRoom).toHaveBeenCalledWith({
    displayName: "Alice",
    roomCode: "ROOM42"
  });
  expect(roomClient.takeSeat).toHaveBeenCalledWith({
    roomId: "room-1",
    seatIndex: "SEAT_2"
  });
  expect(roomClient.addBot).toHaveBeenCalledWith({
    roomId: "room-1",
    seatIndex: "SEAT_0"
  });
  expect(roomClient.startGame).toHaveBeenCalledWith({
    roomId: "room-1",
    targetMarks: 7
  });
  expect(harness.current.room?.status).toBe("inGame");
  expect(harness.current.startedGame).toBe(started);
});

test("starts account confirmation after sign-up and signs in after verification", async () => {
  const session = createSession();
  const room = createRoomView();
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () =>
      createSignUpResult("new-player", {
        deliveryDestination: "n***@example.com",
        deliveryMedium: "EMAIL"
      })
    )
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => room),
    createRoom: jest.fn(async () => room),
    getRoom: jest.fn(async () => room),
    joinRoom: jest.fn(async () => room),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room,
      snapshot: createSnapshot()
    })),
    takeSeat: jest.fn(async () => room)
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signUp({
      email: " new-player@example.com ",
      password: "secure-password",
      username: " new-player "
    });
  });

  expect(authClient.signUp).toHaveBeenCalledWith({
    email: "new-player@example.com",
    password: "secure-password",
    username: "new-player"
  });
  expect(harness.current.pendingSignUpConfirmation).toEqual({
    deliveryDestination: "n***@example.com",
    deliveryMedium: "EMAIL",
    username: "new-player"
  });
  expect(harness.current.session).toBeNull();

  await act(async () => {
    await harness.current.confirmSignUp({
      confirmationCode: " 123456 ",
      password: "secure-password",
      username: " new-player "
    });
  });

  expect(authClient.confirmSignUp).toHaveBeenCalledWith({
    confirmationCode: "123456",
    username: "new-player"
  });
  expect(authClient.signIn).toHaveBeenCalledWith({
    password: "secure-password",
    username: "new-player"
  });
  expect(harness.current.pendingSignUpConfirmation).toBeNull();
  expect(harness.current.session).toBe(session);
});

test("routes unconfirmed sign-ins to account verification", async () => {
  const session = createSession();
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => {
      throw new CognitoUserNotConfirmedError("new-player");
    }),
    signUp: jest.fn(async () => createSignUpResult("new-player"))
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => ({
      addBot: jest.fn(async () => createRoomView()),
      createRoom: jest.fn(async () => createRoomView()),
      getRoom: jest.fn(async () => createRoomView()),
      joinRoom: jest.fn(async () => createRoomView()),
      listPublicRooms: jest.fn(async () => []),
      startGame: jest.fn(async () => ({
        room: createRoomView(),
        snapshot: createSnapshot()
      })),
      takeSeat: jest.fn(async () => createRoomView())
    }),
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signIn({
      password: "secure-password",
      username: " new-player "
    });
  });

  expect(authClient.signIn).toHaveBeenCalledWith({
    password: "secure-password",
    username: "new-player"
  });
  expect(harness.current.error).toBeNull();
  expect(harness.current.pendingSignUpConfirmation).toEqual({
    username: "new-player"
  });
  expect(harness.current.session).toBeNull();
});

test("refreshes room state and starts non-hosts when the host starts", async () => {
  const session = createSession();
  const readyRoom = createRoomView({
    isHost: false,
    status: "ready"
  });
  const startedRoom = {
    ...readyRoom,
    gameId: "game-1",
    status: "inGame"
  };
  const snapshot = createSnapshot();
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => readyRoom),
    createRoom: jest.fn(async () => readyRoom),
    getRoom: jest.fn(async () => startedRoom),
    joinRoom: jest.fn(async () => readyRoom),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room: startedRoom,
      snapshot
    })),
    takeSeat: jest.fn(async () => readyRoom)
  };
  const gameClient: MultiplayerLobbyGameClient = {
    getGameSnapshot: jest.fn(async () => snapshot)
  } as unknown as MultiplayerLobbyGameClient;
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createGameClient: () => gameClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signIn({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  await act(async () => {
    await harness.current.joinRoom({
      displayName: "Bob",
      roomCode: "ROOM42"
    });
  });
  await act(async () => {
    await harness.current.refreshRoom();
  });

  expect(roomClient.getRoom).toHaveBeenCalledWith({
    roomId: "room-1"
  });
  expect(gameClient.getGameSnapshot).toHaveBeenCalledWith("game-1");
  expect(harness.current.startedGame).toEqual({
    room: startedRoom,
    snapshot
  });
});

test("refreshes public room listings", async () => {
  const session = createSession();
  const publicRoom = createRoomView({
    visibility: "public"
  });
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => publicRoom),
    createRoom: jest.fn(async () => publicRoom),
    getRoom: jest.fn(async () => publicRoom),
    joinRoom: jest.fn(async () => publicRoom),
    listPublicRooms: jest.fn(async () => [publicRoom]),
    startGame: jest.fn(async () => ({
      room: publicRoom,
      snapshot: createSnapshot()
    })),
    takeSeat: jest.fn(async () => publicRoom)
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signIn({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  await act(async () => {
    await harness.current.refreshPublicRooms();
  });

  await waitFor(() => {
    expect(harness.current.publicRooms).toEqual([publicRoom]);
  });
});

test("startNewGame keeps the session and clears the completed game", async () => {
  const session = createSession();
  const room = createRoomView();
  const started: MultiplayerStartGameResult = {
    room: {
      ...room,
      gameId: "game-1",
      status: "inGame"
    },
    snapshot: createSnapshot({
      handCounts: null,
      phase: "gameComplete",
      redactedState: {
        phase: "gameComplete",
        winningTeamId: "teamA"
      }
    })
  };
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => room),
    createRoom: jest.fn(async () => room),
    getRoom: jest.fn(async () => room),
    joinRoom: jest.fn(async () => room),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => started),
    takeSeat: jest.fn(async () => room)
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signIn({
      password: "temporary-password",
      username: "smoke-user"
    });
  });
  await act(async () => {
    await harness.current.startGame({
      roomId: "room-1",
      targetMarks: 7
    });
  });

  expect(harness.current.startedGame).toBe(started);

  await act(async () => {
    harness.current.startNewGame();
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(harness.current.session).toBe(session);
  expect(harness.current.room).toBeNull();
  expect(harness.current.startedGame).toBeNull();
});

test("reports missing multiplayer config without creating clients", async () => {
  const createAuthClient = jest.fn();
  const harness = renderHookHarness({
    createAuthClient,
    readConfig: () => null
  });

  expect(harness.current.configured).toBe(false);

  await act(async () => {
    await harness.current.signIn({
      password: "do-not-print",
      username: "smoke-user"
    });
  });

  expect(createAuthClient).not.toHaveBeenCalled();
  expect(harness.current.error).toBe("Multiplayer is not configured.");
});

test("completes Cognito new-password challenges", async () => {
  const session = createSession();
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    signIn: jest.fn(async () => {
      throw new CognitoNewPasswordRequiredError({
        challengeName: "NEW_PASSWORD_REQUIRED",
        session: "challenge-session",
        username: "canonical-user"
      });
    }),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => createRoomView()),
    createRoom: jest.fn(async () => createRoomView()),
    getRoom: jest.fn(async () => createRoomView()),
    joinRoom: jest.fn(async () => createRoomView()),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room: createRoomView(),
      snapshot: {
        gameId: "game-1",
        generatedAt: "2026-05-31T00:00:00.000Z",
        lastEventSequence: 2,
        phase: "dealt",
        redactedState: {},
        schemaVersion: 1,
        snapshotVersion: 2
      }
    })),
    takeSeat: jest.fn(async () => createRoomView())
  };
  const dependencies: MultiplayerLobbyDependencies = {
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    readConfig: () => createConfig()
  };
  const harness = renderHookHarness(dependencies);

  await act(async () => {
    await harness.current.signIn({
      password: "temporary-password",
      username: "smoke-user"
    });
  });

  expect(harness.current.error).toBeNull();
  expect(harness.current.session).toBeNull();
  expect(harness.current.newPasswordChallenge).toEqual({
    challengeName: "NEW_PASSWORD_REQUIRED",
    session: "challenge-session",
    username: "canonical-user"
  });

  await act(async () => {
    await harness.current.completeNewPassword({
      newPassword: "permanent-password"
    });
  });

  expect(authClient.completeNewPassword).toHaveBeenCalledWith({
    newPassword: "permanent-password",
    session: "challenge-session",
    username: "canonical-user"
  });
  expect(harness.current.newPasswordChallenge).toBeNull();
  expect(harness.current.session).toBe(session);
});

test("normalizes lobby strings", () => {
  expect(normalizeRoomCode(" room42 ")).toBe("ROOM42");
  expect(normalizeRoomCode(" ab-c 12 ")).toBe("ABC12");
  expect(normalizeDisplayName("  ")).toBe("Player");
});

test("restores a valid persisted session on mount", async () => {
  const stored = createSession();
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => createRoomView()),
    createRoom: jest.fn(async () => createRoomView()),
    getRoom: jest.fn(async () => createRoomView()),
    joinRoom: jest.fn(async () => createRoomView()),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room: createRoomView(),
      snapshot: createSnapshot()
    })),
    takeSeat: jest.fn(async () => createRoomView())
  };
  const harness = renderHookHarness({
    loadSession: async () => stored,
    createRoomClient: () => roomClient,
    createGameClient: () => ({ getGameSnapshot: jest.fn() } as unknown as MultiplayerLobbyGameClient),
    readConfig: () => createConfig()
  });

  await waitFor(() => {
    expect(harness.current.session).toEqual(stored);
  });
});

test("discards an expired persisted session with no refresh token", async () => {
  const expired = { ...createSession(), expiresAt: Date.now() - 1_000, refreshToken: undefined };
  const saveSession = jest.fn(async () => undefined);
  const harness = renderHookHarness({
    loadSession: async () => expired,
    saveSession,
    readConfig: () => createConfig()
  });

  await waitFor(() => {
    expect(saveSession).toHaveBeenCalledWith(null);
  });

  expect(harness.current.session).toBeNull();
});

test("refreshes an expired persisted session using the refresh token", async () => {
  const expired = {
    ...createSession(),
    expiresAt: Date.now() - 1_000,
    refreshToken: "old-refresh-token"
  };
  const refreshed = {
    ...createSession(),
    accessToken: "new-access-token",
    refreshToken: "old-refresh-token"
  };
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => createSession()),
    refreshSession: jest.fn(async () => refreshed),
    signIn: jest.fn(async () => createSession()),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => createRoomView()),
    createRoom: jest.fn(async () => createRoomView()),
    getRoom: jest.fn(async () => createRoomView()),
    joinRoom: jest.fn(async () => createRoomView()),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room: createRoomView(),
      snapshot: createSnapshot()
    })),
    takeSeat: jest.fn(async () => createRoomView())
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    createGameClient: () => ({ getGameSnapshot: jest.fn() } as unknown as MultiplayerLobbyGameClient),
    loadSession: async () => expired,
    readConfig: () => createConfig()
  });

  await waitFor(() => {
    expect(harness.current.session).toEqual(refreshed);
  });

  expect(authClient.refreshSession).toHaveBeenCalledWith({
    refreshToken: "old-refresh-token",
    username: "smoke-user"
  });
});

test("clears a persisted session when refresh fails", async () => {
  const expired = {
    ...createSession(),
    expiresAt: Date.now() - 1_000,
    refreshToken: "bad-refresh-token"
  };
  const saveSession = jest.fn(async () => undefined);
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => createSession()),
    refreshSession: jest.fn(async () => { throw new Error("Token expired"); }),
    signIn: jest.fn(async () => createSession()),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    loadSession: async () => expired,
    saveSession,
    readConfig: () => createConfig()
  });

  await waitFor(() => {
    expect(saveSession).toHaveBeenCalledWith(null);
  });

  expect(harness.current.session).toBeNull();
});

test("saves session to storage on sign-in", async () => {
  const session = createSession();
  const saveSession = jest.fn(async () => undefined);
  const authClient = {
    confirmSignUp: jest.fn(async () => undefined),
    completeNewPassword: jest.fn(async () => session),
    refreshSession: jest.fn(async () => session),
    signIn: jest.fn(async () => session),
    signUp: jest.fn(async () => createSignUpResult("smoke-user"))
  };
  const roomClient: MultiplayerLobbyClient = {
    addBot: jest.fn(async () => createRoomView()),
    createRoom: jest.fn(async () => createRoomView()),
    getRoom: jest.fn(async () => createRoomView()),
    joinRoom: jest.fn(async () => createRoomView()),
    listPublicRooms: jest.fn(async () => []),
    startGame: jest.fn(async () => ({
      room: createRoomView(),
      snapshot: createSnapshot()
    })),
    takeSeat: jest.fn(async () => createRoomView())
  };
  const harness = renderHookHarness({
    createAuthClient: () => authClient,
    createRoomClient: () => roomClient,
    loadSession: async () => null,
    saveSession,
    readConfig: () => createConfig()
  });

  await act(async () => {
    await harness.current.signIn({
      password: "secure-password",
      username: "smoke-user"
    });
  });

  expect(saveSession).toHaveBeenCalledWith(session);
});

function renderHookHarness(dependencies: MultiplayerLobbyDependencies): {
  readonly current: MultiplayerLobbyController;
} {
  const harness = {
    current: null as MultiplayerLobbyController | null
  };

  function Harness() {
    harness.current = useMultiplayerLobby(dependencies);

    return <Text>{harness.current.room?.roomCode ?? "no-room"}</Text>;
  }

  render(<Harness />);

  if (!harness.current) {
    throw new Error("Harness did not render.");
  }

  return harness as {
    readonly current: MultiplayerLobbyController;
  };
}

function createConfig(): MobileMultiplayerConfig {
  return {
    appSyncGraphqlUrl: "https://example.appsync-api.us-east-1.amazonaws.com/graphql",
    appSyncRealtimeUrl: "wss://example.appsync-realtime-api.us-east-1.amazonaws.com/graphql",
    awsRegion: "us-east-1",
    cognitoUserPoolClientId: "client-id",
    cognitoUserPoolId: "pool-id"
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

function createSignUpResult(
  username: string,
  overrides: Partial<CognitoSignUpResult> = {}
): CognitoSignUpResult {
  return {
    userConfirmed: false,
    username,
    ...overrides
  };
}

function createRoomView(
  overrides: Partial<MultiplayerRoomView> = {}
): MultiplayerRoomView {
  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    isHost: true,
    participantCount: 1,
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
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_0"
      },
      {
        displayName: "Alice",
        isBot: false,
        isViewer: true,
        occupied: true,
        seatIndex: "SEAT_1"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_2"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_3"
      }
    ],
    status: "ready",
    updatedAt: "2026-05-31T00:00:00.000Z",
    viewerSeat: "SEAT_1",
    visibility: "private",
    ...overrides
  };
}

function createSnapshot(
  overrides: Partial<MultiplayerStartGameResult["snapshot"]> = {}
): MultiplayerStartGameResult["snapshot"] {
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
