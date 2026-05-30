import { TEAM_IDS, type ScoreSummary, type ScorekeeperGame, type TeamId } from "./types.js";

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
