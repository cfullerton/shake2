import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NUMERIC_BID,
  MIN_NUMERIC_BID,
  createBiddingState,
  createMarkBid,
  createNumericBid,
  createPassBid,
  isEngineError,
  standardRules,
  submitBid
} from "../index.ts";

const markBidRules = {
  ...standardRules,
  enabledContracts: {
    ...standardRules.enabledContracts,
    markBids: true
  }
};

test("starts bidding left of dealer", () => {
  const state = createBiddingState(2);

  assert.deepEqual(state.order, [3, 0, 1, 2]);
  assert.equal(state.currentSeat, 3);
  assert.equal(state.status, "inProgress");
});

test("completes normal numeric bidding with highest bidder as declarer", () => {
  let state = createBiddingState(0);

  state = submitBid(state, 1, createPassBid());
  assert.equal(state.currentSeat, 2);
  assert.equal(state.highestBid, null);

  state = submitBid(state, 2, createNumericBid(MIN_NUMERIC_BID));
  state = submitBid(state, 3, createNumericBid(MAX_NUMERIC_BID));
  state = submitBid(state, 0, createPassBid());

  assert.equal(state.status, "complete");
  assert.equal(state.currentSeat, null);
  assert.equal(state.bids.length, 4);
  assert.equal(state.highestBid?.seat, 3);
  assert.deepEqual(state.highestBid?.bid, createNumericBid(MAX_NUMERIC_BID));
  assert.equal(state.highestBid?.forced, false);
  assert.equal(state.declarer, 3);
});

test("rejects mark bids unless the variant is enabled", () => {
  const state = createBiddingState(0);

  assert.throws(
    () => submitBid(state, 1, createMarkBid(1)),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("allows an opening mark bidder to bid one or two marks", () => {
  const state = createBiddingState(0);
  const oneMark = submitBid(state, 1, createMarkBid(1), markBidRules);
  const twoMarks = submitBid(state, 1, createMarkBid(2), markBidRules);

  assert.deepEqual(oneMark.highestBid?.bid, createMarkBid(1));
  assert.deepEqual(twoMarks.highestBid?.bid, createMarkBid(2));
  assert.throws(
    () => submitBid(state, 1, createMarkBid(3), markBidRules),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("requires later mark bids to climb exactly one mark", () => {
  let state = createBiddingState(0);

  state = submitBid(state, 1, createMarkBid(2), markBidRules);
  state = submitBid(state, 2, createMarkBid(3), markBidRules);

  assert.deepEqual(state.highestBid?.bid, createMarkBid(3));
  assert.throws(
    () => submitBid(state, 3, createMarkBid(5), markBidRules),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("rejects numeric bids after a mark bid", () => {
  const state = submitBid(
    createBiddingState(0),
    1,
    createMarkBid(2),
    markBidRules
  );

  assert.throws(
    () => submitBid(state, 2, createNumericBid(MAX_NUMERIC_BID), markBidRules),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("forces dealer to bid 30 when all players pass", () => {
  let state = createBiddingState(0);

  state = submitBid(state, 1, createPassBid());
  state = submitBid(state, 2, createPassBid());
  state = submitBid(state, 3, createPassBid());
  state = submitBid(state, 0, createPassBid());

  assert.equal(state.status, "complete");
  assert.equal(state.highestBid?.seat, 0);
  assert.deepEqual(state.highestBid?.bid, createNumericBid(MIN_NUMERIC_BID));
  assert.equal(state.highestBid?.forced, true);
  assert.equal(state.declarer, 0);
});

test("gives each player exactly one bid opportunity", () => {
  let state = createBiddingState(3);

  state = submitBid(state, 0, createNumericBid(30));
  state = submitBid(state, 1, createPassBid());
  state = submitBid(state, 2, createPassBid());
  state = submitBid(state, 3, createPassBid());

  assert.equal(state.bids.length, 4);
  assert.throws(
    () => submitBid(state, 0, createNumericBid(31)),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("rejects invalid low bids", () => {
  const state = createBiddingState(0);

  assert.throws(
    () => submitBid(state, 1, createNumericBid(MIN_NUMERIC_BID - 1)),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("rejects non-increasing numeric bids", () => {
  let state = createBiddingState(0);

  state = submitBid(state, 1, createNumericBid(31));

  assert.throws(
    () => submitBid(state, 2, createNumericBid(31)),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("rejects numeric bids over 42", () => {
  const state = createBiddingState(0);

  assert.throws(
    () => submitBid(state, 1, createNumericBid(MAX_NUMERIC_BID + 1)),
    (error) => isEngineError(error) && error.code === "INVALID_BID"
  );
});

test("rejects bids made out of order", () => {
  const state = createBiddingState(0);

  assert.throws(
    () => submitBid(state, 2, createPassBid()),
    (error) => isEngineError(error) && error.code === "NOT_PLAYERS_TURN"
  );
});
