# Multiplayer State Machine

## Room Lifecycle

```text
CREATED -> WAITING_FOR_PLAYERS -> READY -> IN_GAME -> COMPLETED -> ARCHIVED
```

## Game Phases

```text
SETUP
DEALING
BIDDING
CALLING_TRUMP
PLAYING_TRICK
SCORING_HAND
HAND_COMPLETE
GAME_COMPLETE
```

## Room State

```ts
type RoomState = {
  roomId: string;
  roomCode: string;
  hostUserId: string;
  status: "created" | "waiting" | "ready" | "inGame" | "completed" | "archived";
  seats: SeatAssignment[];
  spectators: Spectator[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};
```

## Seat Assignment

- Four player seats.
- Seat 0 partners with seat 2.
- Seat 1 partners with seat 3.
- Host can optionally assign seats.
- Empty seats can be filled by invite, room code, or bot.

## Phase Transitions

- Setup to dealing requires four occupied seats and valid rules.
- Dealing to bidding requires server-generated hands.
- Bidding to calling trump requires completed bidding and declarer selection.
- Calling trump to playing requires valid trump/contract.
- Playing trick to scoring hand requires seven completed tricks.
- Scoring hand to hand complete requires point and mark calculation.
- Hand complete to game complete requires a team reaching target marks.
- Otherwise rotate dealer and deal again.

## Connection State

Connection state is room metadata, not game truth.

```ts
type PlayerConnection = {
  userId: string;
  connectionStatus: "online" | "backgrounded" | "disconnected";
  lastSeenAt: string;
};
```

## Disconnect Behavior

Casual multiplayer v1 should allow reconnect without immediate penalty. Show disconnected status and allow host replacement with bot after a configurable timeout.
