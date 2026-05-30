import {
  MAX_GAME_NAME_LENGTH,
  MAX_ID_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  MAX_SCORE_NOTE_LENGTH,
  MAX_TARGET_MARKS,
  MAX_TEAM_NAME_LENGTH,
  MAX_TIMESTAMP_LENGTH,
  PLAYER_SEATS,
  TEAM_IDS,
  type PlayerSeat,
  type TeamId
} from "./types.js";

export function cleanGameName(value: string | undefined): string {
  return cleanLabel(value, "Texas 42", "name", MAX_GAME_NAME_LENGTH);
}

export function cleanTeamName(value: string | undefined, fallback: string): string {
  return cleanLabel(value, fallback, "team name", MAX_TEAM_NAME_LENGTH);
}

export function cleanPlayerName(value: string | undefined, fallback: string): string {
  return cleanLabel(value, fallback, "player name", MAX_PLAYER_NAME_LENGTH);
}

export function cleanScoreNote(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  assertStringLength(trimmed, "note", MAX_SCORE_NOTE_LENGTH);
  return trimmed;
}

export function cleanRequiredId(value: string, fieldName: string): string {
  return cleanRequiredString(value, fieldName, MAX_ID_LENGTH);
}

export function cleanTimestamp(value: string, fieldName: string): string {
  const trimmed = cleanRequiredString(value, fieldName, MAX_TIMESTAMP_LENGTH);

  if (Number.isNaN(Date.parse(trimmed))) {
    throw new Error(`${fieldName} must be a valid timestamp.`);
  }

  return trimmed;
}

export function assertTargetMarks(value: number): void {
  assertIntegerRange(value, "targetMarks", 1, MAX_TARGET_MARKS);
}

export function assertAwardMarks(value: number, targetMarks: number): void {
  assertPositiveInteger(value, "marks");

  if (value > targetMarks) {
    throw new Error("marks cannot exceed target marks.");
  }
}

export function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

export function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}

export function assertTeamId(value: unknown): asserts value is TeamId {
  if (!isTeamId(value)) {
    throw new Error(`Unknown team id: ${String(value)}`);
  }
}

export function assertPlayerSeat(value: unknown): asserts value is PlayerSeat {
  if (!isPlayerSeat(value)) {
    throw new Error(`Unknown player seat: ${String(value)}`);
  }
}

export function isTeamId(value: unknown): value is TeamId {
  return TEAM_IDS.includes(value as TeamId);
}

export function isPlayerSeat(value: unknown): value is PlayerSeat {
  return PLAYER_SEATS.includes(value as PlayerSeat);
}

export function isStringWithin(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function isTimestampString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TIMESTAMP_LENGTH &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function cleanLabel(
  value: string | undefined,
  fallback: string,
  fieldName: string,
  maxLength: number
): string {
  const trimmed = value?.trim();
  const label = trimmed ? trimmed : fallback;
  assertStringLength(label, fieldName, maxLength);
  return label;
}

function cleanRequiredString(
  value: string,
  fieldName: string,
  maxLength: number
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  assertStringLength(trimmed, fieldName, maxLength);
  return trimmed;
}

function assertStringLength(value: string, fieldName: string, maxLength: number): void {
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
}

function assertIntegerRange(
  value: number,
  fieldName: string,
  min: number,
  max: number
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${fieldName} must be an integer from ${min} to ${max}.`);
  }
}
