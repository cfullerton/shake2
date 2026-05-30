import { BackendResolverError } from "../errors/errors.ts";
import { type BackendActor } from "../types/index.ts";

export function extractBackendActor(identity: unknown): BackendActor {
  const record = parseRecord(identity);
  const claims = parseOptionalRecord(record.claims);
  const playerId = getString(record.playerId) ??
    getString(record.sub) ??
    getString(claims?.sub);

  if (!playerId) {
    throw new BackendResolverError(
      "UNAUTHENTICATED",
      "Authenticated player identity is required."
    );
  }

  const displayName = getString(record.displayName) ??
    getString(record.username) ??
    getString(claims?.name) ??
    getString(claims?.["cognito:username"]);

  return {
    ...(displayName ? { displayName } : {}),
    identitySource: "mock",
    playerId
  };
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackendResolverError(
      "UNAUTHENTICATED",
      "Authenticated player identity is required."
    );
  }

  return value as Record<string, unknown>;
}

function parseOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}
