import { BackendResolverError } from "../errors/errors.ts";
import {
  type AppSyncCognitoIdentity,
  type BackendActor
} from "../types/index.ts";

export function extractBackendActor(identity: unknown): BackendActor {
  const record = parseIdentityRecord(identity);
  const cognitoActor = extractCognitoActor(record);

  return cognitoActor ?? extractMockActor(record);
}

export function extractCognitoActor(identity: unknown): BackendActor | null {
  const record = parseIdentityRecord(identity);
  const claims = parseOptionalClaims(record.claims);
  const sub = getString(record.sub) ?? getString(claims?.sub);

  if (!sub) {
    return null;
  }

  const username = getString(record.username) ??
    getString(claims?.["cognito:username"]) ??
    getString(claims?.username);
  const email = getString(claims?.email);
  const displayName = getPreferredDisplayName({
    email,
    name: getString(claims?.name),
    username
  });

  return {
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    identitySource: "cognito",
    playerId: sub,
    ...(username ? { username } : {})
  };
}

export function extractMockActor(identity: unknown): BackendActor {
  const record = parseIdentityRecord(identity);
  const claims = parseOptionalClaims(record.claims);
  const playerId = getString(record.playerId);

  if (!playerId) {
    throw new BackendResolverError(
      "UNAUTHENTICATED",
      "Authenticated player identity is required."
    );
  }

  const username = getString(record.username) ??
    getString(claims?.["cognito:username"]) ??
    getString(claims?.username);
  const email = getString(record.email) ?? getString(claims?.email);
  const displayName = getPreferredDisplayName({
    displayName: getString(record.displayName),
    email,
    name: getString(claims?.name),
    username
  });

  return {
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    identitySource: "mock",
    playerId,
    ...(username ? { username } : {})
  };
}

export function isAppSyncCognitoIdentity(
  identity: unknown
): identity is AppSyncCognitoIdentity {
  try {
    const record = parseIdentityRecord(identity);
    const claims = parseOptionalClaims(record.claims);

    return Boolean(getString(record.sub) ?? getString(claims?.sub));
  } catch {
    return false;
  }
}

export function getPreferredDisplayName(input: {
  readonly displayName?: string | null;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly username?: string | null;
}): string | undefined {
  return getString(input.name) ??
    getString(input.displayName) ??
    getString(input.username) ??
    getString(input.email) ??
    undefined;
}

function parseIdentityRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackendResolverError(
      "UNAUTHENTICATED",
      "Authenticated player identity is required."
    );
  }

  return value as Record<string, unknown>;
}

function parseOptionalClaims(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BackendResolverError(
      "UNAUTHENTICATED",
      "Authenticated identity claims must be an object."
    );
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}
