# Backend Workspace

This workspace is the first backend boundary for multiplayer Texas 42. It is intentionally a testable TypeScript shell, not a deployed AWS backend.

## Purpose

- Host future Lambda/AppSync resolver code separately from the mobile app and pure rules engine.
- Adapt AppSync-like resolver events into the existing server-authoritative multiplayer engine.
- Keep persistence behind an interface until DynamoDB/AppSync/Cognito are introduced for real.
- Keep private hand records and public snapshot records separated by construction.

## Implemented

- `src/functions/submitGameAction/handler.ts`
  - Accepts an AppSync-like submit-game-action event.
  - Extracts an auth-neutral mocked actor identity.
  - Parses and validates the Forty Two action envelope.
  - Restores a multiplayer session from store-provided records.
  - Calls the existing game-engine multiplayer validation path.
  - Builds accepted or rejected multiplayer write plans.
  - Converts those write plans into pure DynamoDB transaction intent shapes.
  - Delegates persistence to a `MultiplayerStore` interface.

- `src/functions/getGameSnapshot/handler.ts`
  - Accepts an AppSync-like query resolver event.
  - Requires an authenticated actor identity.
  - Loads only the latest public/redacted snapshot.
  - Returns an `AppSyncPublicGameSnapshot` without private hands or raw trusted events.

- `src/functions/getMyPrivateHand/handler.ts`
  - Accepts an AppSync-like private-hand query event.
  - Requires an authenticated actor identity.
  - Loads the requested seat private hand through `MultiplayerStore`.
  - Enforces that the authenticated actor owns the requested seat before returning dominoes.

- `src/functions/getReconnectView/handler.ts`
  - Accepts an AppSync-like reconnect query event.
  - Requires an authenticated actor identity.
  - Loads the latest public snapshot, the actor's private hand when seated, and requested pending action results.
  - Returns accepted/rejected/unknown pending action classifications and snapshot-refresh guidance.

- `src/dynamodb/store.ts`
  - Defines `MultiplayerStore`.
  - Implements `DynamoDBMultiplayerStore` with AWS SDK v3 DynamoDB DocumentClient commands.
  - Supports loading full game records for command validation, loading public snapshots, loading private hand records, loading reconnect records, loading one idempotency result, and committing transaction intents.
  - Is unit-tested with a mocked client and does not require AWS credentials in tests.

- `src/appsync/schema.graphql`
  - Drafts the proposed AppSync GraphQL boundary.
  - Defines `submitGameAction`, public snapshot, private hand, reconnect, and game-update subscription operations.
  - Separates public/redacted snapshots from private hand responses.
  - Uses safe event summaries and subscription notifications instead of raw trusted event payloads.

- `src/appsync/contracts.ts`
  - Maps AppSync submit-action inputs to the existing submit-game-action handler event shape.
  - Maps handler responses to GraphQL-safe accepted/rejected result shapes.
  - Maps reconnect inputs to the engine client-sync state shape.
  - Defines the private-hand store boundary with an explicit seat-ownership check.
  - Is covered by local contract tests that do not require AWS credentials.

- `src/auth/identity.ts`
  - Defines a simple mocked identity extraction boundary.

- `src/types/index.ts`
  - Defines backend-local request, response, actor, resolver context, and error types.

## Proposed GraphQL Operations

Drafted in `src/appsync/schema.graphql`:

```graphql
type Mutation {
  submitGameAction(input: SubmitGameActionInput!): SubmitGameActionResult!
}

type Query {
  getGameSnapshot(gameId: ID!): PublicGameSnapshot!
  getMyPrivateHand(input: GetMyPrivateHandInput!): PrivateHandResponse!
  getReconnectView(input: GetReconnectViewInput!): ReconnectView!
}

type Subscription {
  onGameUpdated(gameId: ID!): GameUpdatedNotification!
}
```

The public snapshot and subscription types intentionally omit full hands and raw event payloads. Private hand data is only represented through `getMyPrivateHand` and the reconnect player's own `privateHand` field after resolver-level ownership checks.

## Intentionally Not Implemented

- No deployed AWS resources.
- No deployed public AppSync API.
- No Cognito user pool or authorizer.
- No Amplify backend configuration.
- No provisioned DynamoDB table.
- No production Lambda environment wiring.
- No live subscription fanout.
- No deployed query resolvers.
- No frontend multiplayer UI.
- No game-rule changes.

## Configuration

The DynamoDB store keeps all environment and resource names injected. It does not hardcode AWS accounts, regions, credentials, or table names.

Required when constructing from environment:

```text
SHAKE2_MULTIPLAYER_TABLE_NAME
SHAKE2_ROOM_GAME_ID_INDEX_NAME
```

Optional:

```text
AWS_REGION
```

The room game ID index must allow lookup of room metadata by `gameId`. Tests inject a mocked DynamoDB DocumentClient, so no AWS credentials are needed for local verification.

## Test Commands

From the repository root:

```text
npm run test -w @shake2/backend
npm run typecheck -w @shake2/backend
```

The root workspace test command also includes this package once dependencies are installed:

```text
npm test
```

## Next Steps

1. Map DynamoDB transaction cancellation reasons back to stable backend/game-engine error codes.
2. Add Cognito identity mapping from authenticated user IDs to multiplayer `playerId`.
3. Add resolver-level room membership authorization for public snapshot reads before deployment.
4. Add Amplify/AppSync infrastructure only after resolver contracts and auth checks are tested locally.
5. Provision the DynamoDB table and indexes with infrastructure code after the API/auth boundary is ready.
