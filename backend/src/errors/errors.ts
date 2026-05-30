import {
  EngineError,
  type EngineErrorCode
} from "../game-engine.ts";
import {
  type BackendErrorCode,
  type BackendErrorResponse
} from "../types/index.ts";

export class BackendResolverError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string) {
    super(message);
    this.name = "BackendResolverError";
    this.code = code;
  }
}

export function createBackendErrorResponse(error: unknown): BackendErrorResponse {
  if (error instanceof BackendResolverError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (error instanceof EngineError) {
    return {
      code: error.code as EngineErrorCode,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: "PERSISTENCE_ERROR",
      message: error.message
    };
  }

  return {
    code: "PERSISTENCE_ERROR",
    message: "Unexpected backend resolver failure."
  };
}
