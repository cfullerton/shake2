import type { AuthSessionProvider } from "./auth";
import type { MobileMultiplayerConfig } from "./config";
import { normalizeMultiplayerPublicGameSnapshot } from "./snapshots";
import type {
  AppSyncSeatIndex,
  MultiplayerPublicGameSnapshot,
  MultiplayerSafeGameEventSummary,
  MultiplayerSubmitGameActionResultPayload
} from "./types";

export type MultiplayerGameUpdateStatus =
  | "closed"
  | "connected"
  | "connecting"
  | "subscribed";

export interface MultiplayerGameUpdateObserver {
  onError?(message: string): void;
  onSnapshot(
    snapshot: MultiplayerPublicGameSnapshot,
    update?: MultiplayerGameUpdate
  ): void;
  onStatus?(status: MultiplayerGameUpdateStatus): void;
}

export interface MultiplayerGameUpdate {
  readonly events: readonly MultiplayerSafeGameEventSummary[];
  readonly snapshot: MultiplayerPublicGameSnapshot;
}

export interface MultiplayerGameUpdateSubscription {
  unsubscribe(): void;
}

export interface MultiplayerGameRealtimeClient {
  subscribeToGameUpdates(
    input: {
      readonly gameId: string;
    },
    observer: MultiplayerGameUpdateObserver
  ): MultiplayerGameUpdateSubscription;
}

export interface WebSocketLike {
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onopen: ((event: unknown) => void) | null;
  close(): void;
  send(data: string): void;
}

export type WebSocketFactory = (
  url: string,
  protocols?: readonly string[]
) => WebSocketLike;

export class AppSyncRealtimeClient implements MultiplayerGameRealtimeClient {
  private readonly auth: AuthSessionProvider;
  private readonly config: Pick<
    MobileMultiplayerConfig,
    "appSyncGraphqlUrl" | "appSyncRealtimeUrl"
  >;
  private readonly createWebSocket?: WebSocketFactory;

  constructor(
    config: Pick<
      MobileMultiplayerConfig,
      "appSyncGraphqlUrl" | "appSyncRealtimeUrl"
    >,
    auth: AuthSessionProvider,
    createWebSocket?: WebSocketFactory
  ) {
    this.auth = auth;
    this.config = config;
    this.createWebSocket = createWebSocket;
  }

  subscribeToGameUpdates(
    input: {
      readonly gameId: string;
    },
    observer: MultiplayerGameUpdateObserver
  ): MultiplayerGameUpdateSubscription {
    const subscriptionId = createSubscriptionId();
    let closed = false;
    let socket: WebSocketLike | null = null;

    observer.onStatus?.("connecting");

    void this.auth.getIdToken()
      .then((idToken) => {
        if (closed) {
          return;
        }

        const authorization = createAuthorizationHeaders(this.config, idToken);
        const protocols = [
          "graphql-ws",
          `header-${encodeBase64Url(JSON.stringify(authorization))}`
        ];
        const nextSocket = (this.createWebSocket ?? getDefaultWebSocketFactory())(
          this.config.appSyncRealtimeUrl,
          protocols
        );

        socket = nextSocket;
        nextSocket.onopen = () => {
          sendSocketMessage(nextSocket, {
            type: "connection_init"
          });
        };
        nextSocket.onmessage = (event) => {
          try {
            handleSocketMessage({
              authorization,
              gameId: input.gameId,
              message: event.data,
              observer,
              socket: nextSocket,
              subscriptionId
            });
          } catch (error) {
            observer.onError?.(toRealtimeErrorMessage(error));
          }
        };
        nextSocket.onerror = () => {
          observer.onError?.("Realtime game updates disconnected.");
        };
        nextSocket.onclose = () => {
          observer.onStatus?.("closed");
        };
      })
      .catch((error: unknown) => {
        observer.onError?.(toRealtimeErrorMessage(error));
      });

    return {
      unsubscribe() {
        closed = true;

        if (!socket) {
          return;
        }

        try {
          sendSocketMessage(socket, {
            id: subscriptionId,
            type: "stop"
          });
        } catch {
          // The socket may already be gone. Closing below is still the right cleanup.
        }

        socket.close();
      }
    };
  }
}

function handleSocketMessage({
  authorization,
  gameId,
  message,
  observer,
  socket,
  subscriptionId
}: {
  readonly authorization: AppSyncRealtimeAuthorization;
  readonly gameId: string;
  readonly message: unknown;
  readonly observer: MultiplayerGameUpdateObserver;
  readonly socket: WebSocketLike;
  readonly subscriptionId: string;
}): void {
  const parsed = readRealtimeMessage(message);

  switch (parsed.type) {
    case "connection_ack":
      observer.onStatus?.("connected");
      sendSocketMessage(socket, {
        id: subscriptionId,
        payload: {
          data: JSON.stringify({
            query: ON_GAME_UPDATED_SUBSCRIPTION,
            variables: {
              gameId
            }
          }),
          extensions: {
            authorization
          }
        },
        type: "start"
      });
      return;
    case "start_ack":
      observer.onStatus?.("subscribed");
      return;
    case "data": {
      const update = readUpdateFromDataMessage(parsed);

      if (update) {
        observer.onSnapshot(update.snapshot, update);
      }

      return;
    }
    case "error":
      observer.onError?.(readErrorPayloadMessage(parsed.payload));
      return;
    case "complete":
    case "ka":
      return;
    default:
      return;
  }
}

