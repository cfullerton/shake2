import {
  MAX_GAME_NAME_LENGTH,
  MAX_ID_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  MAX_SCORE_NOTE_LENGTH,
  MAX_TARGET_MARKS,
  MAX_TEAM_NAME_LENGTH,
  PLAYER_SEATS,
  TEAM_IDS,
  TEAM_SEATS,
  type GameStatus,
  type Player,
  type PlayerSeat,
  type ScoreEntry,
  type ScorekeeperGame,
  type Team,
  type TeamId
} from "./types.js";
import {
  cleanTimestamp,
  isNonNegativeInteger,
  isPlayerSeat,
  isPositiveInteger,
  isStringWithin,
  isTeamId,
  isTimestampString
} from "./validation.js";

export const SCOREKEEPER_STORAGE_SCHEMA_VERSION = 1;

export interface PersistedScorekeeperGames {
  readonly schemaVersion: typeof SCOREKEEPER_STORAGE_SCHEMA_VERSION;
  readonly savedAt: string;
  readonly games: readonly ScorekeeperGame[];
}

export function createPersistedScorekeeperGames(
  games: readonly ScorekeeperGame[],
  savedAt = new Date().toISOString()
): PersistedScorekeeperGames {
  return {
    games,
    savedAt: cleanTimestamp(savedAt, "savedAt"),
    schemaVersion: SCOREKEEPER_STORAGE_SCHEMA_VERSION
  };
}

export function serializePersistedScorekeeperGames(
  games: readonly ScorekeeperGame[],
  savedAt?: string
): string {
  return JSON.stringify(createPersistedScorekeeperGames(games, savedAt));
}

export function parsePersistedScorekeeperGames(
  rawValue: string | null | undefined
): ScorekeeperGame[] {
  if (!rawValue) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(isScorekeeperGame);
  }

  if (!isRecord(parsed)) {
    return [];
  }

  if (
    parsed.schemaVersion !== SCOREKEEPER_STORAGE_SCHEMA_VERSION ||
    !Array.isArray(parsed.games)
  ) {
    return [];
  }

  return parsed.games.filter(isScorekeeperGame);
}

export function isScorekeeperGame(value: unknown): value is ScorekeeperGame {
  if (!isRecord(value)) {
    return false;
  }

  const game = value as Partial<ScorekeeperGame>;

  return (
    isStringWithin(game.id, MAX_ID_LENGTH) &&
    isStringWithin(game.name, MAX_GAME_NAME_LENGTH) &&
    typeof game.targetMarks === "number" &&
    Number.isInteger(game.targetMarks) &&
    game.targetMarks >= 1 &&
    game.targetMarks <= MAX_TARGET_MARKS &&
    isPlayerSeat(game.dealer) &&
    isPositiveInteger(game.handNumber) &&
    isGameStatus(game.status) &&
    isTeamRecord(game.teams) &&
    isPlayerRecord(game.players) &&
    Array.isArray(game.history) &&
    game.history.every((entry) => isScoreEntry(entry, game.targetMarks ?? 0)) &&
    isTimestampString(game.createdAt) &&
    isTimestampString(game.updatedAt)
  );
}

function isTeamRecord(value: unknown): value is Record<TeamId, Team> {
  if (!isRecord(value)) {
    return false;
  }

  return TEAM_IDS.every((teamId) => isTeam(value[teamId], teamId));
}

function isTeam(value: unknown, expectedId: TeamId): value is Team {
  if (!isRecord(value)) {
    return false;
  }

  const team = value as Partial<Team>;

  return (
    team.id === expectedId &&
    isStringWithin(team.name, MAX_TEAM_NAME_LENGTH) &&
    isNonNegativeInteger(team.marks) &&
    isExpectedTeamSeats(team.playerSeats, expectedId)
  );
}

function isExpectedTeamSeats(
  value: unknown,
  teamId: TeamId
): value is readonly [PlayerSeat, PlayerSeat] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }

  const expectedSeats = TEAM_SEATS[teamId];
  return value[0] === expectedSeats[0] && value[1] === expectedSeats[1];
}

function isPlayerRecord(value: unknown): value is Record<PlayerSeat, Player> {
  if (!isRecord(value)) {
    return false;
  }

  return PLAYER_SEATS.every((seat) => isPlayer(value[seat], seat));
}

function isPlayer(value: unknown, expectedSeat: PlayerSeat): value is Player {
  if (!isRecord(value)) {
    return false;
  }

  const player = value as Partial<Player>;

  return (
    player.seat === expectedSeat &&
    isStringWithin(player.name, MAX_PLAYER_NAME_LENGTH) &&
    isTeamId(player.teamId)
  );
}

function isScoreEntry(value: unknown, targetMarks: number): value is ScoreEntry {
  if (!isRecord(value)) {
    return false;
  }

  const entry = value as Partial<ScoreEntry>;

  return (
    isStringWithin(entry.id, MAX_ID_LENGTH) &&
    isPositiveInteger(entry.handNumber) &&
    (entry.dealer === undefined || isPlayerSeat(entry.dealer)) &&
    isTeamId(entry.teamId) &&
    typeof entry.marks === "number" &&
    Number.isInteger(entry.marks) &&
    entry.marks > 0 &&
    entry.marks <= targetMarks &&
    isTimestampString(entry.createdAt) &&
    (entry.note === undefined ||
      (typeof entry.note === "string" && entry.note.length <= MAX_SCORE_NOTE_LENGTH))
  );
}

function isGameStatus(value: unknown): value is GameStatus {
  return value === "active" || value === "complete";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
