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
  - Verifies room membership through the DynamoDB store before returning the latest public/redacted snapshot.
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

- `src/functions/rooms/handler.ts`
  - Accepts AppSync-like `createRoom`, `joinRoom`, `takeSeat`, `startGame`, `startNextHand`, `getRoom`, `getRoomByCode`, and `listPublicRooms` events.
  - Uses Cognito/mock identity as the authoritative room actor.
  - Generates short, non-sensitive uppercase room invite codes and normalizes pasted join/look-up codes before store access.
  - Supports private rooms by invite code and public rooms through a dedicated open-room list query.
  - Delegates room creation, joining, seating, and host-only game-start rules to the shared multiplayer engine.
  - Persists room metadata through conditional DynamoDB store methods.
  - Commits game-start write plans through the same DynamoDB transaction path used by gameplay actions.
  - Commits host-triggered next-hand deal write plans from completed-hand setup states and returns `SubmitGameActionResult`-shaped public updates for subscriptions.
  - Returns safe room views without raw Cognito/player IDs.

- `src/functions/createRoom`, `src/functions/joinRoom`, `src/functions/takeSeat`, `src/functions/startGame`, `src/functions/startNextHand`, `src/functions/getRoom`, `src/functions/getRoomByCode`, and `src/functions/listPublicRooms`
  - Deployed Lambda entrypoints for the room lifecycle AppSync fields.

- `src/smoke/deployed-smoke.ts`
  - Loads CDK stack outputs.
  - Optionally creates/resets a temporary Cognito smoke user.
  - Authenticates through Cognito and calls the deployed AppSync API.
  - Verifies unauthenticated rejection, Cognito actor propagation, and invocation of current gameplay/read resolvers.
  - In seeded mode, can authenticate a second Cognito smoke user and verify non-members cannot read public snapshots or private hands.
  - In seeded subscription mode, opens an AppSync realtime subscription before submitting the legal smoke action and verifies `onGameUpdated` receives a public/redacted accepted-action payload.

- `src/dynamodb/store.ts`
  - Defines `MultiplayerStore`.
  - Implements `DynamoDBMultiplayerStore` with AWS SDK v3 DynamoDB DocumentClient commands.
  - Supports creating, loading, and conditionally updating room records; loading rooms by normalized invite code; listing public waiting/ready rooms; loading full game records for command validation; loading public snapshots, private hand records, reconnect records, and one idempotency result; and committing transaction intents.
  - Maps DynamoDB transaction cancellation reasons back to stable backend/game-engine error codes for duplicate action, stale action, and persistence conflicts.
  - Is unit-tested with a mocked client and does not require AWS credentials in tests.

- `src/appsync/schema.graphql`
  - Defines the AppSync GraphQL boundary used by the CDK API.
  - Defines room lifecycle, start-game, next-hand, `submitGameAction`, public snapshot, private hand, reconnect, and game-update subscription operations.
  - Uses `AWSJSON` for submit-action envelopes; deployed GraphQL clients should send the action as a JSON-encoded string, while local resolver tests may still pass already-parsed objects.
  - Separates public/redacted snapshots from private hand responses.
  - Uses safe event summaries and subscription notifications instead of raw trusted event payloads.

- `src/appsync/contracts.ts`
  - Maps AppSync submit-action inputs to the existing submit-game-action handler event shape.
  - Maps handler responses to GraphQL-safe accepted/rejected result shapes.
  - Defines room and start-game result shapes that keep private hands out of public mutation responses.
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
  createRoom(input: CreateRoomInput!): RoomView!
  joinRoom(input: JoinRoomInput!): RoomView!
  takeSeat(input: TakeSeatInput!): RoomView!
  addBot(input: AddBotInput!): RoomView!
  startGame(input: StartGameInput!): StartGameResult!
  startNextHand(input: StartNextHandInput!): SubmitGameActionResult!
  submitGameAction(input: SubmitGameActionInput!): SubmitGameActionResult!
}

type Query {
  getRoom(roomId: ID!): RoomView!
  getRoomByCode(roomCode: String!): RoomView!
  listPublicRooms: [RoomView!]!
  getGameSnapshot(gameId: ID!): PublicGameSnapshot!
  getMyPrivateHand(input: GetMyPrivateHandInput!): PrivateHandResponse!
  getReconnectView(input: GetReconnectViewInput!): ReconnectView!
}