function readUpdateFromDataMessage(
  message: RealtimeMessage
): MultiplayerGameUpdate | null {
  const payload = readRecord(message.payload);
  const data = readRecord(payload?.data);
  const result = readRecord(data?.onGameUpdated) as
    | MultiplayerSubmitGameActionResultPayload
    | undefined;

  if (!result?.accepted || !result.snapshot) {
    return null;
  }

  return {
    events: Array.isArray(result.events)
      ? result.events.map(readSafeGameEventSummary)
      : [],
    snapshot: normalizeMultiplayerPublicGameSnapshot(result.snapshot)
  };
}

type RealtimeMessage = Readonly<{
  id?: string;
  payload?: unknown;
  type?: string;
}>;

type AppSyncRealtimeAuthorization = Readonly<{
  Authorization: string;
  host: string;
}>;

function readRealtimeMessage(message: unknown): RealtimeMessage {
  const parsed = typeof message === "string"
    ? JSON.parse(message) as unknown
    : message;

  return readRecord(parsed) ?? {};
}

function readErrorPayloadMessage(payload: unknown): string {
  const record = readRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  const firstError = readRecord(errors[0]);
  const message = firstError?.message;

  return typeof message === "string" && message.trim().length > 0
    ? message
    : "Realtime game update failed.";
}

function createAuthorizationHeaders(
  config: Pick<MobileMultiplayerConfig, "appSyncGraphqlUrl">,
  idToken: string
): AppSyncRealtimeAuthorization {
  return {
    Authorization: idToken,
    host: new URL(config.appSyncGraphqlUrl).host
  };
}

function sendSocketMessage(
  socket: WebSocketLike,
  message: Readonly<Record<string, unknown>>
): void {
  socket.send(JSON.stringify(message));
}

function readRecord(
  value: unknown
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function readSafeGameEventSummary(value: unknown): MultiplayerSafeGameEventSummary {
  const event = readRecord(value);

  return {
    actionId: readString(event?.actionId),
    actorId: readString(event?.actorId),
    ...(isSeatIndex(event?.actorSeat) ? { actorSeat: event.actorSeat } : {}),
    eventId: readString(event?.eventId),
    eventType: readString(event?.eventType),
    sequence: readNumber(event?.sequence)
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function isSeatIndex(value: unknown): value is AppSyncSeatIndex {
  return value === "SEAT_0" ||
    value === "SEAT_1" ||
    value === "SEAT_2" ||
    value === "SEAT_3";
}

function createSubscriptionId(): string {
  const random = Math.random().toString(36).slice(2, 10);

  return `game-updates-${Date.now()}-${random}`;
}

function encodeBase64Url(value: string): string {
  return encodeBase64(value)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function encodeBase64(value: string): string {
  const btoa = (globalThis as unknown as {
    readonly btoa?: (data: string) => string;
  }).btoa;

  if (typeof btoa === "function") {
    return btoa(value);
  }

  const buffer = (globalThis as unknown as {
    readonly Buffer?: {
      from(data: string, encoding: string): {
        toString(encoding: string): string;
      };
    };
  }).Buffer;

  if (buffer) {
    return buffer.from(value, "utf8").toString("base64");
  }

  throw new Error("Base64 encoding is required for realtime subscriptions.");
}

function getDefaultWebSocketFactory(): WebSocketFactory {
  const WebSocketCtor = (globalThis as unknown as {
    readonly WebSocket?: new (
      url: string,
      protocols?: readonly string[]
    ) => WebSocketLike;
  }).WebSocket;

  if (typeof WebSocketCtor !== "function") {
    throw new Error("A WebSocket implementation is required for realtime updates.");
  }

  return (url, protocols) => new WebSocketCtor(url, protocols);
}

function toRealtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Realtime game update failed.";
}

const ON_GAME_UPDATED_SUBSCRIPTION = `
  subscription OnGameUpdated($gameId: ID!) {
    onGameUpdated(gameId: $gameId) {
      accepted
      committed
      duplicate
      gameId
      error {
        code
        message
      }
      events {
        actionId
        actorId
        actorSeat
        eventId
        eventType
        sequence
      }
      snapshot {
        gameId
        generatedAt
        lastEventSequence
        schemaVersion
        snapshotVersion
        phase
        handCounts {
          seat0
          seat1
          seat2
          seat3
        }
        redactedState
      }
    }
  }
`;
