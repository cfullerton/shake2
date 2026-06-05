export type AppSyncSeatIndex =
  | "SEAT_0"
  | "SEAT_1"
  | "SEAT_2"
  | "SEAT_3";

export interface MultiplayerRoomParticipant {
  readonly connectionStatus: string;
  readonly displayName: string;
  readonly isBot: boolean;
  readonly isViewer: boolean;
  readonly joinedAt: string;
}

export interface MultiplayerRoomSeat {
  readonly displayName?: string | null;
  readonly isBot: boolean;
  readonly isViewer: boolean;
  readonly occupied: boolean;
  readonly seatIndex: AppSyncSeatIndex;
}

export type MultiplayerRoomVisibility =
  | "private"
  | "public";

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
  readonly visibility: MultiplayerRoomVisibility;
}

export interface MultiplayerSeatHandCounts {
  readonly seat0: number;
  readonly seat1: number;
  readonly seat2: number;
  readonly seat3: number;
}

export interface MultiplayerTeamTotals {
  readonly teamA: number;
  readonly teamB: number;
}

export interface MultiplayerCompletedHandSummary {
  readonly awardedTeamId?: string | null;
  readonly bidAmount: number;
  readonly bidLabel: string;
  readonly bidMarks?: number | null;
  readonly biddingTeamId: string;
  readonly biddingTeamPoints: number;
  readonly completedAt: string;
  readonly declarer: AppSyncSeatIndex;
  readonly handNumber: number;
  readonly markAwards: MultiplayerTeamTotals;
  readonly outcome: string;
  readonly teamPoints: MultiplayerTeamTotals;
  readonly teamTrickCounts: MultiplayerTeamTotals;
  readonly totalPoints: number;
}

export interface MultiplayerDomino {
  readonly high: number;
  readonly key: string;
  readonly low: number;
}

export const multiplayerTrumpSuits = [
  "blanks",
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes"
] as const;

export type MultiplayerTrumpSuit = (typeof multiplayerTrumpSuits)[number];

export type MultiplayerTrumpSelection =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "pip";
      readonly suit: MultiplayerTrumpSuit;
    };

export interface MultiplayerPublicGameSnapshot {
  readonly gameId: string;
  readonly generatedAt: string;
  readonly handCounts?: MultiplayerSeatHandCounts | null;
  readonly lastCompletedHand?: MultiplayerCompletedHandSummary | null;
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

export interface MultiplayerPendingActionRejection {
  readonly actionId: string;
  readonly errorCode: string;
}

export interface MultiplayerReconnectView {
  readonly acceptedPendingActionIds: readonly string[];
  readonly privateHand?: MultiplayerPrivateHand | null;
  readonly rejectedPendingActions: readonly MultiplayerPendingActionRejection[];
  readonly requiresSnapshotRefresh: boolean;
  readonly serverLastEventSequence: number;
  readonly serverSnapshotVersion: number;
  readonly snapshot: MultiplayerPublicGameSnapshot;
  readonly unknownPendingActionIds: readonly string[];
}

export type MultiplayerReconnectViewPayload =
  Omit<MultiplayerReconnectView, "snapshot"> & {
    readonly snapshot: MultiplayerPublicGameSnapshotPayload;
  };

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
