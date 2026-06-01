import type { GraphqlClient } from "./graphql";
import type {
  AppSyncSeatIndex,
  MultiplayerPublicGameSnapshotPayload,
  MultiplayerRoomView,
  MultiplayerRoomVisibility,
  MultiplayerStartGameResult
} from "./types";
import { normalizeMultiplayerPublicGameSnapshot } from "./snapshots";

export interface CreateRoomInput {
  readonly displayName: string;
  readonly visibility?: MultiplayerRoomVisibility;
}

export interface JoinRoomInput {
  readonly displayName: string;
  readonly roomCode: string;
}

export interface TakeSeatInput {
  readonly roomId: string;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface AddBotInput {
  readonly displayName?: string;
  readonly roomId: string;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface StartGameInput {
  readonly markBids?: boolean;
  readonly noTrump?: boolean;
  readonly roomId: string;
  readonly targetMarks?: number;
}

export interface GetRoomInput {
  readonly roomId: string;
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

  async getRoom(input: GetRoomInput): Promise<MultiplayerRoomView> {
    const data = await this.graphql.execute<{
      readonly getRoom: MultiplayerRoomView;
    }>({
      operationName: "GetRoom",
      query: `
        query GetRoom($roomId: ID!) {
          getRoom(roomId: $roomId) {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `,
      variables: {
        roomId: input.roomId
      }
    });

    return data.getRoom;
  }

  async listPublicRooms(): Promise<readonly MultiplayerRoomView[]> {
    const data = await this.graphql.execute<{
      readonly listPublicRooms: readonly MultiplayerRoomView[];
    }>({
      operationName: "ListPublicRooms",
      query: `
        query ListPublicRooms {
          listPublicRooms {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `
    });

    return data.listPublicRooms;
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

  async addBot(input: AddBotInput): Promise<MultiplayerRoomView> {
    const data = await this.graphql.execute<{
      readonly addBot: MultiplayerRoomView;
    }>({
      operationName: "AddBot",
      query: `
        mutation AddBot($input: AddBotInput!) {
          addBot(input: $input) {
            ${ROOM_VIEW_SELECTION}
          }
        }
      `,
      variables: {
        input
      }
    });

    return data.addBot;
  }

  async startGame(input: StartGameInput): Promise<MultiplayerStartGameResult> {
    const data = await this.graphql.execute<{
      readonly startGame: MultiplayerStartGameResultPayload;
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
          ...(input.markBids !== undefined ? { markBids: input.markBids } : {}),
          ...(input.noTrump !== undefined ? { noTrump: input.noTrump } : {}),
          roomId: input.roomId,
          ...(input.targetMarks !== undefined
            ? { targetMarks: input.targetMarks }
            : {})
        }
      }
    });

    return {
      ...data.startGame,
      snapshot: normalizeMultiplayerPublicGameSnapshot(data.startGame.snapshot)
    };
  }
}

type MultiplayerStartGameResultPayload =
  Omit<MultiplayerStartGameResult, "snapshot"> & {
    readonly snapshot: MultiplayerPublicGameSnapshotPayload;
  };

const ROOM_VIEW_SELECTION = `
  roomId
  roomCode
  status
  visibility
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
    isBot
    isViewer
  }
  seats {
    seatIndex
    occupied
    displayName
    isBot
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
  lastCompletedHand {
    awardedTeamId
    bidAmount
    bidLabel
    bidMarks
    biddingTeamId
    biddingTeamPoints
    completedAt
    declarer
    handNumber
    markAwards {
      teamA
      teamB
    }
    outcome
    teamPoints {
      teamA
      teamB
    }
    teamTrickCounts {
      teamA
      teamB
    }
    totalPoints
  }
  redactedState
`;
