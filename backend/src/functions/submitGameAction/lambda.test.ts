import assert from "node:assert/strict";
import test from "node:test";

import {
  createSubmitGameActionLambdaHandler
} from "./lambda.ts";
import {
  type SubmitGameActionResponse
} from "../../types/index.ts";

test("submitGameAction lambda maps rejected backend responses to GraphQL shape", async () => {
  const backendResponse: SubmitGameActionResponse = {
    accepted: false,
    committed: false,
    duplicate: false,
    error: {
      code: "INVALID_ACTOR",
      message: "Authenticated actor does not match action actor."
    }
  };
  const handler = createSubmitGameActionLambdaHandler(async () => backendResponse);
  const response = await handler({
    arguments: {
      input: {
        action: {},
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
      code: "INVALID_ACTOR",
      message: "Authenticated actor does not match action actor."
    },
    events: []
  });
});
