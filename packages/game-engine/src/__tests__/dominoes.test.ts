import assert from "node:assert/strict";
import test from "node:test";

import {
  COUNT_DOMINO_KEYS,
  DOUBLE_SIX_DOMINO_COUNT,
  TOTAL_COUNT_DOMINO_POINTS,
  createDomino,
  createDoubleSixSet,
  dominoContainsPip,
  dominoEquals,
  formatDomino,
  getDominoCountPoints,
  getDominoKey,
  getTotalCountPoints,
  isCountDomino,
  isDouble,
  isEngineError
} from "../index.ts";

test("creates normalized dominoes with canonical keys and strings", () => {
  const domino = createDomino(4, 6);
  const equivalent = createDomino(6, 4);

  assert.deepEqual(domino, { high: 6, low: 4 });
  assert.equal(getDominoKey(domino), "6-4");
  assert.equal(formatDomino(domino), "6-4");
  assert.equal(dominoEquals(domino, equivalent), true);
  assert.equal(dominoContainsPip(domino, 6), true);
  assert.equal(dominoContainsPip(domino, 1), false);
});

test("supports doubles and blanks", () => {
  const blankDouble = createDomino(0, 0);
  const fiveDouble = createDomino(5, 5);

  assert.equal(isDouble(blankDouble), true);
  assert.equal(formatDomino(blankDouble), "0-0");
  assert.equal(isDouble(fiveDouble), true);
  assert.equal(formatDomino(fiveDouble), "5-5");
});

test("rejects invalid pips", () => {
  assert.throws(
    () => createDomino(7, 0),
    (error) => isEngineError(error) && error.code === "INVALID_DOMINO"
  );
  assert.throws(
    () => createDomino(-1, 0),
    (error) => isEngineError(error) && error.code === "INVALID_DOMINO"
  );
});

test("generates exactly 28 unique double-six dominoes", () => {
  const dominoes = createDoubleSixSet();
  const keys = dominoes.map(getDominoKey);

  assert.equal(dominoes.length, DOUBLE_SIX_DOMINO_COUNT);
  assert.equal(new Set(keys).size, DOUBLE_SIX_DOMINO_COUNT);
  assert.equal(keys.includes("0-0"), true);
  assert.equal(keys.includes("6-6"), true);
  assert.equal(keys.includes("6-0"), true);
});

test("identifies and scores the five count dominoes", () => {
  assert.deepEqual([...COUNT_DOMINO_KEYS].sort(), [
    "3-2",
    "4-1",
    "5-0",
    "5-5",
    "6-4"
  ]);

  assert.equal(getDominoCountPoints(createDomino(0, 5)), 5);
  assert.equal(getDominoCountPoints(createDomino(1, 4)), 5);
  assert.equal(getDominoCountPoints(createDomino(2, 3)), 5);
  assert.equal(getDominoCountPoints(createDomino(5, 5)), 10);
  assert.equal(getDominoCountPoints(createDomino(4, 6)), 10);
  assert.equal(getDominoCountPoints(createDomino(6, 6)), 0);
  assert.equal(isCountDomino(createDomino(4, 6)), true);
  assert.equal(isCountDomino(createDomino(6, 6)), false);
});

test("proves total count domino points equal 35", () => {
  const dominoes = createDoubleSixSet();

  assert.equal(getTotalCountPoints(dominoes), TOTAL_COUNT_DOMINO_POINTS);
  assert.equal(TOTAL_COUNT_DOMINO_POINTS, 35);
});
