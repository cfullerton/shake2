import assert from "node:assert/strict";
import test from "node:test";

import {
  createStartNextHandLambdaHandler
} from "./lambda.ts";
import {
  type SubmitGameActionResponse
} from "../../types/index.ts";

test("startNextHand lambda maps rejected backend responses to GraphQL shape", async () => {
  const backendResponse: SubmitGameActionResponse = {
    accepted: false,
    committed: false,
    duplicate: false,
    error: {
      code: "INVALID_PHASE",
      message: "The next hand can only be dealt after a completed hand."
    }
  };
  const handler = createStartNextHandLambdaHandler(async () => backendResponse);
  const response = await handler({
    arguments: {
      input: {
        gameId: "game-1"
      }
    },
    identity: {
      sub: "actor-sub"
    }
  });

  assert.deepEqual(response, {
    accepted: false,
    committed: false,
    duplicate: false,
    error: {
      code: "INVALID_PHASE",
      message: "The next hand can only be dealt after a completed hand."
    },
    events: []
  });
});
