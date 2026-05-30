# Backend Workspace

This workspace is the backend boundary for multiplayer Texas 42. It contains testable TypeScript resolver shells plus deployed Lambda entrypoints that are wired by the CDK stack in `infra/`; nothing is deployed automatically.

## Purpose

- Host future Lambda/AppSync resolver code separately from the mobile app and pure rules engine.
- Adapt AppSync-like resolver events into the existing server-authoritative multiplayer engine.
- Keep DynamoDB persistence behind an interface so resolver logic remains locally testable.
- Keep private hand records and public snapshot records separated by construction.

## Implemented

- `src/functions/submitGameAction/handler.ts`
  - Accepts an AppSync-like submit-game-action event.
  - Extracts an actor through the shared Cognito/mock identity boundary.
  - Parses and validates the Forty Two action envelope.
  - Restores a multiplayer session from store-provided records.
  - Calls the existing game-engine multiplayer validation path.
  - Builds accepted or rejected multiplayer write plans.
  - Converts those write plans into pure DynamoDB transaction intent shapes.
  - Delegates persistence to a `MultiplayerStore` interface.

- `src/functions/submitGameAction/lambda.ts`
  - Deployed Lambda entrypoint that wires `submitGameAction` to the DynamoDB store from environment variables.

- `src/functions/getGameSnapshot/handler.ts`
  - Accepts an AppSync-like query resolver event.
  - Requires an authenticated actor identity.
  - Loads only the latest public/redacted snapshot.
  - Returns an `AppSyncPublicGameSnapshot` without private hands or raw trusted events.

- `src/functions/getGameSnapshot/lambda.ts`
  - Deployed Lambda entrypoint for the AppSync `getGameSnapshot` query.

- `src/functions/getMyPrivateHand/handler.ts`
  - Accepts an AppSync-like private-hand query event.
  - Requires an authenticated actor identity.
  - Loads the requested seat private hand through `MultiplayerStore`.
  - Enforces that the authenticated actor owns the requested seat before returning dominoes.

- `src/functions/getMyPrivateHand/lambda.ts`
  - Deployed Lambda entrypoint for the AppSync `getMyPrivateHand` query.

- `src/functions/getReconnectView/handler.ts`
  - Accepts an AppSync-like reconnect query event.
  - Requires an authenticated actor identity.
  - Loads the latest public snapshot, the actor's private hand when seated, and requested pending action results.
  - Returns accepted/rejected/unknown pending action classifications and snapshot-refresh guidance.

- `src/functions/getReconnectView/lambda.ts`
  - Deployed Lambda entrypoint for the AppSync `getReconnectView` query.

- `src/functions/shared/deployed-runtime.ts`
  - Shared deployed-runtime wiring for DynamoDB store construction, resolver context, and engine context.

- `src/smoke/deployed-smoke.ts`
  - Loads CDK stack outputs.
  - Optionally creates/resets a temporary Cognito smoke user.
  - Authenticates through Cognito and calls the deployed AppSync API.
  - Verifies unauthenticated rejection, Cognito actor propagation, and invocation of each deployed resolver.

- `src/dynamodb/store.ts`
  - Defines `MultiplayerStore`.
  - Implements `DynamoDBMultiplayerStore` with AWS SDK v3 DynamoDB DocumentClient commands.
  - Supports loading full game records for command validation, loading public snapshots, loading private hand records, loading reconnect records, loading one idempotency result, and committing transaction intents.
  - Is unit-tested with a mocked client and does not require AWS credentials in tests.

- `src/appsync/schema.graphql`
  - Defines the AppSync GraphQL boundary used by the CDK API.
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
  - Defines the shared backend actor extraction boundary used by every resolver shell.
  - Supports production-shaped AppSync Cognito identity objects with top-level `sub` or `claims.sub`.
  - Maps Cognito `sub` to the stable multiplayer `playerId`.
  - Uses `claims.name`, username, or email as optional display metadata.
  - Preserves mock `playerId` identity support for local tests and development.

- `src/types/index.ts`
  - Defines backend-local request, response, actor, AppSync Cognito identity, resolver context, and error types.

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
  onGameUpdated(gameId: ID!): SubmitGameActionResult!
}
```

The subscription output intentionally matches the `submitGameAction` mutation result because AppSync mutation-backed subscriptions require a compatible output type. That result contains only safe event summaries and public/redacted snapshots. Private hand data is only represented through `getMyPrivateHand` and the reconnect player's own `privateHand` field after resolver-level ownership checks.

## Identity Model

Resolver shells call `extractBackendActor` from `src/auth/identity.ts`.

Supported identity sources:

- AppSync Cognito identity objects:
  - `identity.sub`
  - `identity.username`
  - `identity.claims.sub`
  - `identity.claims["cognito:username"]`
  - `identity.claims.email`
  - `identity.claims.name`
- Mock resolver identities for tests and local development:
  - `identity.playerId`
  - optional `identity.displayName`, `identity.username`, or `identity.email`

Cognito `sub` is authoritative and becomes `BackendActor.playerId`, which is the multiplayer player ID used for action authorization and private-hand ownership checks. If a request includes both Cognito `sub` and a client-controlled `playerId`, the `playerId` is ignored.

## Intentionally Not Implemented

- No automatically deployed AWS resources.
- CDK infrastructure exists in `infra/` and synthesizes a deployable development stack.
- No Amplify backend configuration.
- No live subscription fanout beyond the schema-level AppSync subscription shape.
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

Deployed smoke-test configuration:

```text
SHAKE2_SMOKE_STACK_NAME
SHAKE2_SMOKE_EMAIL
SHAKE2_SMOKE_USERNAME
SHAKE2_SMOKE_PASSWORD
SHAKE2_SMOKE_CREATE_USER
SHAKE2_SMOKE_GAME_ID
```

The deployed smoke runner automatically loads `backend/.env` when present, then lets explicit shell environment variables override those values. Keep real `.env` files local only.

The room game ID index must allow lookup of room metadata by `gameId`. Tests inject a mocked DynamoDB DocumentClient, so no AWS credentials are needed for local verification.

## Test Commands

From the repository root:

```text
npm run test -w @shake2/backend
npm run typecheck -w @shake2/backend
npm run smoke:deployed -w @shake2/backend
npm run synth -w @shake2/infra
```

The root workspace test command also includes this package once dependencies are installed:

```text
npm test
```

## Next Steps

1. Map DynamoDB transaction cancellation reasons back to stable backend/game-engine error codes.
2. Add resolver-level room membership authorization for public snapshot reads before deployment.
3. Deploy a disposable development stack from `infra/` and smoke test real AppSync/Cognito Lambda events.
4. Add frontend multiplayer configuration and session UI behind a feature flag.
5. Add production hardening: rate limits, alarms, log review, and retention policies.
