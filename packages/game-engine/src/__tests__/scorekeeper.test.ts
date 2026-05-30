import assert from "node:assert/strict";
import test from "node:test";

import {
  awardMarks,
  createScorekeeperGame,
  getNextDealer,
  getPreviousDealer,
  getScoreSummary,
  getWinningTeamId,
  MAX_GAME_NAME_LENGTH,
  MAX_SCORE_NOTE_LENGTH,
  MAX_TARGET_MARKS,
  MAX_TEAM_NAME_LENGTH,
  undoLastScore
} from "../index.js";

const createdAt = "2026-05-29T12:00:00.000Z";

test("creates a serializable scorekeeper game with partner seats", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1",
    name: "Friday night",
    playerNames: {
      east: "Casey",
      north: "Alex",
      south: "Morgan",
      west: "Riley"
    },
    teamNames: {
      eastWest: "Moon",
      northSouth: "Stars"
    }
  });

  assert.equal(game.name, "Friday night");
  assert.equal(game.targetMarks, 7);
  assert.equal(game.dealer, "north");
  assert.equal(game.handNumber, 1);
  assert.equal(game.teams.northSouth.name, "Stars");
  assert.equal(game.teams.eastWest.name, "Moon");
  assert.deepEqual(game.teams.northSouth.playerSeats, ["north", "south"]);
  assert.deepEqual(game.teams.eastWest.playerSeats, ["east", "west"]);
  assert.equal(game.players.north.teamId, "northSouth");
  assert.equal(game.players.east.name, "Casey");
  assert.equal(JSON.parse(JSON.stringify(game)).id, "game-1");
});

test("awards marks, advances hands, rotates dealers, and identifies a winner", () => {
  const game = createScorekeeperGame({
    createdAt,
    dealer: "west",
    id: "game-1",
    targetMarks: 2
  });

  const firstHand = awardMarks(game, {
    createdAt: "2026-05-29T12:05:00.000Z",
    id: "entry-1",
    marks: 1,
    note: "opening hand",
    teamId: "northSouth"
  });

  assert.equal(firstHand.handNumber, 2);
  assert.equal(firstHand.dealer, "north");
  assert.equal(firstHand.status, "active");
  assert.equal(firstHand.history.length, 1);
  assert.equal(firstHand.history[0]?.dealer, "west");
  assert.equal(firstHand.history[0]?.note, "opening hand");
  assert.equal(firstHand.teams.northSouth.marks, 1);
  assert.deepEqual(getScoreSummary(firstHand), {
    isTied: false,
    leaderTeamId: "northSouth",
    winningTeamId: null
  });

  const secondHand = awardMarks(firstHand, {
    createdAt: "2026-05-29T12:10:00.000Z",
    id: "entry-2",
    marks: 1,
    teamId: "northSouth"
  });

  assert.equal(secondHand.handNumber, 3);
  assert.equal(secondHand.dealer, "east");
  assert.equal(secondHand.history[1]?.dealer, "north");
  assert.equal(secondHand.status, "complete");
  assert.equal(secondHand.teams.northSouth.marks, 2);
  assert.equal(getWinningTeamId(secondHand), "northSouth");
});

test("undo removes the latest score and reopens a completed game", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1",
    targetMarks: 2
  });
  const completeGame = awardMarks(
    awardMarks(game, {
      createdAt: "2026-05-29T12:05:00.000Z",
      id: "entry-1",
      marks: 1,
      teamId: "eastWest"
    }),
    {
      createdAt: "2026-05-29T12:10:00.000Z",
      id: "entry-2",
      marks: 1,
      teamId: "eastWest"
    }
  );

  const reopened = undoLastScore(completeGame, {
    updatedAt: "2026-05-29T12:15:00.000Z"
  });

  assert.equal(reopened.status, "active");
  assert.equal(reopened.handNumber, 2);
  assert.equal(reopened.dealer, "east");
  assert.equal(reopened.history.length, 1);
  assert.equal(reopened.teams.eastWest.marks, 1);
  assert.equal(getWinningTeamId(reopened), null);
});

test("rotates dealer seats in table order", () => {
  assert.equal(getNextDealer("north"), "east");
  assert.equal(getNextDealer("east"), "south");
  assert.equal(getNextDealer("south"), "west");
  assert.equal(getNextDealer("west"), "north");
  assert.equal(getPreviousDealer("north"), "west");
});

test("rejects invalid mark awards", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1"
  });

  assert.throws(
    () =>
      awardMarks(game, {
        createdAt,
        id: "entry-1",
        marks: 0,
        teamId: "northSouth"
      }),
    /marks must be a positive integer/
  );
});

test("rejects mark awards above the target marks", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1",
    targetMarks: 3
  });

  assert.throws(
    () =>
      awardMarks(game, {
        createdAt,
        id: "entry-1",
        marks: 4,
        teamId: "northSouth"
      }),
    /marks cannot exceed target marks/
  );
});

test("rejects invalid target marks", () => {
  assert.throws(
    () =>
      createScorekeeperGame({
        createdAt,
        id: "game-1",
        targetMarks: MAX_TARGET_MARKS + 1
      }),
    /targetMarks must be an integer/
  );
});

test("rejects overlong game and team labels", () => {
  assert.throws(
    () =>
      createScorekeeperGame({
        createdAt,
        id: "game-1",
        name: "x".repeat(MAX_GAME_NAME_LENGTH + 1)
      }),
    /name must be/
  );

  assert.throws(
    () =>
      createScorekeeperGame({
        createdAt,
        id: "game-1",
        teamNames: {
          northSouth: "x".repeat(MAX_TEAM_NAME_LENGTH + 1)
        }
      }),
    /team name must be/
  );
});

test("rejects invalid timestamps and overlong notes", () => {
  const game = createScorekeeperGame({
    createdAt,
    id: "game-1"
  });

  assert.throws(
    () =>
      awardMarks(game, {
        createdAt: "not-a-date",
        id: "entry-1",
        marks: 1,
        teamId: "northSouth"
      }),
    /createdAt must be a valid timestamp/
  );

  assert.throws(
    () =>
      awardMarks(game, {
        createdAt,
        id: "entry-1",
        marks: 1,
        note: "x".repeat(MAX_SCORE_NOTE_LENGTH + 1),
        teamId: "northSouth"
      }),
    /note must be/
  );
});
