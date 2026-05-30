export const DEFAULT_TARGET_MARKS = 7;
export const MAX_TARGET_MARKS = 21;
export const MAX_GAME_NAME_LENGTH = 80;
export const MAX_TEAM_NAME_LENGTH = 40;
export const MAX_PLAYER_NAME_LENGTH = 40;
export const MAX_SCORE_NOTE_LENGTH = 160;
export const MAX_ID_LENGTH = 128;
export const MAX_TIMESTAMP_LENGTH = 64;

export const PLAYER_SEATS = ["north", "east", "south", "west"] as const;
export type PlayerSeat = (typeof PLAYER_SEATS)[number];

export const TEAM_IDS = ["northSouth", "eastWest"] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export type GameStatus = "active" | "complete";

export const TEAM_SEATS: Record<TeamId, readonly [PlayerSeat, PlayerSeat]> = {
  northSouth: ["north", "south"],
  eastWest: ["east", "west"]
};

export const SEAT_LABELS: Record<PlayerSeat, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West"
};

export const TEAM_LABELS: Record<TeamId, string> = {
  northSouth: "North / South",
  eastWest: "East / West"
};

export const PLAYER_TEAM: Record<PlayerSeat, TeamId> = {
  north: "northSouth",
  east: "eastWest",
  south: "northSouth",
  west: "eastWest"
};

export interface Player {
  readonly seat: PlayerSeat;
  readonly name: string;
  readonly teamId: TeamId;
}

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly marks: number;
  readonly playerSeats: readonly [PlayerSeat, PlayerSeat];
}

export interface ScoreEntry {
  readonly id: string;
  readonly handNumber: number;
  readonly dealer?: PlayerSeat;
  readonly teamId: TeamId;
  readonly marks: number;
  readonly createdAt: string;
  readonly note?: string;
}

export interface ScorekeeperGame {
  readonly id: string;
  readonly name: string;
  readonly targetMarks: number;
  readonly dealer: PlayerSeat;
  readonly handNumber: number;
  readonly status: GameStatus;
  readonly teams: Record<TeamId, Team>;
  readonly players: Record<PlayerSeat, Player>;
  readonly history: readonly ScoreEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateScorekeeperGameInput {
  readonly id: string;
  readonly createdAt: string;
  readonly name?: string;
  readonly targetMarks?: number;
  readonly dealer?: PlayerSeat;
  readonly teamNames?: Partial<Record<TeamId, string>>;
  readonly playerNames?: Partial<Record<PlayerSeat, string>>;
}

export interface AwardMarksInput {
  readonly id: string;
  readonly teamId: TeamId;
  readonly marks: number;
  readonly createdAt: string;
  readonly note?: string;
}

export interface UndoInput {
  readonly updatedAt: string;
}

export interface ScoreSummary {
  readonly leaderTeamId: TeamId | null;
  readonly winningTeamId: TeamId | null;
  readonly isTied: boolean;
}
