import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommandFailure,
  createCommandSuccess,
  createEngineError,
  getEngineId,
  getEngineRandom,
  getEngineTimestamp,
  isEngineError,
  type EngineContext
} from "../index.ts";

test("creates stable engine errors with codes and details", () => {
  const error = createEngineError("INVALID_DOMINO", "Domino is invalid.", {
    high: 7
  });

  assert.equal(error.name, "EngineError");
  assert.equal(error.code, "INVALID_DOMINO");
  assert.equal(error.message, "Domino is invalid.");
  assert.deepEqual(error.details, { high: 7 });
  assert.equal(isEngineError(error), true);
});

test("creates command success and failure results", () => {
  const success = createCommandSuccess([{ type: "EVENT_CREATED" }]);
  const failure = createCommandFailure(
    createEngineError("INVALID_CONTEXT", "Context is invalid.")
  );

  assert.deepEqual(success, {
    events: [{ type: "EVENT_CREATED" }],
    ok: true
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.error.code, "INVALID_CONTEXT");
});

test("reads validated engine context values", () => {
  const context: EngineContext = {
    newId: () => "id-1",
    now: () => "2026-05-30T12:00:00.000Z",
    random: () => 0.25
  };

  assert.equal(getEngineTimestamp(context), "2026-05-30T12:00:00.000Z");
  assert.equal(getEngineId(context), "id-1");
  assert.equal(getEngineRandom(context), 0.25);
});

test("rejects invalid engine context values", () => {
  assert.throws(
    () => getEngineTimestamp({ now: () => "not-a-date" }),
    /valid timestamp/
  );
  assert.throws(() => getEngineId({ newId: () => "   " }), /non-empty string/);
  assert.throws(() => getEngineRandom({ random: () => 1 }), /0 inclusive/);
});
