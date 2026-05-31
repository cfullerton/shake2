import { StaticAuthSessionProvider } from "../auth";
import {
  AppSyncRealtimeClient,
  type WebSocketFactory,
  type WebSocketLike
} from "../realtime";

test("AppSyncRealtimeClient starts game update subscriptions over graphql-ws", async () => {
  const sockets: FakeWebSocket[] = [];
  const client = new AppSyncRealtimeClient(
    {
      appSyncGraphqlUrl:
        "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
      appSyncRealtimeUrl:
        "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql"
    },
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }),
    createSocketFactory(sockets)
  );
  const statuses: string[] = [];

  client.subscribeToGameUpdates({
    gameId: "game-1"
  }, {
    onSnapshot: jest.fn(),
    onStatus: (status) => statuses.push(status)
  });

  await flushPromises();

  const socket = requireSocket(sockets);
  expect(socket.url).toBe(
    "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql"
  );
  expect(socket.protocols[0]).toBe("graphql-ws");
  expect(readHeaderProtocol(socket.protocols[1])).toEqual({
    Authorization: "id-token",
    host: "abc.appsync-api.us-east-1.amazonaws.com"
  });

  socket.open();
  expect(readSentMessage(socket, 0)).toEqual({
    type: "connection_init"
  });

  socket.message({
    type: "connection_ack"
  });
  const startMessage = readSentMessage(socket, 1) as {
    readonly payload?: {
      readonly data?: string;
      readonly extensions?: {
        readonly authorization?: unknown;
      };
    };
    readonly type?: string;
  };
  const data = JSON.parse(startMessage.payload?.data ?? "{}") as {
    readonly query?: string;
    readonly variables?: {
      readonly gameId?: string;
    };
  };

  expect(statuses).toEqual(["connecting", "connected"]);
  expect(startMessage.type).toBe("start");
  expect(data.query).toMatch(/subscription OnGameUpdated/u);
  expect(data.variables?.gameId).toBe("game-1");
  expect(startMessage.payload?.extensions?.authorization).toEqual({
    Authorization: "id-token",
    host: "abc.appsync-api.us-east-1.amazonaws.com"
  });
});

test("AppSyncRealtimeClient normalizes snapshots from game update messages", async () => {
  const sockets: FakeWebSocket[] = [];
  const client = new AppSyncRealtimeClient(
    {
      appSyncGraphqlUrl:
        "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
      appSyncRealtimeUrl:
        "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql"
    },
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }),
    createSocketFactory(sockets)
  );
  const onSnapshot = jest.fn();

  client.subscribeToGameUpdates({
    gameId: "game-1"
  }, {
    onSnapshot
  });

  await flushPromises();

  const socket = requireSocket(sockets);
  socket.message({
    id: "subscription-1",
    payload: {
      data: {
        onGameUpdated: {
          accepted: true,
          committed: true,
          duplicate: false,
          events: [],
          gameId: "game-1",
          snapshot: {
            gameId: "game-1",
            generatedAt: "2026-05-31T00:00:00.000Z",
            lastEventSequence: 8,
            phase: "trickPlay",
            redactedState: JSON.stringify({
              dealer: 0,
              phase: "trickPlay"
            }),
            schemaVersion: 1,
            snapshotVersion: 8
          }
        }
      }
    },
    type: "data"
  });

  expect(onSnapshot).toHaveBeenCalledWith({
    gameId: "game-1",
    generatedAt: "2026-05-31T00:00:00.000Z",
    lastEventSequence: 8,
    phase: "trickPlay",
    redactedState: {
      dealer: 0,
      phase: "trickPlay"
    },
    schemaVersion: 1,
    snapshotVersion: 8
  });
});

test("AppSyncRealtimeClient stops the active subscription when unsubscribed", async () => {
  const sockets: FakeWebSocket[] = [];
  const client = new AppSyncRealtimeClient(
    {
      appSyncGraphqlUrl:
        "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
      appSyncRealtimeUrl:
        "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql"
    },
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }),
    createSocketFactory(sockets)
  );
  const subscription = client.subscribeToGameUpdates({
    gameId: "game-1"
  }, {
    onSnapshot: jest.fn()
  });

  await flushPromises();

  const socket = requireSocket(sockets);
  subscription.unsubscribe();

  expect(readSentMessage(socket, 0)).toMatchObject({
    type: "stop"
  });
  expect(socket.closed).toBe(true);
});

class FakeWebSocket implements WebSocketLike {
  closed = false;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onopen: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];

  constructor(
    readonly url: string,
    readonly protocols: readonly string[] = []
  ) {}

  close(): void {
    this.closed = true;
    this.onclose?.({});
  }

  message(value: unknown): void {
    this.onmessage?.({
      data: JSON.stringify(value)
    });
  }

  open(): void {
    this.onopen?.({});
  }

  send(data: string): void {
    this.sent.push(data);
  }
}

function createSocketFactory(sockets: FakeWebSocket[]): WebSocketFactory {
  return (url, protocols) => {
    const socket = new FakeWebSocket(url, protocols ?? []);

    sockets.push(socket);

    return socket;
  };
}

function requireSocket(sockets: readonly FakeWebSocket[]): FakeWebSocket {
  const socket = sockets[0];

  if (!socket) {
    throw new Error("Expected a WebSocket to be opened.");
  }

  return socket;
}

function readSentMessage(
  socket: FakeWebSocket,
  index: number
): Readonly<Record<string, unknown>> {
  return JSON.parse(socket.sent[index] ?? "{}") as Readonly<Record<string, unknown>>;
}

function readHeaderProtocol(value: string | undefined): unknown {
  if (!value?.startsWith("header-")) {
    return null;
  }

  return JSON.parse(decodeBase64Url(value.slice("header-".length))) as unknown;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${normalized}${"=".repeat((4 - normalized.length % 4) % 4)}`;
  const buffer = (globalThis as unknown as {
    readonly Buffer: {
      from(data: string, encoding: string): {
        toString(encoding: string): string;
      };
    };
  }).Buffer;

  return buffer.from(padded, "base64").toString("utf8");
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
