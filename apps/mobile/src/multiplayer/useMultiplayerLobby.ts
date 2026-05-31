import { useEffect, useRef, useState } from "react";

import {
  CognitoNewPasswordRequiredError,
  CognitoPasswordAuthClient,
  type CognitoAuthSession,
  type CognitoCompleteNewPasswordInput,
  type CognitoNewPasswordChallenge,
  type CognitoPasswordSignInInput,
  StaticAuthSessionProvider
} from "./auth";
import {
  type MobileMultiplayerConfig,
  MobileMultiplayerConfigError,
  readMobileMultiplayerConfig
} from "./config";
import { AppSyncGraphqlClient } from "./graphql";
import { MultiplayerGameClient } from "./game";
import {
  type CreateRoomInput,
  type GetRoomInput,
  type JoinRoomInput,
  MultiplayerRoomClient,
  type StartGameInput,
  type TakeSeatInput
} from "./rooms";
import type {
  AppSyncSeatIndex,
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "./types";

export type MultiplayerLobbyAction =
  | "completeNewPassword"
  | "createRoom"
  | "joinRoom"
  | "refreshPublicRooms"
  | "refreshRoom"
  | "signIn"
  | "startGame"
  | "takeSeat";

export interface MultiplayerLobbyClient {
  createRoom(input: CreateRoomInput): Promise<MultiplayerRoomView>;
  getRoom(input: GetRoomInput): Promise<MultiplayerRoomView>;
  joinRoom(input: JoinRoomInput): Promise<MultiplayerRoomView>;
  listPublicRooms(): Promise<readonly MultiplayerRoomView[]>;
  startGame(input: StartGameInput): Promise<MultiplayerStartGameResult>;
  takeSeat(input: TakeSeatInput): Promise<MultiplayerRoomView>;
}

export type MultiplayerLobbyGameClient = MultiplayerGameClient;

export interface MultiplayerLobbyAuthClient {
  completeNewPassword(
    input: CognitoCompleteNewPasswordInput
  ): Promise<CognitoAuthSession>;
  signIn(input: CognitoPasswordSignInInput): Promise<CognitoAuthSession>;
}

export interface MultiplayerLobbyCompleteNewPasswordInput {
  readonly newPassword: string;
}

export interface MultiplayerLobbyDependencies {
  readonly createAuthClient?: (
    config: MobileMultiplayerConfig
  ) => MultiplayerLobbyAuthClient;
  readonly createRoomClient?: (
    config: MobileMultiplayerConfig,
    session: CognitoAuthSession
  ) => MultiplayerLobbyClient;
  readonly createGameClient?: (
    config: MobileMultiplayerConfig,
    session: CognitoAuthSession
  ) => MultiplayerLobbyGameClient;
  readonly readConfig?: () => MobileMultiplayerConfig | null;
}

export interface MultiplayerLobbyState {
  readonly busyAction: MultiplayerLobbyAction | null;
  readonly configError: string | null;
  readonly configured: boolean;
  readonly error: string | null;
  readonly gameClient: MultiplayerLobbyGameClient | null;
  readonly newPasswordChallenge: CognitoNewPasswordChallenge | null;
  readonly publicRooms: readonly MultiplayerRoomView[];
  readonly room: MultiplayerRoomView | null;
  readonly session: CognitoAuthSession | null;
  readonly startedGame: MultiplayerStartGameResult | null;
}

export interface MultiplayerLobbyController extends MultiplayerLobbyState {
  clearError(): void;
  completeNewPassword(
    input: MultiplayerLobbyCompleteNewPasswordInput
  ): Promise<void>;
  createRoom(input: CreateRoomInput): Promise<void>;
  joinRoom(input: JoinRoomInput): Promise<void>;
  refreshPublicRooms(): Promise<void>;
  refreshRoom(): Promise<void>;
  signIn(input: CognitoPasswordSignInInput): Promise<void>;
  startGame(input: StartGameInput): Promise<void>;
  takeSeat(input: TakeSeatInput): Promise<void>;
}

export const seatDisplayLabels: Record<AppSyncSeatIndex, string> = {
  SEAT_0: "North",
  SEAT_1: "East",
  SEAT_2: "South",
  SEAT_3: "West"
};

export const orderedSeatIndexes: readonly AppSyncSeatIndex[] = [
  "SEAT_0",
  "SEAT_1",
  "SEAT_2",
  "SEAT_3"
];

export function normalizeRoomCode(value: string): string {
  return value.trim().replace(/[\s-]/gu, "").toUpperCase();
}

export function normalizeDisplayName(value: string): string {
  return value.trim() || "Player";
}

export function canStartMultiplayerRoom(room: MultiplayerRoomView | null): boolean {
  return Boolean(room?.isHost && room.status === "ready");
}

export const multiplayerRoomSyncIntervalMs = 2_000;
export const multiplayerPublicRoomsSyncIntervalMs = 5_000;

export function useMultiplayerLobby(
  dependencies: MultiplayerLobbyDependencies = {}
): MultiplayerLobbyController {
  const [configState] = useState(() => resolveConfigState(dependencies));
  const [busyAction, setBusyAction] = useState<MultiplayerLobbyAction | null>(null);
  const [client, setClient] = useState<MultiplayerLobbyClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameClient, setGameClient] =
    useState<MultiplayerLobbyGameClient | null>(null);
  const [newPasswordChallenge, setNewPasswordChallenge] =
    useState<CognitoNewPasswordChallenge | null>(null);
  const [publicRooms, setPublicRooms] =
    useState<readonly MultiplayerRoomView[]>([]);
  const [room, setRoom] = useState<MultiplayerRoomView | null>(null);
  const [session, setSession] = useState<CognitoAuthSession | null>(null);
  const [startedGame, setStartedGame] =
    useState<MultiplayerStartGameResult | null>(null);
  const publicRoomsRefreshInFlight = useRef(false);
  const roomRefreshInFlight = useRef(false);

  const configured = configState.config !== null && configState.error === null;

  useEffect(() => {
    if (!client || !room || startedGame) {
      return;
    }

    const interval = setInterval(() => {
      void refreshRoomSilently();
    }, multiplayerRoomSyncIntervalMs);

    void refreshRoomSilently();

    return () => {
      clearInterval(interval);
    };
  }, [client, room?.roomId, startedGame]);

  useEffect(() => {
    if (!client || room || startedGame) {
      return;
    }

    const interval = setInterval(() => {
      void refreshPublicRoomsSilently();
    }, multiplayerPublicRoomsSyncIntervalMs);

    void refreshPublicRoomsSilently();

    return () => {
      clearInterval(interval);
    };
  }, [client, room?.roomId, startedGame]);

  async function signIn(input: CognitoPasswordSignInInput): Promise<void> {
    await runAction("signIn", async () => {
      const config = requireResolvedConfig(configState);
      const authClient = (dependencies.createAuthClient ?? createDefaultAuthClient)(
        config
      );

      try {
        const nextSession = await authClient.signIn(input);

        completeSignIn(config, nextSession);
      } catch (caught) {
        if (caught instanceof CognitoNewPasswordRequiredError) {
          setClient(null);
          setGameClient(null);
          setNewPasswordChallenge(caught.challenge);
          setPublicRooms([]);
          setRoom(null);
          setSession(null);
          setStartedGame(null);
          return;
        }

        throw caught;
      }
    });
  }

  async function completeNewPassword(
    input: MultiplayerLobbyCompleteNewPasswordInput
  ): Promise<void> {
    await runAction("completeNewPassword", async () => {
      const config = requireResolvedConfig(configState);
      const challenge = requireNewPasswordChallenge(newPasswordChallenge);
      const authClient = (dependencies.createAuthClient ?? createDefaultAuthClient)(
        config
      );
      const nextSession = await authClient.completeNewPassword({
        newPassword: input.newPassword,
        session: challenge.session,
        username: challenge.username
      });

      completeSignIn(config, nextSession);
    });
  }

  async function createRoom(input: CreateRoomInput): Promise<void> {
    await runAction("createRoom", async () => {
      const nextRoom = await requireClient(client).createRoom({
        displayName: normalizeDisplayName(input.displayName),
        ...(input.visibility ? { visibility: input.visibility } : {})
      });

      setPublicRooms([]);
      setRoom(nextRoom);
      setStartedGame(null);
    });
  }

  async function joinRoom(input: JoinRoomInput): Promise<void> {
    await runAction("joinRoom", async () => {
      const nextRoom = await requireClient(client).joinRoom({
        displayName: normalizeDisplayName(input.displayName),
        roomCode: normalizeRoomCode(input.roomCode)
      });

      setPublicRooms([]);
      setRoom(nextRoom);
      setStartedGame(null);
    });
  }

  async function takeSeat(input: TakeSeatInput): Promise<void> {
    await runAction("takeSeat", async () => {
      const nextRoom = await requireClient(client).takeSeat(input);

      setRoom(nextRoom);
      setStartedGame(null);
      await maybeStartFromRoom(nextRoom);
    });
  }

  async function startGame(input: StartGameInput): Promise<void> {
    await runAction("startGame", async () => {
      const result = await requireClient(client).startGame(input);

      setRoom(result.room);
      setStartedGame(result);
    });
  }

  async function refreshRoom(): Promise<void> {
    await runAction("refreshRoom", async () => {
      await refreshCurrentRoom({
        reportErrors: true
      });
    });
  }

  async function refreshPublicRooms(): Promise<void> {
    await runAction("refreshPublicRooms", async () => {
      await refreshPublicRoomsList({
        reportErrors: true
      });
    });
  }

  async function refreshRoomSilently(): Promise<void> {
    await refreshCurrentRoom({
      reportErrors: false
    });
  }

  async function refreshCurrentRoom({
    reportErrors
  }: {
    readonly reportErrors: boolean;
  }): Promise<void> {
    if (roomRefreshInFlight.current) {
      return;
    }

    const currentRoom = room;

    if (!client || !currentRoom || startedGame) {
      return;
    }

    roomRefreshInFlight.current = true;

    try {
      const nextRoom = await client.getRoom({
        roomId: currentRoom.roomId
      });

      setRoom(nextRoom);
      await maybeStartFromRoom(nextRoom);
    } catch (caught) {
      if (reportErrors) {
        throw caught;
      }
    } finally {
      roomRefreshInFlight.current = false;
    }
  }

  async function maybeStartFromRoom(nextRoom: MultiplayerRoomView): Promise<void> {
    if (startedGame || nextRoom.status !== "inGame" || !nextRoom.gameId) {
      return;
    }

    const snapshot = await requireGameClient(gameClient).getGameSnapshot(
      nextRoom.gameId
    );

    setStartedGame({
      room: nextRoom,
      snapshot
    });
  }

  async function refreshPublicRoomsSilently(): Promise<void> {
    await refreshPublicRoomsList({
      reportErrors: false
    });
  }

  async function refreshPublicRoomsList({
    reportErrors
  }: {
    readonly reportErrors: boolean;
  }): Promise<void> {
    if (publicRoomsRefreshInFlight.current) {
      return;
    }

    if (!client || room || startedGame) {
      return;
    }

    publicRoomsRefreshInFlight.current = true;

    try {
      const nextRooms = await client.listPublicRooms();

      setPublicRooms(nextRooms);
    } catch (caught) {
      if (reportErrors) {
        throw caught;
      }
    } finally {
      publicRoomsRefreshInFlight.current = false;
    }
  }

  async function runAction(
    action: MultiplayerLobbyAction,
    task: () => Promise<void>
  ): Promise<void> {
    setBusyAction(action);
    setError(null);

    try {
      await task();
    } catch (caught) {
      setError(toLobbyErrorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  function completeSignIn(
    config: MobileMultiplayerConfig,
    nextSession: CognitoAuthSession
  ): void {
    const nextClient = (dependencies.createRoomClient ?? createDefaultRoomClient)(
      config,
      nextSession
    );
    const nextGameClient = (
      dependencies.createGameClient ?? createDefaultGameClient
    )(config, nextSession);

    setClient(nextClient);
    setGameClient(nextGameClient);
    setNewPasswordChallenge(null);
    setPublicRooms([]);
    setRoom(null);
    setSession(nextSession);
    setStartedGame(null);
  }

  return {
    busyAction,
    clearError: () => setError(null),
    completeNewPassword,
    configError: configState.error,
    configured,
    createRoom,
    error,
    gameClient,
    joinRoom,
    newPasswordChallenge,
    publicRooms,
    refreshPublicRooms,
    refreshRoom,
    room,
    session,
    signIn,
    startGame,
    startedGame,
    takeSeat
  };
}

function createDefaultAuthClient(
  config: MobileMultiplayerConfig
): MultiplayerLobbyAuthClient {
  return new CognitoPasswordAuthClient(config);
}

function createDefaultRoomClient(
  config: MobileMultiplayerConfig,
  session: CognitoAuthSession
): MultiplayerLobbyClient {
  return new MultiplayerRoomClient(
    new AppSyncGraphqlClient(config, new StaticAuthSessionProvider(session))
  );
}

function createDefaultGameClient(
  config: MobileMultiplayerConfig,
  session: CognitoAuthSession
): MultiplayerLobbyGameClient {
  return new MultiplayerGameClient(
    new AppSyncGraphqlClient(config, new StaticAuthSessionProvider(session))
  );
}

function resolveConfigState(
  dependencies: MultiplayerLobbyDependencies
): {
  readonly config: MobileMultiplayerConfig | null;
  readonly error: string | null;
} {
  try {
    return {
      config: (dependencies.readConfig ?? readMobileMultiplayerConfig)(),
      error: null
    };
  } catch (error) {
    return {
      config: null,
      error: toLobbyErrorMessage(error)
    };
  }
}

function requireResolvedConfig(configState: {
  readonly config: MobileMultiplayerConfig | null;
  readonly error: string | null;
}): MobileMultiplayerConfig {
  if (configState.error) {
    throw new MobileMultiplayerConfigError(configState.error);
  }

  if (!configState.config) {
    throw new MobileMultiplayerConfigError("Multiplayer is not configured.");
  }

  return configState.config;
}

function requireClient(
  client: MultiplayerLobbyClient | null
): MultiplayerLobbyClient {
  if (!client) {
    throw new Error("Sign in before joining a multiplayer room.");
  }

  return client;
}

function requireGameClient(
  client: MultiplayerLobbyGameClient | null
): MultiplayerLobbyGameClient {
  if (!client) {
    throw new Error("Sign in before loading a multiplayer game.");
  }

  return client;
}

function requireNewPasswordChallenge(
  challenge: CognitoNewPasswordChallenge | null
): CognitoNewPasswordChallenge {
  if (!challenge) {
    throw new Error("Sign in before setting a new password.");
  }

  return challenge;
}

function toLobbyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Multiplayer request failed.";
}
