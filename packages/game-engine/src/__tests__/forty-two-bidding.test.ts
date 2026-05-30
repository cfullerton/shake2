import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NUMERIC_BID,
  MIN_NUMERIC_BID,
  createBiddingState,
  createNumericBid,
  createPassBid,
  isEngineError,
  submitBid
} from "../index.ts";

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
  assert.equal(state.highestBid?.bid.amount, MAX_NUMERIC_BID);
  assert.equal(state.highestBid?.forced, false);
  assert.equal(state.declarer, 3);
});

test("forces dealer to bid 30 when all players pass", () => {
  let state = createBiddingState(0);

  state = submitBid(state, 1, createPassBid());
  state = submitBid(state, 2, createPassBid());
  state = submitBid(state, 3, createPassBid());
  state = submitBid(state, 0, createPassBid());

  assert.equal(state.status, "complete");
  assert.equal(state.highestBid?.seat, 0);
  assert.equal(state.highestBid?.bid.amount, MIN_NUMERIC_BID);
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
