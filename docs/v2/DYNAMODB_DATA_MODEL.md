# DynamoDB Data Model

## Design Goals

Efficient room lookup, event append, snapshot fetch, idempotent retry, private hand protection, and minimal relational joins.

## Room

```ts
type RoomRecord = {
  pk: `ROOM#${string}`;
  sk: "META";
  roomId: string;
  roomCode: string;
  hostUserId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: number;
};
```

## Game Event

```ts
type GameEventRecord = {
  pk: `GAME#${string}`;
  sk: `EVENT#${number}`;
  eventId: string;
  gameId: string;
  sequence: number;
  actorId: string;
  actionId?: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
};
```

## Snapshot

```ts
type GameSnapshotRecord = {
  pk: `GAME#${string}`;
  sk: "SNAPSHOT#LATEST";
  gameId: string;
  snapshotVersion: number;
  lastEventSequence: number;
  payload: unknown;
  updatedAt: string;
};
```

## Private Hands

Store private player hands separately from public snapshots.

```ts
type PlayerHandRecord = {
  pk: `GAME#${string}`;
  sk: `PRIVATE_HAND#${seatIndex}`;
  gameId: string;
  seatIndex: number;
  userId: string;
  hand: Domino[];
  handNumber: number;
  updatedAt: string;
};
```

## Idempotency

```ts
type ActionIdempotencyRecord = {
  pk: `ACTION#${actionId}`;
  sk: "RESULT";
  actionId: string;
  gameId: string;
  actorId: string;
  accepted: boolean;
  eventIds: string[];
  errorCode?: string;
  expiresAt: number;
};
```
