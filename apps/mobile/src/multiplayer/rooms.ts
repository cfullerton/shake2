import type { GraphqlClient } from "./graphql";
import type {
  AppSyncSeatIndex,
  MultiplayerRoomView,
  MultiplayerStartGameResult
} from "./types";

export interface CreateRoomInput {
  readonly displayName: string;
}

export interface JoinRoomInput {
  readonly displayName: string;
  readonly roomCode: string;
}

export interface TakeSeatInput {
  readonly roomId: string;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface StartGameInput {
  readonly roomId: string;
  readonly targetMarks?: number;
}

export class MultiplayerRoomClient {
  constructor(private readonly graphql: GraphqlClient) {}

  async createRoom(input: CreateRoomInput): Promise<MultiplayerRoomView> {
    const data = await this.graphql.execute<{
      readonly createRoom: MultiplayerRoomView;
    }>({
      operationName: "CreateRoom",
      query: `
        mutation CreateRoom($input: CreateRoomInput!) {
          createRoom(input: $input) {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `,
      variables: {
        input
      }
    });

    return data.createRoom;
  }

  async joinRoom(input: JoinRoomInput): Promise<MultiplayerRoomView> {
    const data = await this.graphql.execute<{
      readonly joinRoom: MultiplayerRoomView;
    }>({
      operationName: "JoinRoom",
      query: `
        mutation JoinRoom($input: JoinRoomInput!) {
          joinRoom(input: $input) {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `,
      variables: {
        input
      }
    });

    return data.joinRoom;
  }

  async takeSeat(input: TakeSeatInput): Promise<MultiplayerRoomView> {
    const data = await this.graphql.execute<{
      readonly takeSeat: MultiplayerRoomView;
    }>({
      operationName: "TakeSeat",
      query: `
        mutation TakeSeat($input: TakeSeatInput!) {
          takeSeat(input: $input) {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `,
      variables: {
        input
      }
    });

    return data.takeSeat;
  }

  async startGame(input: StartGameInput): Promise<MultiplayerStartGameResult> {
    const data = await this.graphql.execute<{
      readonly startGame: MultiplayerStartGameResult;
    }>({
      operationName: "StartGame",
      query: `
        mutation StartGame($input: StartGameInput!) {
          startGame(input: $input) {
            room {
              ${ROOM_VIEW_SELECTION}
            }
            snapshot {
              ${PUBLIC_SNAPSHOT_SELECTION}
            }
          }
        }
      `,
      variables: {
        input: {
          roomId: input.roomId,
          ...(input.targetMarks !== undefined
            ? { targetMarks: input.targetMarks }
            : {})
        }
      }
    });

    return data.startGame;
  }
}

const ROOM_VIEW_SELECTION = `
  roomId
  roomCode
  status
  gameId
  createdAt
  updatedAt
  participantCount
  isHost
  viewerSeat
  participants {
    displayName
    connectionStatus
    joinedAt
    isViewer
  }
  seats {
    seatIndex
    occupied
    displayName
    isViewer
  }
`;

const PUBLIC_SNAPSHOT_SELECTION = `
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
`;
