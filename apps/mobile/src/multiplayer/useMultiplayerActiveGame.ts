import { useEffect, useMemo, useState } from "react";

import {
  createMultiplayerActiveGameView,
  type MultiplayerActiveGameView
} from "./activeGame";
import type {
  AppSyncSeatIndex,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView
} from "./types";
import type {
  MultiplayerBid,
  MultiplayerGameClient
} from "./game";

export type MultiplayerActiveGameAction =
  | "loadPrivateHand"
  | "refresh"
  | "submitBid";

export interface UseMultiplayerActiveGameInput {
  readonly actorId: string | null;
  readonly client: MultiplayerGameClient;
  readonly initialRoom: MultiplayerRoomView;
  readonly initialSnapshot: MultiplayerPublicGameSnapshot;
}

export interface MultiplayerActiveGameController {
  readonly busyAction: MultiplayerActiveGameAction | null;
  readonly error: string | null;
  readonly privateHand: MultiplayerPrivateHand | null;
  readonly room: MultiplayerRoomView;
  readonly snapshot: MultiplayerPublicGameSnapshot;
  readonly view: MultiplayerActiveGameView;
  clearError(): void;
  refresh(): Promise<void>;
  submitBid(bid: MultiplayerBid): Promise<void>;
}

export function useMultiplayerActiveGame({
  actorId,
  client,
  initialRoom,
  initialSnapshot
}: UseMultiplayerActiveGameInput): MultiplayerActiveGameController {
  const [busyAction, setBusyAction] =
    useState<MultiplayerActiveGameAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [privateHand, setPrivateHand] = useState<MultiplayerPrivateHand | null>(null);
  const [room] = useState(initialRoom);
  const [snapshot, setSnapshot] =
    useState<MultiplayerPublicGameSnapshot>(initialSnapshot);

  const view = useMemo(
    () =>
      createMultiplayerActiveGameView({
        privateHand,
        room,
        snapshot
      }),
    [privateHand, room, snapshot]
  );

  useEffect(() => {
    void loadPrivateHand();
  }, [snapshot.gameId, room.viewerSeat]);

  async function refresh(): Promise<void> {
    await runAction("refresh", async () => {
      const nextSnapshot = await client.getGameSnapshot(snapshot.gameId);

      setSnapshot(nextSnapshot);
      await loadPrivateHandFor(nextSnapshot.gameId, room.viewerSeat ?? null);
    });
  }

  async function submitBid(bid: MultiplayerBid): Promise<void> {
    await runAction("submitBid", async () => {
      if (!actorId) {
        throw new Error("A Cognito subject is required before submitting actions.");
      }

      if (!room.viewerSeat) {
        throw new Error("Take a seat before submitting game actions.");
      }

      const result = await client.submitBid({
        actorId,
        actorSeat: room.viewerSeat,
        bid,
        gameId: snapshot.gameId,
        knownLastEventSequence: snapshot.lastEventSequence,
        knownSnapshotVersion: snapshot.snapshotVersion
      });

      if (!result.accepted || !result.snapshot) {
        throw new Error(result.error?.message ?? "The server rejected that action.");
      }

      setSnapshot(result.snapshot);
      await loadPrivateHandFor(result.snapshot.gameId, room.viewerSeat);
    });
  }

  async function loadPrivateHand(): Promise<void> {
    await runAction("loadPrivateHand", async () => {
      await loadPrivateHandFor(snapshot.gameId, room.viewerSeat ?? null);
    });
  }

  async function loadPrivateHandFor(
    gameId: string,
    viewerSeat: AppSyncSeatIndex | null
  ): Promise<void> {
    if (!viewerSeat) {
      setPrivateHand(null);
      return;
    }

    setPrivateHand(await client.getMyPrivateHand({
      gameId,
      seatIndex: viewerSeat
    }));
  }

  async function runAction(
    action: MultiplayerActiveGameAction,
    task: () => Promise<void>
  ): Promise<void> {
    setBusyAction(action);
    setError(null);

    try {
      await task();
    } catch (caught) {
      setError(toGameErrorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  return {
    busyAction,
    clearError: () => setError(null),
    error,
    privateHand,
    refresh,
    room,
    snapshot,
    submitBid,
    view
  };
}

function toGameErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Multiplayer game request failed.";
}
