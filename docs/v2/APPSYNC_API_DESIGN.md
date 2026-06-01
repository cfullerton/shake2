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
  addBot(input: AddBotInput!): RoomView!
}
```

`CreateRoomInput` includes a `visibility` enum so clients can create invite-only private rooms or discoverable public rooms.

`addBot` is a host-only lobby mutation for filling empty seats before start. The response uses safe room fields with `isBot` flags; raw bot player IDs are not part of room views.

`StartGameInput` includes `targetMarks` and a sanitized `noTrump` boolean. The backend turns those fields into engine-owned rules so clients can opt into supported variants without submitting arbitrary `RuleConfig` payloads.

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
  snapshot?: PublicGameSnapshot;
};
```

`PublicGameSnapshot.lastCompletedHand` is optional public metadata populated after a hand completes. It includes bid amount, declarer, bidding team, team point totals, trick counts, mark awards, and outcome, but not completed tricks, played dominoes, raw hands, or viewer hands. This keeps post-hand and game-over UI renderable from AppSync reads/subscriptions without exposing hidden information.
