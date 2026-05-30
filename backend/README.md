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

- `src/dynamodb/store.ts`
  - Defines `MultiplayerStore`.
  - Implements `DynamoDBMultiplayerStore` with AWS SDK v3 DynamoDB DocumentClient commands.
  - Supports loading game records, loading one idempotency result, and committing transaction intents.
  - Is unit-tested with a mocked client and does not require AWS credentials in tests.

- `src/auth/identity.ts`
  - Defines a simple mocked identity extraction boundary.

- `src/types/index.ts`
  - Defines backend-local request, response, actor, resolver context, and error types.

## Intentionally Not Implemented

- No deployed AWS resources.
- No public AppSync schema or API.
- No Cognito user pool or authorizer.
- No provisioned DynamoDB table.
- No production Lambda environment wiring.
- No subscriptions.
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
2. Add an AppSync schema draft for `submitGameAction`, room queries, snapshot queries, and room/game subscriptions.
3. Add Cognito identity mapping from authenticated user IDs to multiplayer `playerId`.
4. Add reconnect/query resolver shells that return redacted player views and pending-action status.
5. Provision the DynamoDB table and indexes with infrastructure code after the API/auth boundary is ready.
