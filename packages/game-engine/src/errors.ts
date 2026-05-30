export type EngineErrorCode =
  | "GAME_NOT_FOUND"
  | "GAME_ALREADY_COMPLETE"
  | "INVALID_ACTION"
  | "INVALID_ACTOR"
  | "INVALID_CONTEXT"
  | "INVALID_PHASE"
  | "INVALID_SEAT"
  | "INVALID_BID"
  | "INVALID_TRUMP"
  | "INVALID_DOMINO"
  | "NOT_PLAYERS_TURN"
  | "MUST_FOLLOW_SUIT"
  | "DUPLICATE_ACTION"
  | "STALE_ACTION"
  | "SCHEMA_VERSION_UNSUPPORTED";

export type EngineErrorDetails = Readonly<Record<string, unknown>>;

export class EngineError<TCode extends string = EngineErrorCode> extends Error {
  readonly code: TCode;
  readonly details: EngineErrorDetails;

  constructor(code: TCode, message: string, details: EngineErrorDetails = {}) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type CommandResult<TEvent, TCode extends string = EngineErrorCode> =
  | {
      readonly ok: true;
      readonly events: readonly TEvent[];
    }
  | {
      readonly ok: false;
      readonly error: EngineError<TCode>;
    };

export function createEngineError<TCode extends string>(
  code: TCode,
  message: string,
  details?: EngineErrorDetails
): EngineError<TCode> {
  return new EngineError(code, message, details);
}

export function createCommandSuccess<TEvent>(
  events: readonly TEvent[]
): CommandResult<TEvent, never> {
  return {
    events,
    ok: true
  };
}

export function createCommandFailure<TCode extends string>(
  error: EngineError<TCode>
): CommandResult<never, TCode> {
  return {
    error,
    ok: false
  };
}

export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError;
}
