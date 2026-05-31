export type AppSyncSeatIndex =
  | "SEAT_0"
  | "SEAT_1"
  | "SEAT_2"
  | "SEAT_3";

export interface MultiplayerRoomParticipant {
  readonly connectionStatus: string;
  readonly displayName: string;
  readonly isViewer: boolean;
  readonly joinedAt: string;
}

export interface MultiplayerRoomSeat {
  readonly displayName?: string | null;
  readonly isViewer: boolean;
  readonly occupied: boolean;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface MultiplayerRoomView {
  readonly createdAt: string;
  readonly gameId?: string | null;
  readonly isHost: boolean;
  readonly participantCount: number;
  readonly participants: readonly MultiplayerRoomParticipant[];
  readonly roomCode: string;
  readonly roomId: string;
  readonly seats: readonly MultiplayerRoomSeat[];
  readonly status: string;
  readonly updatedAt: string;
  readonly viewerSeat?: AppSyncSeatIndex | null;
}

export interface MultiplayerSeatHandCounts {
  readonly seat0: number;
  readonly seat1: number;
  readonly seat2: number;
  readonly seat3: number;
}

export interface MultiplayerDomino {
  readonly high: number;
  readonly key: string;
  readonly low: number;
}

export interface MultiplayerPublicGameSnapshot {
  readonly gameId: string;
  readonly generatedAt: string;
  readonly handCounts?: MultiplayerSeatHandCounts | null;
  readonly lastEventSequence: number;
  readonly phase: string;
  readonly redactedState: Readonly<Record<string, unknown>>;
  readonly schemaVersion: number;
  readonly snapshotVersion: number;
}

export type MultiplayerPublicGameSnapshotPayload =
  Omit<MultiplayerPublicGameSnapshot, "redactedState"> & {
    readonly redactedState: unknown;
  };

export interface MultiplayerStartGameResult {
  readonly room: MultiplayerRoomView;
  readonly snapshot: MultiplayerPublicGameSnapshot;
}

export interface MultiplayerPrivateHand {
  readonly dominoes: readonly MultiplayerDomino[];
  readonly gameId: string;
  readonly handNumber: number;
  readonly seatIndex: AppSyncSeatIndex;
  readonly updatedAt: string;
}

export interface MultiplayerBackendError {
  readonly code: string;
  readonly message: string;
}

export interface MultiplayerSafeGameEventSummary {
  readonly actionId: string;
  readonly actorId: string;
  readonly actorSeat?: AppSyncSeatIndex | null;
  readonly eventId: string;
  readonly eventType: string;
  readonly sequence: number;
}

export interface MultiplayerSubmitGameActionResult {
  readonly accepted: boolean;
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly error?: MultiplayerBackendError | null;
  readonly events: readonly MultiplayerSafeGameEventSummary[];
  readonly gameId?: string | null;
  readonly snapshot?: MultiplayerPublicGameSnapshot | null;
}

export type MultiplayerSubmitGameActionResultPayload =
  Omit<MultiplayerSubmitGameActionResult, "snapshot"> & {
    readonly snapshot?: MultiplayerPublicGameSnapshotPayload | null;
  };
