import type {
  MultiplayerPublicGameSnapshot,
  MultiplayerPublicGameSnapshotPayload
} from "./types";

export function normalizeMultiplayerPublicGameSnapshot(
  snapshot: MultiplayerPublicGameSnapshotPayload
): MultiplayerPublicGameSnapshot {
  return {
    ...snapshot,
    redactedState: normalizeRedactedState(snapshot.redactedState)
  };
}

function normalizeRedactedState(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;

    return toRecord(parsed);
  }

  return toRecord(value);
}

function toRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Multiplayer snapshot state must be an object.");
  }

  return value as Readonly<Record<string, unknown>>;
}
