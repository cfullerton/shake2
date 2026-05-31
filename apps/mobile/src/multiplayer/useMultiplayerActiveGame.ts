import { useEffect, useMemo, useRef, useState } from "react";

import {
  createMultiplayerActiveGameView,
  type MultiplayerActiveDominoPlay,
  type MultiplayerActiveGameView
} from "./activeGame";
import type {
  AppSyncSeatIndex,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView,
  MultiplayerTrumpSuit
} from "./types";
import type {
  MultiplayerBid,
  MultiplayerGameClient
} from "./game";
import type {
  MultiplayerGameUpdateObserver,
  MultiplayerGameUpdateStatus,
  MultiplayerGameUpdateSubscription
} from "./realtime";

export type MultiplayerActiveGameAction =
  | "loadPrivateHand"
  | "refresh"
  | "submitBid"
  | "submitDomino"
  | "submitTrump";

export interface UseMultiplayerActiveGameInput {
  readonly actorId: string | null;
  readonly client: MultiplayerGameClient;
  readonly initialRoom: MultiplayerRoomView;
  readonly initialSnapshot: MultiplayerPublicGameSnapshot;
}

export interface MultiplayerActiveGameController {
  readonly busyAction: MultiplayerActiveGameAction | null;
  readonly error: string | null;
  readonly liveError: string | null;
  readonly liveStatus: MultiplayerActiveGameLiveStatus;
  readonly privateHand: MultiplayerPrivateHand | null;
  readonly room: MultiplayerRoomView;
  readonly snapshot: MultiplayerPublicGameSnapshot;
  readonly view: MultiplayerActiveGameView;
  clearError(): void;
  refresh(): Promise<void>;
  submitBid(bid: MultiplayerBid): Promise<void>;
  submitDomino(play: MultiplayerActiveDominoPlay): Promise<void>;
  submitTrump(trumpSuit: MultiplayerTrumpSuit): Promise<void>;
}

export type MultiplayerActiveGameLiveStatus =
  | MultiplayerGameUpdateStatus
  | "error"
  | "idle";

