import { getNextDealer, getPreviousDealer } from "./dealer.js";
import { getWinningTeamId } from "./selectors.js";
import {
  DEFAULT_TARGET_MARKS,
  PLAYER_SEATS,
  PLAYER_TEAM,
  SEAT_LABELS,
  TEAM_LABELS,
  TEAM_SEATS,
  type AwardMarksInput,
  type CreateScorekeeperGameInput,
  type Player,
  type PlayerSeat,
  type ScoreEntry,
  type ScorekeeperGame,
  type Team,
  type TeamId,
  type UndoInput
} from "./types.js";
import {
  assertAwardMarks,
  assertPlayerSeat,
  assertTargetMarks,
  assertTeamId,
  cleanGameName,
  cleanPlayerName,
  cleanRequiredId,
  cleanScoreNote,
  cleanTeamName,
  cleanTimestamp
} from "./validation.js";

export function createScorekeeperGame(
  input: CreateScorekeeperGameInput
): ScorekeeperGame {
  const targetMarks = input.targetMarks ?? DEFAULT_TARGET_MARKS;
  assertTargetMarks(targetMarks);

  const dealer = input.dealer ?? "north";
  assertPlayerSeat(dealer);

  const createdAt = cleanTimestamp(input.createdAt, "createdAt");

  const teams: Record<TeamId, Team> = {
    northSouth: {
      id: "northSouth",
      marks: 0,
      name: cleanTeamName(input.teamNames?.northSouth, TEAM_LABELS.northSouth),
      playerSeats: TEAM_SEATS.northSouth
    },
    eastWest: {
      id: "eastWest",
      marks: 0,
      name: cleanTeamName(input.teamNames?.eastWest, TEAM_LABELS.eastWest),
      playerSeats: TEAM_SEATS.eastWest
    }
  };

  const players = PLAYER_SEATS.reduce<Record<PlayerSeat, Player>>(
    (nextPlayers, seat) => {
      nextPlayers[seat] = {
        name: cleanPlayerName(input.playerNames?.[seat], SEAT_LABELS[seat]),
        seat,
        teamId: PLAYER_TEAM[seat]
      };
      return nextPlayers;
    },
    {} as Record<PlayerSeat, Player>
  );

  return {
    id: cleanRequiredId(input.id, "id"),
    createdAt,
    dealer,
    handNumber: 1,
    history: [],
    name: cleanGameName(input.name),
    players,
    status: "active",
    targetMarks,
    teams,
    updatedAt: createdAt
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
  assertAwardMarks(input.marks, game.targetMarks);

  const createdAt = cleanTimestamp(input.createdAt, "createdAt");
  const targetTeam = game.teams[input.teamId];
  const updatedTeam: Team = {
    ...targetTeam,
    marks: targetTeam.marks + input.marks
  };

  const entry = createScoreEntry(game, input, createdAt);
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
    updatedAt: createdAt
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
  const updatedAt = cleanTimestamp(input.updatedAt, "updatedAt");
  const lastEntry = game.history.at(-1);

  if (!lastEntry) {
    return {
      ...game,
      updatedAt
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
    updatedAt
  };

  return {
    ...nextGame,
    status: getWinningTeamId(nextGame) === null ? "active" : "complete"
  };
}

function createScoreEntry(
  game: ScorekeeperGame,
  input: AwardMarksInput,
  createdAt: string
): ScoreEntry {
  const note = cleanScoreNote(input.note);
  const entry = {
    createdAt,
    dealer: game.dealer,
    handNumber: game.handNumber,
    id: cleanRequiredId(input.id, "id"),
    marks: input.marks,
    teamId: input.teamId
  };

  return note ? { ...entry, note } : entry;
}
