import assert from "node:assert/strict";
import test from "node:test";

import {
  DOMINOES_PER_HAND,
  FORTY_TWO_HAND_TOTAL_POINTS,
  FORTY_TWO_INITIAL_EVENT_SEQUENCE,
  FORTY_TWO_INITIAL_SNAPSHOT_VERSION,
  FORTY_TWO_PHASES,
  FORTY_TWO_SNAPSHOT_SCHEMA_VERSION,
  FORTY_TWO_STATE_SCHEMA_VERSION,
  FORTY_TWO_TRICK_POINT_VALUE,
  FORTY_TWO_TRICKS_PER_HAND,
  MAX_NUMERIC_BID,
  MIN_NUMERIC_BID,
  PLAYER_COUNT,
  TRICK_PLAY_COUNT,
  createInitialFortyTwoSnapshot,
  standardRules,
  type EngineContext,
  type RuleConfig
} from "../index.ts";

test("defines standard Texas 42 rules behind RuleConfig", () => {
  assert.equal(standardRules.schemaVersion, 1);
  assert.equal(standardRules.scoringMode, "marks");
  assert.equal(standardRules.targetMarks, 7);
  assert.equal(standardRules.bidding.minimumBid, 30);
  assert.equal(standardRules.bidding.maximumNumericBid, 42);
  assert.equal(standardRules.bidding.allPassBehavior, "dealerForcedBid");
  assert.equal(standardRules.table.playerCount, 4);
  assert.equal(standardRules.table.dominoesPerHand, 7);
  assert.equal(standardRules.table.tricksPerHand, 7);
  assert.equal(standardRules.scoring.countDominoPoints, 35);
  assert.equal(standardRules.scoring.trickPointValue, 1);
  assert.equal(standardRules.scoring.handTotalPoints, 42);
  assert.equal(standardRules.trumpBehavior.doublesHigh, true);
  assert.equal(standardRules.trumpBehavior.trumpDominoBelongsOnlyToTrump, true);
  assert.deepEqual(standardRules.enabledContracts, {
    eightyFour: false,
    followMe: false,
    markBids: false,
    nello: false,
    noTrump: false,
    plunge: false,
    sevens: false,
    splash: false
  });
});

test("keeps exported rule constants sourced from standardRules", () => {
  assert.equal(MIN_NUMERIC_BID, standardRules.bidding.minimumBid);
  assert.equal(MAX_NUMERIC_BID, standardRules.bidding.maximumNumericBid);
  assert.equal(DOMINOES_PER_HAND, standardRules.table.dominoesPerHand);
  assert.equal(PLAYER_COUNT, standardRules.table.playerCount);
  assert.equal(TRICK_PLAY_COUNT, standardRules.table.playerCount);
  assert.equal(FORTY_TWO_TRICKS_PER_HAND, standardRules.table.tricksPerHand);
  assert.equal(FORTY_TWO_TRICK_POINT_VALUE, standardRules.scoring.trickPointValue);
  assert.equal(FORTY_TWO_HAND_TOTAL_POINTS, standardRules.scoring.handTotalPoints);
});

test("lists all full Texas 42 state phases", () => {
  assert.deepEqual(FORTY_TWO_PHASES, [
    "setup",
    "dealt",
    "bidding",
    "trump",
    "trickPlay",
    "handComplete",
    "gameComplete"
  ]);
});

test("creates a serializable initial full-game snapshot", () => {
  const snapshot = createInitialFortyTwoSnapshot(
    {
      dealer: 2,
      playerNames: {
        0: "North",
        1: "East"
      },
      teamNames: {
        teamA: "Blue",
        teamB: "Red"
      }
    },
    createContext()
  );

  assert.equal(snapshot.schemaVersion, FORTY_TWO_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.gameId, "game-1");
  assert.equal(snapshot.snapshotVersion, FORTY_TWO_INITIAL_SNAPSHOT_VERSION);
  assert.equal(snapshot.lastEventSequence, FORTY_TWO_INITIAL_EVENT_SEQUENCE);
  assert.equal(snapshot.generatedAt, "2026-05-30T12:00:00.000Z");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test("initial full-game state captures dealer, teams, target marks, and setup phase", () => {
  const fiveMarkRules: RuleConfig = {
    ...standardRules,
    targetMarks: 5
  };
  const { snapshot: state } = createInitialFortyTwoSnapshot(
    {
      dealer: 3,
      rules: fiveMarkRules,
      teamNames: {
        teamA: "Low",
        teamB: "High"
      }
    },
    createContext()
  );

  assert.equal(state.schemaVersion, FORTY_TWO_STATE_SCHEMA_VERSION);
  assert.equal(state.mode, "localPractice");
  assert.equal(state.phase, "setup");
  assert.equal(state.dealer, 3);
  assert.equal(state.handNumber, 1);
  assert.equal(state.createdAt, "2026-05-30T12:00:00.000Z");
  assert.equal(state.updatedAt, "2026-05-30T12:00:00.000Z");
  assert.deepEqual(state.marks, {
    teamA: 0,
    teamB: 0
  });
  assert.equal(state.rules.targetMarks, 5);
  assert.equal(state.teams.teamA.name, "Low");
  assert.equal(state.teams.teamB.name, "High");
  assert.deepEqual(state.teams.teamA.seats, [0, 2]);
  assert.deepEqual(state.teams.teamB.seats, [1, 3]);
});

function createContext(): Pick<EngineContext, "newId" | "now"> {
  return {
    newId: () => "game-1",
    now: () => "2026-05-30T12:00:00.000Z"
  };
}
