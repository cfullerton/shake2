import { EngineError } from "./errors.ts";

export interface EngineContext {
  readonly now: () => string;
  readonly newId: () => string;
  readonly random: () => number;
}

export function getEngineTimestamp(context: Pick<EngineContext, "now">): string {
  const timestamp = context.now();

  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new EngineError(
      "INVALID_CONTEXT",
      "Engine context now() must return a valid timestamp."
    );
  }

  return timestamp;
}

export function getEngineId(context: Pick<EngineContext, "newId">): string {
  const id = context.newId();

  if (typeof id !== "string" || id.trim().length === 0) {
    throw new EngineError(
      "INVALID_CONTEXT",
      "Engine context newId() must return a non-empty string."
    );
  }

  return id;
}

export function getEngineRandom(context: Pick<EngineContext, "random">): number {
  const value = context.random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new EngineError(
      "INVALID_CONTEXT",
      "Engine context random() must return a number from 0 inclusive to 1 exclusive."
    );
  }

  return value;
}
