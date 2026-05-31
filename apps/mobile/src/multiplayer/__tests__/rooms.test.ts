import type { GraphqlClient, GraphqlRequest } from "../graphql";
import { MultiplayerRoomClient } from "../rooms";
import type {
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "../types";

test("MultiplayerRoomClient creates a room with the expected mutation", async () => {
  const room = createRoomView();
  const graphql = new MockGraphqlClient({
    createRoom: room
  });
  const client = new MultiplayerRoomClient(graphql);
  const result = await client.createRoom({
    displayName: "Alice",
    visibility: "public"
  });

  expect(result).toBe(room);
  expect(graphql.requests[0]?.operationName).toBe("CreateRoom");
  expect(graphql.requests[0]?.query).toContain("mutation CreateRoom");
  expect(graphql.requests[0]?.variables).toEqual({
    input: {
      displayName: "Alice",
      visibility: "public"
    }
  });
});

test("MultiplayerRoomClient joins, seats, and starts rooms through AppSync", async () => {
  const room = createRoomView();
  const started: MultiplayerStartGameResult = {
    room: {
      ...room,
      gameId: "game-1",
      status: "inGame"
    },
    snapshot: {
      gameId: "game-1",
      generatedAt: "2026-05-31T00:00:00.000Z",
      handCounts: {
        seat0: 7,
        seat1: 7,
        seat2: 7,
        seat3: 7
      },
      lastEventSequence: 2,
      phase: "dealt",
      redactedState: {
        phase: "dealt"
      },
      schemaVersion: 1,
      snapshotVersion: 2
    }
  };
  const graphql = new MockGraphqlClient({
    addBot: room,
    getRoom: room,
    joinRoom: room,
    listPublicRooms: [room],
    startGame: started,
    takeSeat: room
  });
  const client = new MultiplayerRoomClient(graphql);

  await expect(
    client.joinRoom({
      displayName: "Bob",
      roomCode: "ROOM42"
    })
  ).resolves.toBe(room);
  await expect(
    client.takeSeat({
      roomId: "room-1",
      seatIndex: "SEAT_1"
    })
  ).resolves.toBe(room);
  await expect(
    client.addBot({
      roomId: "room-1",
      seatIndex: "SEAT_2"
    })
  ).resolves.toBe(room);
  await expect(
    client.getRoom({
      roomId: "room-1"
    })
  ).resolves.toBe(room);
  await expect(client.listPublicRooms()).resolves.toEqual([room]);
  await expect(
    client.startGame({
      roomId: "room-1",
      targetMarks: 5
    })
  ).resolves.toEqual(started);

  expect(graphql.requests.map((request) => request.operationName)).toEqual([
    "JoinRoom",
    "TakeSeat",
    "AddBot",
    "GetRoom",
    "ListPublicRooms",
    "StartGame"
  ]);
  expect(graphql.requests[2]?.variables).toEqual({
    input: {
      roomId: "room-1",
      seatIndex: "SEAT_2"
    }
  });
  expect(graphql.requests[5]?.variables).toEqual({
    input: {
      roomId: "room-1",
      targetMarks: 5
    }
  });
  expect(graphql.requests[5]?.query).toContain("snapshot");
  expect(graphql.requests[5]?.query).not.toContain("hands");
});

class MockGraphqlClient implements GraphqlClient {
  readonly requests: GraphqlRequest[] = [];

  constructor(private readonly response: Readonly<Record<string, unknown>>) {}

  async execute<TData extends Readonly<Record<string, unknown>>>(
    request: GraphqlRequest
  ): Promise<TData> {
    this.requests.push(request);

    return this.response as TData;
  }
}

function createRoomView(): MultiplayerRoomView {
  return {
    createdAt: "2026-05-31T00:00:00.000Z",
    isHost: true,
    participantCount: 1,
    participants: [
      {
        connectionStatus: "online",
        displayName: "Alice",
        isBot: false,
        isViewer: true,
        joinedAt: "2026-05-31T00:00:00.000Z"
      }
    ],
    roomCode: "ROOM42",
    roomId: "room-1",
    seats: [
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_0"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_1"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_2"
      },
      {
        isViewer: false,
        isBot: false,
        occupied: false,
        seatIndex: "SEAT_3"
      }
    ],
    status: "waiting",
    updatedAt: "2026-05-31T00:00:00.000Z",
    visibility: "public"
  };
}
