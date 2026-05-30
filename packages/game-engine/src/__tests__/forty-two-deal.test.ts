import assert from "node:assert/strict";
import test from "node:test";

import {
  DOMINOES_PER_HAND,
  DOUBLE_SIX_DOMINO_COUNT,
  FORTY_TWO_TEAM_SEATS,
  FORTY_TWO_TEAMS,
  PLAYER_COUNT,
  SEAT_INDICES,
  arePartnerSeats,
  createDoubleSixSet,
  dealDominoes,
  dealDoubleSixDominoes,
  getBidOrder,
  getDealtDominoKeys,
  getDominoKey,
  getHandForSeat,
  getNextDealerSeat,
  getNextSeat,
  getPartnerSeat,
  getPreviousSeat,
  getTeamForSeat,
  isEngineError,
  isSeatIndex,
  shuffleDominoes
} from "../index.ts";

test("models four seat indices and two opposite-seat teams", () => {
  assert.deepEqual(SEAT_INDICES, [0, 1, 2, 3]);
  assert.equal(isSeatIndex(0), true);
  assert.equal(isSeatIndex(3), true);
  assert.equal(isSeatIndex(4), false);

  assert.deepEqual(FORTY_TWO_TEAM_SEATS.teamA, [0, 2]);
  assert.deepEqual(FORTY_TWO_TEAM_SEATS.teamB, [1, 3]);
  assert.deepEqual(FORTY_TWO_TEAMS.teamA.seats, [0, 2]);
  assert.equal(getTeamForSeat(0), "teamA");
  assert.equal(getTeamForSeat(2), "teamA");
  assert.equal(getTeamForSeat(1), "teamB");
  assert.equal(getTeamForSeat(3), "teamB");
});

test("finds partner seats across the table", () => {
  assert.equal(getPartnerSeat(0), 2);
  assert.equal(getPartnerSeat(1), 3);
  assert.equal(getPartnerSeat(2), 0);
  assert.equal(getPartnerSeat(3), 1);
  assert.equal(arePartnerSeats(0, 2), true);
  assert.equal(arePartnerSeats(0, 1), false);
});

test("rotates dealer seats clockwise", () => {
  assert.equal(getNextSeat(0), 1);
  assert.equal(getNextSeat(1), 2);
  assert.equal(getNextSeat(2), 3);
  assert.equal(getNextSeat(3), 0);
  assert.equal(getPreviousSeat(0), 3);
  assert.equal(getNextDealerSeat(3), 0);
});

test("starts bid order left of dealer", () => {
  assert.deepEqual(getBidOrder(0), [1, 2, 3, 0]);
  assert.deepEqual(getBidOrder(1), [2, 3, 0, 1]);
  assert.deepEqual(getBidOrder(2), [3, 0, 1, 2]);
  assert.deepEqual(getBidOrder(3), [0, 1, 2, 3]);
});

test("rejects invalid seat indices", () => {
  assert.throws(
    () => getTeamForSeat(4 as never),
    (error) => isEngineError(error) && error.code === "INVALID_SEAT"
  );
});

test("shuffles dominoes deterministically from EngineContext.random", () => {
  const source = createDoubleSixSet();
  const values = [0.12, 0.82, 0.33, 0.67, 0.41, 0.05, 0.95];
  let calls = 0;
  const firstShuffle = shuffleDominoes(source, {
    random: () => {
      const value = values[calls % values.length] ?? 0;
      calls += 1;
      return value;
    }
  }).map(getDominoKey);

  let repeatCalls = 0;
  const secondShuffle = shuffleDominoes(source, {
    random: () => {
      const value = values[repeatCalls % values.length] ?? 0;
      repeatCalls += 1;
      return value;
    }
  }).map(getDominoKey);

  assert.equal(calls, DOUBLE_SIX_DOMINO_COUNT - 1);
  assert.deepEqual(firstShuffle, secondShuffle);
  assert.notDeepEqual(firstShuffle, source.map(getDominoKey));
  assert.equal(new Set(firstShuffle).size, DOUBLE_SIX_DOMINO_COUNT);
});

test("deals exactly seven dominoes to each seat", () => {
  const hands = dealDominoes(createDoubleSixSet());

  for (const seat of SEAT_INDICES) {
    assert.equal(getHandForSeat(hands, seat).length, DOMINOES_PER_HAND);
  }

  assert.equal(SEAT_INDICES.length, PLAYER_COUNT);
});

test("deals all 28 double-six dominoes exactly once", () => {
  const hands = dealDoubleSixDominoes({ random: () => 0.5 });
  const dealtKeys = getDealtDominoKeys(hands);
  const expectedKeys = createDoubleSixSet().map(getDominoKey);

  assert.equal(dealtKeys.length, DOUBLE_SIX_DOMINO_COUNT);
  assert.equal(new Set(dealtKeys).size, DOUBLE_SIX_DOMINO_COUNT);
  assert.deepEqual(new Set(dealtKeys), new Set(expectedKeys));
});

test("rejects deals with the wrong number of dominoes", () => {
  assert.throws(
    () => dealDominoes(createDoubleSixSet().slice(0, -1)),
    (error) => isEngineError(error) && error.code === "INVALID_DOMINO"
  );
});
