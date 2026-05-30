import assert from "node:assert/strict";
import test from "node:test";

import { BackendResolverError } from "../errors/errors.ts";
import {
  extractBackendActor,
  extractCognitoActor,
  extractMockActor,
  getPreferredDisplayName,
  isAppSyncCognitoIdentity
} from "./identity.ts";

test("extracts Cognito identity with top-level sub", () => {
  const actor = extractBackendActor({
    sub: "cognito-sub-1",
    username: "alice-user",
    claims: {
      email: "alice@example.com",
      name: "Alice"
    }
  });

  assert.deepEqual(actor, {
    displayName: "Alice",
    email: "alice@example.com",
    identitySource: "cognito",
    playerId: "cognito-sub-1",
    username: "alice-user"
  });
  assert.equal(isAppSyncCognitoIdentity({
    sub: "cognito-sub-1"
  }), true);
});

test("extracts Cognito identity with claims.sub", () => {
  const actor = extractBackendActor({
    claims: {
      "cognito:username": "bob-user",
      sub: "cognito-sub-2"
    }
  });

  assert.deepEqual(actor, {
    displayName: "bob-user",
    identitySource: "cognito",
    playerId: "cognito-sub-2",
    username: "bob-user"
  });
});

test("uses username as Cognito display name when name is missing", () => {
  const actor = extractBackendActor({
    claims: {
      "cognito:username": "carol-user",
      sub: "cognito-sub-3"
    }
  });

  assert.equal(actor.displayName, "carol-user");
  assert.equal(actor.username, "carol-user");
});

test("uses email as Cognito display name fallback", () => {
  const actor = extractBackendActor({
    claims: {
      email: "drew@example.com",
      sub: "cognito-sub-4"
    }
  });

  assert.equal(actor.displayName, "drew@example.com");
  assert.equal(actor.email, "drew@example.com");
});

test("rejects missing identity", () => {
  assert.throws(
    () => extractBackendActor(undefined),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "UNAUTHENTICATED"
  );
});

test("rejects malformed claims", () => {
  assert.throws(
    () => extractBackendActor({
      claims: "not-claims",
      sub: "cognito-sub-5"
    }),
    (error: unknown) =>
      error instanceof BackendResolverError &&
      error.code === "UNAUTHENTICATED"
  );
});

test("mock identity still works for local tests", () => {
  const actor = extractBackendActor({
    displayName: "Local Alice",
    playerId: "player-0",
    username: "local-alice"
  });

  assert.deepEqual(actor, {
    displayName: "Local Alice",
    identitySource: "mock",
    playerId: "player-0",
    username: "local-alice"
  });
});

test("client-provided playerId is ignored when Cognito sub exists", () => {
  const actor = extractBackendActor({
    playerId: "client-controlled-player",
    sub: "trusted-cognito-sub"
  });

  assert.equal(actor.identitySource, "cognito");
  assert.equal(actor.playerId, "trusted-cognito-sub");
});

test("helper functions expose Cognito and mock extraction paths", () => {
  assert.equal(extractCognitoActor({
    claims: {
      sub: "cognito-sub-6"
    }
  })?.playerId, "cognito-sub-6");
  assert.equal(extractCognitoActor({
    playerId: "mock-player"
  }), null);
  assert.equal(extractMockActor({
    playerId: "mock-player"
  }).identitySource, "mock");
  assert.equal(getPreferredDisplayName({
    email: "fallback@example.com",
    username: "fallback-user"
  }), "fallback-user");
});
