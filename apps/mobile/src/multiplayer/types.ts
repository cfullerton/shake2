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

export interface MultiplayerStartGameResult {
  readonly room: MultiplayerRoomView;
  readonly snapshot: MultiplayerPublicGameSnapshot;
}
