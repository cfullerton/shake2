import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUMP_SUITS,
  callTrump,
  compareTrumpDominoes,
  createBiddingState,
  createDomino,
  createNumericBid,
  createPassBid,
  createTrumpCallState,
  formatDomino,
  getTrumpDominoRank,
  getTrumpDominoesHighToLow,
  getTrumpSuitPip,
  isDominoTrump,
  isEngineError,
  submitBid,
  type BiddingState,
  type TrumpSuit
} from "../index.ts";

test("maps every trump suit to its pip and identifies trump dominoes", () => {
  const expectedPips: Record<TrumpSuit, number> = {
    blanks: 0,
    fives: 5,
    fours: 4,
    ones: 1,
    sixes: 6,
    threes: 3,
    twos: 2
  };

  for (const trumpSuit of TRUMP_SUITS) {
    const trumpPip = expectedPips[trumpSuit];
    const offSuitPip = trumpPip === 6 ? 5 : 6;

    assert.equal(getTrumpSuitPip(trumpSuit), trumpPip);
    assert.equal(isDominoTrump(createDomino(trumpPip, offSuitPip), trumpSuit), true);
    assert.equal(isDominoTrump(createDomino(offSuitPip, offSuitPip), trumpSuit), false);
  }
});

test("creates a standard numeric contract when declarer calls trump", () => {
  const bidding = completeBiddingWithDeclarerTwo();
  const callState = createTrumpCallState(bidding);
  const called = callTrump(callState, 2, "sixes");

  assert.equal(callState.phase, "callingTrump");
  assert.equal(called.phase, "trumpCalled");
  assert.deepEqual(called.contract, {
    bid: {
      amount: 31,
      kind: "numeric"
    },
    declarer: 2,
    kind: "standardNumeric",
    trumpSuit: "sixes"
  });
});

test("ranks trump dominoes high-to-low with double highest", () => {
  const rankedSixes = getTrumpDominoesHighToLow("sixes").map(formatDomino);

  assert.deepEqual(rankedSixes, [
    "6-6",
    "6-5",
    "6-4",
    "6-3",
    "6-2",
    "6-1",
    "6-0"
  ]);
  assert.equal(getTrumpDominoRank(createDomino(6, 6), "sixes"), 7);
  assert.equal(getTrumpDominoRank(createDomino(6, 5), "sixes"), 5);

  const unordered = [
    createDomino(6, 2),
    createDomino(6, 6),
    createDomino(6, 4)
  ];
  const sorted = [...unordered]
    .sort((left, right) => compareTrumpDominoes(left, right, "sixes"))
    .map(formatDomino);

  assert.deepEqual(sorted, ["6-6", "6-4", "6-2"]);
});

test("uses double-high ranking for every trump suit", () => {
  for (const trumpSuit of TRUMP_SUITS) {
    const trumpPip = getTrumpSuitPip(trumpSuit);
    const ranked = getTrumpDominoesHighToLow(trumpSuit);

    assert.equal(ranked.length, 7);
    assert.deepEqual(ranked[0], createDomino(trumpPip, trumpPip));
    assert.equal(getTrumpDominoRank(ranked[0] ?? createDomino(0, 0), trumpSuit), 7);
    assert.equal(ranked.every((domino) => isDominoTrump(domino, trumpSuit)), true);
  }
});

test("rejects trump calls before bidding completes", () => {
  assert.throws(
    () => createTrumpCallState(createBiddingState(0)),
    (error) => isEngineError(error) && error.code === "INVALID_PHASE"
  );
});

test("rejects trump calls by non-declarer", () => {
  const callState = createTrumpCallState(completeBiddingWithDeclarerTwo());

  assert.throws(
    () => callTrump(callState, 1, "sixes"),
    (error) => isEngineError(error) && error.code === "INVALID_ACTOR"
  );
});

test("rejects trump calls after trump has already been called", () => {
  const callState = createTrumpCallState(completeBiddingWithDeclarerTwo());
  const called = callTrump(callState, 2, "sixes");

  assert.throws(
    () => callTrump(called, 2, "fives"),
    (error) => isEngineError(error) && error.code === "INVALID_PHASE"
  );
});

test("rejects ranking a non-trump domino", () => {
  assert.throws(
    () => getTrumpDominoRank(createDomino(5, 5), "sixes"),
    (error) => isEngineError(error) && error.code === "INVALID_TRUMP"
  );
});

function completeBiddingWithDeclarerTwo(): BiddingState {
  let bidding = createBiddingState(0);
  bidding = submitBid(bidding, 1, createPassBid());
  bidding = submitBid(bidding, 2, createNumericBid(31));
  bidding = submitBid(bidding, 3, createPassBid());
  bidding = submitBid(bidding, 0, createPassBid());
  return bidding;
}
