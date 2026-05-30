# AppSync API Design

## API Shape

Use GraphQL operations focused on actions and snapshots, not low-level CRUD.

## Mutations

```graphql
type Mutation {
  submitGameAction(input: SubmitGameActionInput!): SubmitGameActionResult!
  createRoom(input: CreateRoomInput!): CreateRoomResult!
  joinRoom(input: JoinRoomInput!): JoinRoomResult!
}
```

## Queries

```graphql
type Query {
  getRoom(roomId: ID!): RoomView
  getRoomByCode(roomCode: String!): RoomView
  getGameSnapshot(gameId: ID!): GameSnapshotView
  getMyPrivateHand(gameId: ID!): PrivateHandView
  listMyGames: [GameSummary!]!
}
```

## Subscriptions

```graphql
type Subscription {
  onGameEvent(gameId: ID!): GameEventView
  onRoomUpdated(roomId: ID!): RoomView
}
```

## Important Subscription Rule

Do not rely on subscription delivery as the only source of truth. Mobile clients can miss events due to backgrounding, network loss, phone calls, or process suspension. Every client must be able to fetch latest snapshot.

## Submit Action Result

```ts
type SubmitGameActionResult = {
  accepted: boolean;
  errorCode?: string;
  events?: GameEventEnvelope[];
  snapshot?: GameSnapshotEnvelope;
};
```