type Subscription {
  onGameUpdated(gameId: ID!): SubmitGameActionResult
}
```

`StartGameInput` accepts `targetMarks` plus sanitized `noTrump` and `markBids` booleans. The resolver maps those into engine-owned `RuleConfig`; clients do not submit arbitrary rule objects.

The subscription output intentionally matches the `submitGameAction` mutation result because AppSync mutation-backed subscriptions require a compatible output type. The subscription field itself is nullable so AppSync can represent filtered or missing published payloads without turning that condition into a top-level non-null GraphQL protocol error; smoke validation still requires a non-null accepted-action payload. That result contains only safe event summaries and public/redacted snapshots. Private hand data is only represented through `getMyPrivateHand` and the reconnect player's own `privateHand` field after resolver-level ownership checks.

`addBot` is host-only and only valid before a room starts. It fills an empty seat with a server-owned legal-random bot participant, returns the same safe `RoomView` shape as human seating, and exposes bot state as booleans instead of raw bot IDs. Once a game is active, start-game, next-hand, and accepted human-action resolvers advance bot turns on the backend before committing the write plan.

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
- No mobile subscription client or subscription gap-recovery loop.
- No game-rule changes.

## Configuration

The DynamoDB store keeps all environment and resource names injected. It does not hardcode AWS accounts, regions, credentials, or table names.

Required when constructing from environment:

```text
SHAKE2_MULTIPLAYER_TABLE_NAME
SHAKE2_ROOM_GAME_ID_INDEX_NAME
```

Optional defaults used by the development stack:

```text
AWS_REGION
SHAKE2_PUBLIC_ROOMS_INDEX_NAME
SHAKE2_ROOM_CODE_INDEX_NAME
```

Deployed smoke-test configuration:

```text
SHAKE2_SMOKE_STACK_NAME
SHAKE2_SMOKE_EMAIL
SHAKE2_SMOKE_USERNAME
SHAKE2_SMOKE_PASSWORD
SHAKE2_SMOKE_CREATE_USER
SHAKE2_SMOKE_GAME_ID
SHAKE2_SMOKE_SEED_GAME
SHAKE2_SMOKE_SEEDED_GAME_ID
SHAKE2_SMOKE_SECONDARY_EMAIL
SHAKE2_SMOKE_SECONDARY_USERNAME
SHAKE2_SMOKE_SECONDARY_PASSWORD
SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION
```

The deployed smoke runner automatically loads `backend/.env` when present, then lets explicit shell environment variables override those values. Keep real `.env` files local only.

Set `SHAKE2_SMOKE_SEED_GAME=true` to run the extended smoke path. That path writes a disposable room/game into DynamoDB through the engine storage records, submits one legal bid through AppSync, verifies duplicate action idempotency, checks public/private hand separation, and verifies reconnect pending-action classification. If `SHAKE2_SMOKE_CREATE_USER=true`, the runner also creates/resets a derived secondary user by default and verifies that authenticated non-members cannot read the seeded public snapshot or private hand. You can provide the `SHAKE2_SMOKE_SECONDARY_*` values to use an existing second user or override the derived one. If `SHAKE2_SMOKE_SEEDED_GAME_ID` is omitted, the runner generates a unique smoke game ID.

Set `SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION=true` with `SHAKE2_SMOKE_SEED_GAME=true` to validate live AppSync delivery. In that mode the runner establishes `onGameUpdated(gameId)`, waits for `start_ack`, submits the seeded legal action over HTTPS, and verifies the WebSocket data message contains the accepted action, root `gameId`, safe event summaries, and a redacted public snapshot.

The room code index must allow lookup of room metadata by `roomCode`, the public rooms index must list open public rooms by `publicRoomListKey`, and the room game ID index must allow lookup by `gameId`. Newly created room codes are six-character uppercase invite codes generated separately from room IDs and actor IDs. Join and lookup handlers normalize case, spaces, and hyphens before querying. Tests inject a mocked DynamoDB DocumentClient, so no AWS credentials are needed for local verification.

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

1. Add deployed smoke coverage for create/join/take-seat/start room flows.
2. Add DynamoDB Local or equivalent integration tests for conditional transaction failures and retry behavior.
3. Run the subscription smoke mode against the current dev stack and add client-side sequence-gap recovery.
4. Add frontend multiplayer configuration and session UI behind a feature flag.
