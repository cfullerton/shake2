# AppSync API Design

## API Shape

Use GraphQL operations focused on actions and snapshots, not low-level CRUD.

## Mutations

```graphql
type Mutation {
  submitGameAction(input: SubmitGameActionInput!): SubmitGameActionResult!
  startNextHand(input: StartNextHandInput!): SubmitGameActionResult!
  createRoom(input: CreateRoomInput!): CreateRoomResult!
  joinRoom(input: JoinRoomInput!): JoinRoomResult!
}
```

`CreateRoomInput` includes a `visibility` enum so clients can create invite-only private rooms or discoverable public rooms.

`startNextHand` is a server-owned lifecycle mutation. It deals from the authoritative post-hand `setup` state, is host-only in the current API, returns the same safe public result shape as `submitGameAction`, and is included in the game-update subscription fan-out.

## Queries

```graphql
type Query {
  getRoom(roomId: ID!): RoomView
  getRoomByCode(roomCode: String!): RoomView
  listPublicRooms: [RoomView!]!
  getGameSnapshot(gameId: ID!): GameSnapshotView
  getMyPrivateHand(gameId: ID!): PrivateHandView
  listMyGames: [GameSummary!]!
}
```

`listPublicRooms` returns safe room views only: no Cognito subjects, raw player IDs, private hands, or trusted event payloads.

## Subscriptions

```graphql
type Subscription {
  onGameUpdated(gameId: ID!): SubmitGameActionResult
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
