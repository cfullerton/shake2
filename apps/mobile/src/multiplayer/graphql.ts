import type { MobileMultiplayerConfig } from "./config";
import type { AuthSessionProvider } from "./auth";
import { getDefaultFetch, type FetchLike } from "./http";

export interface GraphqlRequest {
  readonly operationName?: string;
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export interface GraphqlErrorPayload {
  readonly errorType?: string;
  readonly message?: string;
}

export interface GraphqlClient {
  execute<TData extends Readonly<Record<string, unknown>>>(
    request: GraphqlRequest
  ): Promise<TData>;
}

export class GraphqlNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphqlNetworkError";
  }
}

export class GraphqlRequestError extends Error {
  readonly errors: readonly GraphqlErrorPayload[];

  constructor(errors: readonly GraphqlErrorPayload[]) {
    super(errors[0]?.message ?? "GraphQL request failed.");
    this.name = "GraphqlRequestError";
    this.errors = errors;
  }
}

export class AppSyncGraphqlClient implements GraphqlClient {
  private readonly auth: AuthSessionProvider;
  private readonly config: Pick<MobileMultiplayerConfig, "appSyncGraphqlUrl">;
  private readonly fetcher: FetchLike;

  constructor(
    config: Pick<MobileMultiplayerConfig, "appSyncGraphqlUrl">,
    auth: AuthSessionProvider,
    fetcher: FetchLike = getDefaultFetch()
  ) {
    this.auth = auth;
    this.config = config;
    this.fetcher = fetcher;
  }

  async execute<TData extends Readonly<Record<string, unknown>>>(
    request: GraphqlRequest
  ): Promise<TData> {
    const idToken = await this.auth.getIdToken();
    const response = await this.fetcher(this.config.appSyncGraphqlUrl, {
      body: JSON.stringify({
        operationName: request.operationName,
        query: request.query,
        variables: request.variables ?? {}
      }),
      headers: {
        Authorization: idToken,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const body = readGraphqlBody(await response.json());

    if (!response.ok) {
      throw new GraphqlNetworkError(
        `GraphQL request failed with HTTP ${response.status}.`
      );
    }

    if (body.errors.length > 0) {
      throw new GraphqlRequestError(body.errors);
    }

    if (!body.data) {
      throw new GraphqlRequestError([
        {
          message: "GraphQL response did not include data."
        }
      ]);
    }

    return body.data as TData;
  }
}

function readGraphqlBody(value: unknown): {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly errors: readonly GraphqlErrorPayload[];
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GraphqlNetworkError("GraphQL response must be an object.");
  }

  const record = value as Readonly<Record<string, unknown>>;
  const errorsValue = record.errors;

  return {
    ...(isRecord(record.data) ? { data: record.data } : {}),
    errors: Array.isArray(errorsValue)
      ? errorsValue.map(readGraphqlError)
      : []
  };
}

function readGraphqlError(value: unknown): GraphqlErrorPayload {
  if (!isRecord(value)) {
    return {
      message: "GraphQL returned an unknown error."
    };
  }

  return {
    ...(typeof value.errorType === "string"
      ? { errorType: value.errorType }
      : {}),
    ...(typeof value.message === "string" ? { message: value.message } : {})
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
