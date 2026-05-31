import { useState } from "react";

import {
  CognitoPasswordAuthClient,
  type CognitoAuthSession,
  type CognitoPasswordSignInInput,
  StaticAuthSessionProvider
} from "./auth";
import {
  type MobileMultiplayerConfig,
  MobileMultiplayerConfigError,
  readMobileMultiplayerConfig
} from "./config";
import { AppSyncGraphqlClient } from "./graphql";
import {
  type CreateRoomInput,
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
  | "createRoom"
  | "joinRoom"
  | "signIn"
  | "startGame"
  | "takeSeat";

export interface MultiplayerLobbyClient {
  createRoom(input: CreateRoomInput): Promise<MultiplayerRoomView>;
  joinRoom(input: JoinRoomInput): Promise<MultiplayerRoomView>;
  startGame(input: StartGameInput): Promise<MultiplayerStartGameResult>;
  takeSeat(input: TakeSeatInput): Promise<MultiplayerRoomView>;
}

export interface MultiplayerLobbyAuthClient {
  signIn(input: CognitoPasswordSignInInput): Promise<CognitoAuthSession>;
}

export interface MultiplayerLobbyDependencies {
  readonly createAuthClient?: (
    config: MobileMultiplayerConfig
  ) => MultiplayerLobbyAuthClient;
  readonly createRoomClient?: (
    config: MobileMultiplayerConfig,
    session: CognitoAuthSession
  ) => MultiplayerLobbyClient;
  readonly readConfig?: () => MobileMultiplayerConfig | null;
}

export interface MultiplayerLobbyState {
  readonly busyAction: MultiplayerLobbyAction | null;
  readonly configError: string | null;
  readonly configured: boolean;
  readonly error: string | null;
  readonly room: MultiplayerRoomView | null;
  readonly session: CognitoAuthSession | null;
  readonly startedGame: MultiplayerStartGameResult | null;
}

export interface MultiplayerLobbyController extends MultiplayerLobbyState {
  clearError(): void;
  createRoom(input: CreateRoomInput): Promise<void>;
  joinRoom(input: JoinRoomInput): Promise<void>;
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
  return value.trim().toUpperCase();
}

export function normalizeDisplayName(value: string): string {
  return value.trim() || "Player";
}

export function canStartMultiplayerRoom(room: MultiplayerRoomView | null): boolean {
  return Boolean(room?.isHost && room.status === "ready");
}

export function useMultiplayerLobby(
  dependencies: MultiplayerLobbyDependencies = {}
): MultiplayerLobbyController {
  const [configState] = useState(() => resolveConfigState(dependencies));
  const [busyAction, setBusyAction] = useState<MultiplayerLobbyAction | null>(null);
  const [client, setClient] = useState<MultiplayerLobbyClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<MultiplayerRoomView | null>(null);
  const [session, setSession] = useState<CognitoAuthSession | null>(null);
  const [startedGame, setStartedGame] =
    useState<MultiplayerStartGameResult | null>(null);

  const configured = configState.config !== null && configState.error === null;

  async function signIn(input: CognitoPasswordSignInInput): Promise<void> {
    await runAction("signIn", async () => {
      const config = requireResolvedConfig(configState);
      const authClient = (dependencies.createAuthClient ?? createDefaultAuthClient)(
        config
      );
      const nextSession = await authClient.signIn(input);
      const nextClient = (dependencies.createRoomClient ?? createDefaultRoomClient)(
        config,
        nextSession
      );

      setClient(nextClient);
      setRoom(null);
      setSession(nextSession);
      setStartedGame(null);
    });
  }

  async function createRoom(input: CreateRoomInput): Promise<void> {
    await runAction("createRoom", async () => {
      const nextRoom = await requireClient(client).createRoom({
        displayName: normalizeDisplayName(input.displayName)
      });

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

      setRoom(nextRoom);
      setStartedGame(null);
    });
  }

  async function takeSeat(input: TakeSeatInput): Promise<void> {
    await runAction("takeSeat", async () => {
      const nextRoom = await requireClient(client).takeSeat(input);

      setRoom(nextRoom);
      setStartedGame(null);
    });
  }

  async function startGame(input: StartGameInput): Promise<void> {
    await runAction("startGame", async () => {
      const result = await requireClient(client).startGame(input);

      setRoom(result.room);
      setStartedGame(result);
    });
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

  return {
    busyAction,
    clearError: () => setError(null),
    configError: configState.error,
    configured,
    createRoom,
    error,
    joinRoom,
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

function toLobbyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Multiplayer request failed.";
}