export function useMultiplayerActiveGame({
  actorId,
  client,
  initialRoom,
  initialSnapshot
}: UseMultiplayerActiveGameInput): MultiplayerActiveGameController {
  const [busyAction, setBusyAction] =
    useState<MultiplayerActiveGameAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] =
    useState<MultiplayerActiveGameLiveStatus>("idle");
  const [privateHand, setPrivateHand] = useState<MultiplayerPrivateHand | null>(null);
  const [room] = useState(initialRoom);
  const [snapshot, setSnapshot] =
    useState<MultiplayerPublicGameSnapshot>(initialSnapshot);
  const roomViewerSeatRef = useRef<AppSyncSeatIndex | null>(
    initialRoom.viewerSeat ?? null
  );
  const snapshotRef = useRef<MultiplayerPublicGameSnapshot>(initialSnapshot);

  useEffect(() => {
    roomViewerSeatRef.current = room.viewerSeat ?? null;
  }, [room.viewerSeat]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

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

  useEffect(() => {
    const subscriber = readGameUpdateSubscriber(client);

    if (!subscriber) {
      setLiveStatus("idle");
      setLiveError(null);
      return;
    }

    let cancelled = false;
    const observer: MultiplayerGameUpdateObserver = {
      onError(message) {
        if (cancelled) {
          return;
        }

        setLiveError(message);
        setLiveStatus("error");
      },
      onSnapshot(nextSnapshot) {
        if (cancelled) {
          return;
        }

        void applyLiveSnapshot(nextSnapshot);
      },
      onStatus(status) {
        if (cancelled) {
          return;
        }

        setLiveStatus(status);
        if (status !== "closed") {
          setLiveError(null);
        }
      }
    };
    const subscription = subscriber.call(client, {
      gameId: snapshot.gameId
    }, observer);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [client, snapshot.gameId]);

  async function refresh(): Promise<void> {
    await runAction("refresh", async () => {
      const nextSnapshot = await client.getGameSnapshot(snapshot.gameId);

      await applySnapshotUpdate(nextSnapshot, {
        allowEqualSequence: true
      });
    });
  }

  async function submitBid(bid: MultiplayerBid): Promise<void> {
    await runAction("submitBid", async () => {
      const identity = requireActionIdentity();

      const result = await client.submitBid({
        actorId: identity.actorId,
        actorSeat: identity.actorSeat,
        bid,
        gameId: snapshot.gameId,
        knownLastEventSequence: snapshot.lastEventSequence,
        knownSnapshotVersion: snapshot.snapshotVersion
      });

      if (!result.accepted || !result.snapshot) {
        throw new Error(result.error?.message ?? "The server rejected that action.");
      }

      await applySnapshotUpdate(result.snapshot, {
        allowEqualSequence: true,
        viewerSeat: identity.actorSeat
      });
    });
  }

  async function submitTrump(trumpSuit: MultiplayerTrumpSuit): Promise<void> {
    await runAction("submitTrump", async () => {
      const identity = requireActionIdentity();

      const result = await client.submitTrump({
        actorId: identity.actorId,
        actorSeat: identity.actorSeat,
        gameId: snapshot.gameId,
        knownLastEventSequence: snapshot.lastEventSequence,
        knownSnapshotVersion: snapshot.snapshotVersion,
        trumpSuit
      });

      if (!result.accepted || !result.snapshot) {
        throw new Error(result.error?.message ?? "The server rejected that action.");
      }

      await applySnapshotUpdate(result.snapshot, {
        allowEqualSequence: true,
        viewerSeat: identity.actorSeat
      });
    });
  }

  async function submitDomino(play: MultiplayerActiveDominoPlay): Promise<void> {
    await runAction("submitDomino", async () => {
      const identity = requireActionIdentity();

      const result = await client.submitDomino({
        actorId: identity.actorId,
        actorSeat: identity.actorSeat,
        domino: play.domino,
        gameId: snapshot.gameId,
        knownLastEventSequence: snapshot.lastEventSequence,
        knownSnapshotVersion: snapshot.snapshotVersion,
        ...(play.ledSuit ? { ledSuit: play.ledSuit } : {})
      });

      if (!result.accepted || !result.snapshot) {
        throw new Error(result.error?.message ?? "The server rejected that action.");
      }

      await applySnapshotUpdate(result.snapshot, {
        allowEqualSequence: true,
        viewerSeat: identity.actorSeat
      });
    });
  }

  async function applyLiveSnapshot(
    nextSnapshot: MultiplayerPublicGameSnapshot
  ): Promise<void> {
    try {
      await applySnapshotUpdate(nextSnapshot, {
        allowEqualSequence: false
      });
    } catch (caught) {
      setLiveError(toGameErrorMessage(caught));
      setLiveStatus("error");
    }
  }

  async function applySnapshotUpdate(
    nextSnapshot: MultiplayerPublicGameSnapshot,
    options: {
      readonly allowEqualSequence: boolean;
      readonly viewerSeat?: AppSyncSeatIndex;
    }
  ): Promise<void> {
    const currentSnapshot = snapshotRef.current;

    if (nextSnapshot.gameId !== currentSnapshot.gameId) {
      return;
    }

    if (
      !options.allowEqualSequence &&
      nextSnapshot.lastEventSequence <= currentSnapshot.lastEventSequence
    ) {
      return;
    }

    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    await loadPrivateHandFor(
      nextSnapshot.gameId,
      options.viewerSeat ?? roomViewerSeatRef.current
    );
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

  function requireActionIdentity(): {
    readonly actorId: string;
    readonly actorSeat: AppSyncSeatIndex;
  } {
    if (!actorId) {
      throw new Error("A Cognito subject is required before submitting actions.");
    }

    if (!room.viewerSeat) {
      throw new Error("Take a seat before submitting game actions.");
    }

    return {
      actorId,
      actorSeat: room.viewerSeat
    };
  }

  return {
    busyAction,
    clearError: () => setError(null),
    error,
    liveError,
    liveStatus,
    privateHand,
    refresh,
    room,
    snapshot,
    submitBid,
    submitDomino,
    submitTrump,
    view
  };
}

function toGameErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Multiplayer game request failed.";
}

function readGameUpdateSubscriber(
  client: MultiplayerGameClient
): ((input: {
  readonly gameId: string;
}, observer: MultiplayerGameUpdateObserver) => MultiplayerGameUpdateSubscription) | null {
  const candidate = client as unknown as {
    readonly subscribeToGameUpdates?: (
      input: {
        readonly gameId: string;
      },
      observer: MultiplayerGameUpdateObserver
    ) => MultiplayerGameUpdateSubscription;
  };

  return typeof candidate.subscribeToGameUpdates === "function"
    ? candidate.subscribeToGameUpdates
    : null;
}
