import { BackendResolverError } from "../../errors/errors.ts";
import { type SeatIndex } from "../../game-engine.ts";

export interface AppSyncResolverEvent {
  readonly arguments?: Readonly<Record<string, unknown>>;
  readonly identity?: unknown;
  readonly request?: {
    readonly headers?: Readonly<Record<string, string | undefined>>;
  };
}

export function parseArguments(
  event: AppSyncResolverEvent,
  label: string
): Readonly<Record<string, unknown>> {
  return parseRecord(event.arguments, `${label}.arguments`);
}

export function parseInputObject(
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> {
  return parseRecord(value, label);
}

export function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be a non-empty string.`
    );
  }

  return value;
}

export function parseNonNegativeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be a non-negative integer.`
    );
  }

  return value;
}

export function parsePendingActionIds(
  value: unknown,
  label: string
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be an array.`
    );
  }

  return value.map((actionId, index) =>
    parseNonEmptyString(actionId, `${label}[${index}]`)
  );
}

export function parseSeatIndex(value: unknown, label: string): SeatIndex {
  if (value === 0 || value === "SEAT_0") {
    return 0;
  }

  if (value === 1 || value === "SEAT_1") {
    return 1;
  }

  if (value === 2 || value === "SEAT_2") {
    return 2;
  }

  if (value === 3 || value === "SEAT_3") {
    return 3;
  }

  throw new BackendResolverError(
    "MALFORMED_REQUEST",
    `${label} must be a valid seat index.`
  );
}

function parseRecord(
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackendResolverError(
      "MALFORMED_REQUEST",
      `${label} must be an object.`
    );
  }

  return value as Readonly<Record<string, unknown>>;
}
