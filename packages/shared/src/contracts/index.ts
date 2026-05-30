export const GAME_CONTRACT_SCHEMA_VERSION = 1;

export const CONTRACT_PLAYER_SEATS = ["north", "east", "south", "west"] as const;
export type ContractPlayerSeat = (typeof CONTRACT_PLAYER_SEATS)[number];

export const CONTRACT_TEAM_IDS = ["northSouth", "eastWest"] as const;
export type ContractTeamId = (typeof CONTRACT_TEAM_IDS)[number];

export type ActorId = string;
export type ClientActionId = string;
export type EventId = string;
export type GameId = string;
export type SnapshotId = string;
export type GameSequence = number;

export type GameActionType =
  | "scorekeeper.game.create"
  | "scorekeeper.marks.award"
  | "scorekeeper.score.undo";

export type GameEventType =
  | "scorekeeper.game.created"
  | "scorekeeper.marks.awarded"
  | "scorekeeper.score.undone";

export type GameErrorCode =
  | "GAME_NOT_FOUND"
  | "GAME_COMPLETE"
  | "INVALID_ACTION"
  | "INVALID_ACTOR"
  | "INVALID_STATE"
  | "OUT_OF_ORDER"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_SCHEMA_VERSION";

export interface GameActionBase<TType extends GameActionType, TPayload> {
  readonly schemaVersion: typeof GAME_CONTRACT_SCHEMA_VERSION;
  readonly actionId: ClientActionId;
  readonly actorId: ActorId;
  readonly gameId: GameId;
  readonly submittedAt: string;
  readonly type: TType;
  readonly payload: TPayload;
}

export interface CreateScorekeeperGamePayload {
  readonly dealer: ContractPlayerSeat;
  readonly name: string;
  readonly playerNames: Record<ContractPlayerSeat, string>;
  readonly targetMarks: number;
  readonly teamNames: Record<ContractTeamId, string>;
}

export interface AwardScorekeeperMarksPayload {
  readonly marks: number;
  readonly note?: string;
  readonly teamId: ContractTeamId;
}

export interface UndoScorekeeperPayload {
  readonly reason?: string;
}

export type CreateScorekeeperGameAction = GameActionBase<
  "scorekeeper.game.create",
  CreateScorekeeperGamePayload
>;

export type AwardScorekeeperMarksAction = GameActionBase<
  "scorekeeper.marks.award",
  AwardScorekeeperMarksPayload
>;

export type UndoScorekeeperAction = GameActionBase<
  "scorekeeper.score.undo",
  UndoScorekeeperPayload
>;

export type GameAction =
  | CreateScorekeeperGameAction
  | AwardScorekeeperMarksAction
  | UndoScorekeeperAction;

export interface GameEventBase<TType extends GameEventType, TPayload> {
  readonly schemaVersion: typeof GAME_CONTRACT_SCHEMA_VERSION;
  readonly eventId: EventId;
  readonly gameId: GameId;
  readonly actorId: ActorId;
  readonly actionId: ClientActionId;
  readonly sequence: GameSequence;
  readonly occurredAt: string;
  readonly type: TType;
  readonly payload: TPayload;
}

export interface ScorekeeperGameCreatedPayload {
  readonly dealer: ContractPlayerSeat;
  readonly name: string;
  readonly playerNames: Record<ContractPlayerSeat, string>;
  readonly targetMarks: number;
  readonly teamNames: Record<ContractTeamId, string>;
}

export interface ScorekeeperMarksAwardedPayload {
  readonly handNumber: number;
  readonly marks: number;
  readonly note?: string;
  readonly teamId: ContractTeamId;
}

export interface ScorekeeperScoreUndonePayload {
  readonly undoneEventId?: EventId;
}

export type ScorekeeperGameCreatedEvent = GameEventBase<
  "scorekeeper.game.created",
  ScorekeeperGameCreatedPayload
>;

export type ScorekeeperMarksAwardedEvent = GameEventBase<
  "scorekeeper.marks.awarded",
  ScorekeeperMarksAwardedPayload
>;

export type ScorekeeperScoreUndoneEvent = GameEventBase<
  "scorekeeper.score.undone",
  ScorekeeperScoreUndonePayload
>;

export type GameEvent =
  | ScorekeeperGameCreatedEvent
  | ScorekeeperMarksAwardedEvent
  | ScorekeeperScoreUndoneEvent;

export interface GameSnapshot<TState = unknown> {
  readonly schemaVersion: typeof GAME_CONTRACT_SCHEMA_VERSION;
  readonly snapshotId: SnapshotId;
  readonly gameId: GameId;
  readonly lastEventSequence: GameSequence;
  readonly createdAt: string;
  readonly state: TState;
}

export type GameActionResult<TEvent extends GameEvent = GameEvent> =
  | {
      readonly ok: true;
      readonly acceptedActionId: ClientActionId;
      readonly events: readonly TEvent[];
      readonly snapshot?: GameSnapshot;
    }
  | {
      readonly ok: false;
      readonly rejectedActionId: ClientActionId;
      readonly errorCode: GameErrorCode;
      readonly message: string;
    };

export function createGameAction<TType extends GameActionType, TPayload>(
  input: Omit<GameActionBase<TType, TPayload>, "schemaVersion">
): GameActionBase<TType, TPayload> {
  return {
    ...input,
    schemaVersion: GAME_CONTRACT_SCHEMA_VERSION
  };
}

export function createGameEvent<TType extends GameEventType, TPayload>(
  input: Omit<GameEventBase<TType, TPayload>, "schemaVersion">
): GameEventBase<TType, TPayload> {
  return {
    ...input,
    schemaVersion: GAME_CONTRACT_SCHEMA_VERSION
  };
}

export function createGameSnapshot<TState>(
  input: Omit<GameSnapshot<TState>, "schemaVersion">
): GameSnapshot<TState> {
  return {
    ...input,
    schemaVersion: GAME_CONTRACT_SCHEMA_VERSION
  };
}

export function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === GAME_CONTRACT_SCHEMA_VERSION &&
    isNonEmptyString(value.actionId) &&
    isNonEmptyString(value.actorId) &&
    isNonEmptyString(value.gameId) &&
    isTimestampString(value.submittedAt) &&
    isGameActionType(value.type) &&
    isRecord(value.payload)
  );
}

export function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === GAME_CONTRACT_SCHEMA_VERSION &&
    isNonEmptyString(value.eventId) &&
    isNonEmptyString(value.gameId) &&
    isNonEmptyString(value.actorId) &&
    isNonEmptyString(value.actionId) &&
    isPositiveInteger(value.sequence) &&
    isTimestampString(value.occurredAt) &&
    isGameEventType(value.type) &&
    isRecord(value.payload)
  );
}

export function isGameSnapshot(value: unknown): value is GameSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === GAME_CONTRACT_SCHEMA_VERSION &&
    isNonEmptyString(value.snapshotId) &&
    isNonEmptyString(value.gameId) &&
    isNonNegativeInteger(value.lastEventSequence) &&
    isTimestampString(value.createdAt) &&
    "state" in value
  );
}

function isGameActionType(value: unknown): value is GameActionType {
  return (
    value === "scorekeeper.game.create" ||
    value === "scorekeeper.marks.award" ||
    value === "scorekeeper.score.undo"
  );
}

function isGameEventType(value: unknown): value is GameEventType {
  return (
    value === "scorekeeper.game.created" ||
    value === "scorekeeper.marks.awarded" ||
    value === "scorekeeper.score.undone"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestampString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
