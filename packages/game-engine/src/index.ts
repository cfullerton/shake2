export const DEFAULT_TARGET_MARKS = 7;

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

const PLAYER_TEAM: Record<PlayerSeat, TeamId> = {
  north: "northSouth",
  east: "eastWest",
  south: "northSouth",
  west: "eastWest"
};

export function createScorekeeperGame(
  input: CreateScorekeeperGameInput
): ScorekeeperGame {
  const targetMarks = input.targetMarks ?? DEFAULT_TARGET_MARKS;
  assertPositiveInteger(targetMarks, "targetMarks");

  const dealer = input.dealer ?? "north";
  assertPlayerSeat(dealer);

  const teams: Record<TeamId, Team> = {
    northSouth: {
      id: "northSouth",
      marks: 0,
      name: cleanLabel(input.teamNames?.northSouth, TEAM_LABELS.northSouth),
      playerSeats: TEAM_SEATS.northSouth
    },
    eastWest: {
      id: "eastWest",
      marks: 0,
      name: cleanLabel(input.teamNames?.eastWest, TEAM_LABELS.eastWest),
      playerSeats: TEAM_SEATS.eastWest
    }
  };

  const players = PLAYER_SEATS.reduce<Record<PlayerSeat, Player>>(
    (nextPlayers, seat) => {
      nextPlayers[seat] = {
        name: cleanLabel(input.playerNames?.[seat], SEAT_LABELS[seat]),
        seat,
        teamId: PLAYER_TEAM[seat]
      };
      return nextPlayers;
    },
    {} as Record<PlayerSeat, Player>
  );

  return {
    id: cleanRequired(input.id, "id"),
    createdAt: cleanRequired(input.createdAt, "createdAt"),
    dealer,
    handNumber: 1,
    history: [],
    name: cleanLabel(input.name, "Texas 42"),
    players,
    status: "active",
    targetMarks,
    teams,
    updatedAt: input.createdAt
  };
}

export function awardMarks(
  game: ScorekeeperGame,
  input: AwardMarksInput
): ScorekeeperGame {
  if (game.status === "complete") {
    throw new Error("Cannot award marks to a complete game. Undo first.");
  }

  assertTeamId(input.teamId);
  assertPositiveInteger(input.marks, "marks");

  const targetTeam = game.teams[input.teamId];
  const updatedTeam: Team = {
    ...targetTeam,
    marks: targetTeam.marks + input.marks
  };

  const entry = createScoreEntry(game, input);
  const teams: Record<TeamId, Team> = {
    ...game.teams,
    [input.teamId]: updatedTeam
  };
  const nextGame: ScorekeeperGame = {
    ...game,
    dealer: getNextDealer(game.dealer),
    handNumber: game.handNumber + 1,
    history: [...game.history, entry],
    teams,
    updatedAt: input.createdAt
  };

  return {
    ...nextGame,
    status: getWinningTeamId(nextGame) === null ? "active" : "complete"
  };
}

export function undoLastScore(
  game: ScorekeeperGame,
  input: UndoInput
): ScorekeeperGame {
  const lastEntry = game.history.at(-1);

  if (!lastEntry) {
    return {
      ...game,
      updatedAt: input.updatedAt
    };
  }

  const targetTeam = game.teams[lastEntry.teamId];
  const teams: Record<TeamId, Team> = {
    ...game.teams,
    [lastEntry.teamId]: {
      ...targetTeam,
      marks: Math.max(0, targetTeam.marks - lastEntry.marks)
    }
  };

  const nextGame: ScorekeeperGame = {
    ...game,
    dealer: lastEntry.dealer ?? getPreviousDealer(game.dealer),
    handNumber: Math.max(1, game.handNumber - 1),
    history: game.history.slice(0, -1),
    status: "active",
    teams,
    updatedAt: input.updatedAt
  };

  return {
    ...nextGame,
    status: getWinningTeamId(nextGame) === null ? "active" : "complete"
  };
}

export function getScoreSummary(game: ScorekeeperGame): ScoreSummary {
  const northSouthMarks = game.teams.northSouth.marks;
  const eastWestMarks = game.teams.eastWest.marks;

  return {
    isTied: northSouthMarks === eastWestMarks,
    leaderTeamId:
      northSouthMarks === eastWestMarks
        ? null
        : northSouthMarks > eastWestMarks
          ? "northSouth"
          : "eastWest",
    winningTeamId: getWinningTeamId(game)
  };
}

export function getWinningTeamId(game: ScorekeeperGame): TeamId | null {
  const winners = TEAM_IDS.filter(
    (teamId) => game.teams[teamId].marks >= game.targetMarks
  );

  if (winners.length === 0) {
    return null;
  }

  return winners.sort(
    (left, right) => game.teams[right].marks - game.teams[left].marks
  )[0] ?? null;
}

export function getNextDealer(dealer: PlayerSeat): PlayerSeat {
  assertPlayerSeat(dealer);
  const currentIndex = PLAYER_SEATS.indexOf(dealer);
  return PLAYER_SEATS[(currentIndex + 1) % PLAYER_SEATS.length] ?? "north";
}

export function getPreviousDealer(dealer: PlayerSeat): PlayerSeat {
  assertPlayerSeat(dealer);
  const currentIndex = PLAYER_SEATS.indexOf(dealer);
  return (
    PLAYER_SEATS[(currentIndex - 1 + PLAYER_SEATS.length) % PLAYER_SEATS.length] ??
    "north"
  );
}

export function isTeamId(value: unknown): value is TeamId {
  return TEAM_IDS.includes(value as TeamId);
}

export function isPlayerSeat(value: unknown): value is PlayerSeat {
  return PLAYER_SEATS.includes(value as PlayerSeat);
}

function createScoreEntry(
  game: ScorekeeperGame,
  input: AwardMarksInput
): ScoreEntry {
  const note = input.note?.trim();
  const entry = {
    createdAt: cleanRequired(input.createdAt, "createdAt"),
    dealer: game.dealer,
    handNumber: game.handNumber,
    id: cleanRequired(input.id, "id"),
    marks: input.marks,
    teamId: input.teamId
  };

  return note ? { ...entry, note } : entry;
}

function cleanLabel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function cleanRequired(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function assertTeamId(value: TeamId): void {
  if (!isTeamId(value)) {
    throw new Error(`Unknown team id: ${String(value)}`);
  }
}

function assertPlayerSeat(value: PlayerSeat): void {
  if (!isPlayerSeat(value)) {
    throw new Error(`Unknown player seat: ${String(value)}`);
  }
}
