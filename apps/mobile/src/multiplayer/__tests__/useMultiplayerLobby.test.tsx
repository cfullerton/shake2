import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";

import {
  normalizeDisplayName,
  normalizeRoomCode,
  useMultiplayerLobby,
  type MultiplayerLobbyClient,
  type MultiplayerLobbyController,
  type MultiplayerLobbyDependencies
} from "../useMultiplayerLobby";
import type { CognitoAuthSession } from "../auth";
import type { MobileMultiplayerConfig } from "../config";
import type {
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "../types";

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
    signIn: jest.fn(async () => session)
  };
  const roomClient: MultiplayerLobbyClient = {
    createRoom: jest.fn(async () => room),
    joinRoom: jest.fn(async () => room),
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
      roomCode: " room42 "
    });
  });
  await act(async () => {
    await harness.current.takeSeat({
      roomId: "room-1",
      seatIndex: "SEAT_2"
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
  expect(roomClient.startGame).toHaveBeenCalledWith({
    roomId: "room-1",
    targetMarks: 7
  });
  expect(harness.current.room?.status).toBe("inGame");
  expect(harness.current.startedGame).toBe(started);
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

test("normalizes lobby strings", () => {
  expect(normalizeRoomCode(" room42 ")).toBe("ROOM42");
  expect(normalizeDisplayName("  ")).toBe("Player");
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

function createRoomView(): MultiplayerRoomView {
  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    isHost: true,
    participantCount: 1,
    participants: [
      {
        connectionStatus: "online",
        displayName: "Alice",
        isViewer: true,
        joinedAt: "2026-05-31T00:00:00.000Z"
      }
    ],
    roomCode: "ROOM42",
    roomId: "room-1",
    seats: [
      {
        isViewer: false,
        occupied: false,
        seatIndex: "SEAT_0"
      },
      {
        displayName: "Alice",
        isViewer: true,
        occupied: true,
        seatIndex: "SEAT_1"
      },
      {
        isViewer: false,
        occupied: false,
        seatIndex: "SEAT_2"
      },
      {
        isViewer: false,
        occupied: false,
        seatIndex: "SEAT_3"
      }
    ],
    status: "ready",
    updatedAt: "2026-05-31T00:00:00.000Z",
    viewerSeat: "SEAT_1"
  };
}
