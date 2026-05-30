# Multiplayer Readiness Report

Last reviewed: 2026-05-30

## Executive Summary

Multiplayer now has a deployable development infrastructure definition, but it is still not ready for production or mobile users.

The strongest part of the system is now the pure TypeScript authority boundary in `packages/game-engine`. It can create rooms, start a multiplayer-mode game, validate player actions, protect idempotency, redact player views, serialize durable records, parse boundary payloads, validate accepted event replay, and produce backend-neutral write plans for future conditional persistence.

The first DynamoDB adapter contract slice converts backend-neutral multiplayer write plans into deterministic DynamoDB-style transaction intent shapes. A backend workspace, testable Lambda resolver shells, production-shaped Cognito identity parser, mocked-testable AWS SDK DynamoDB store implementation, and AppSync schema/contract adapter now exist. A CDK v2 infrastructure workspace now synthesizes Cognito, DynamoDB, AppSync, Lambda, and IAM for a development environment. A deployed-stack smoke harness now exists for Cognito/AppSync/Lambda checks once a dev stack is deployed. The largest remaining gap is proving it in a real AWS account: no stack has been deployed, no live smoke run has completed, no live subscription flow has been validated, and no multiplayer UI exists yet.

## Current Multiplayer Architecture

Current multiplayer code is backend-neutral and lives under `packages/game-engine/src/multiplayer`.

- `session.ts`: room membership, seat ownership, host-only start, server-managed initial game/deal, player action submission, idempotency, automation for bidding completion, redacted player views.
- `storage.ts`: durable record shapes for room metadata, trusted event records, public snapshots, private hands, and action results; restore/reconnect helpers.
- `schema.ts`: runtime parsers for action envelopes, storage records, public snapshots, private hands, idempotency records, and client reconnect state.
- `write-plan.ts`: backend-neutral persistence write intentions for game start, accepted actions, and rejected actions.
- `dynamodb-adapter.ts`: pure DynamoDB transaction-intent conversion for write plans, with conditional-write expressions for room state, snapshot version, event append, and action idempotency conflicts.

Backend shell code now lives under `backend`.

- `src/functions/submitGameAction/handler.ts`: AppSync-like Lambda resolver shell for submit-game-action requests.
- `src/functions/getGameSnapshot/handler.ts`: AppSync-like query resolver shell that returns only public/redacted game snapshots.
- `src/functions/getMyPrivateHand/handler.ts`: AppSync-like query resolver shell that enforces private-hand seat ownership before returning dominoes.
- `src/functions/getReconnectView/handler.ts`: AppSync-like query resolver shell that returns latest public state, actor private hand when seated, and accepted/rejected/unknown pending action status.
- `src/dynamodb/store.ts`: `MultiplayerStore` interface plus AWS SDK v3 `DynamoDBMultiplayerStore` for loading stored game records, public snapshots, private hands, reconnect records, idempotency results, and committing write plans.
- `src/appsync/schema.graphql`: undeployed draft schema for submit action, public snapshot, private hand, reconnect, and game-update subscription operations.
- `src/appsync/contracts.ts`: local AppSync contract adapters for safe submit-action results, reconnect views, private-hand ownership boundaries, and public update notifications.
- `src/auth/identity.ts`: shared actor extraction boundary that prefers AppSync Cognito `sub` as the stable multiplayer `playerId` and preserves mock identity support for tests.
- `src/smoke/deployed-smoke.ts`: deployed-stack smoke harness that loads CloudFormation outputs, authenticates a Cognito smoke user, verifies unauthenticated rejection, confirms Cognito actor propagation, and invokes all current AppSync resolvers.
- `src/types/index.ts`: backend-local request, response, actor, AppSync Cognito identity, resolver-context, and error types.

Infrastructure code now lives under `infra`.

- `config/multiplayer-config.ts`: stage-aware resource naming, removal policy, and index-name configuration.
- `constructs/multiplayer-auth.ts`: Cognito User Pool and native-app-shaped app client.
- `constructs/multiplayer-data.ts`: DynamoDB table with room/game/action record access patterns, TTL, point-in-time recovery, and GSIs.
- `constructs/multiplayer-lambdas.ts`: Lambda functions for submit action and read-side query resolvers, with table configuration injected by environment.
- `constructs/multiplayer-appsync.ts`: AppSync API, schema deployment wiring, Lambda data sources, and resolver definitions.
- `stacks/multiplayer-infrastructure-stack.ts`: development stack that wires auth, data, Lambda, AppSync, IAM, and CloudFormation outputs.

Current authority model:

- Client state is not trusted.
- Server owns game truth.
- Clients request joins, seats, bids, trump calls, and domino plays.
- Server-managed transitions create/deal/complete bidding/complete trick/complete hand/complete game.
- Public snapshots omit full hands.
- Private hands are split into seat-specific records.
- Accepted events are validated before restore and before write planning.

## Remaining Blockers

Production multiplayer blockers:

1. Authentication and identity mapping
   - A production-shaped AppSync Cognito parser now maps authenticated `sub` values to backend `playerId`.
   - CDK now defines Cognito resources and AppSync user-pool authorization.
   - A smoke script can validate real sign-in and AppSync identity payloads after deployment.
   - Need deployed Cognito resources and a live smoke-test result.
   - Need guest/anonymous account decision.

2. Physical persistence adapter
   - DynamoDB transaction intent shapes now exist and are tested.
   - A Lambda-style resolver shell can delegate transaction intents to `MultiplayerStore` mocks.
   - An AWS SDK v3 DynamoDB store implementation exists behind the interface and is tested with mocked clients.
   - CDK now defines a DynamoDB table, Lambda functions, and IAM grants.
   - No DynamoDB table or Lambda has been deployed yet.
   - Need physical adapter tests for AWS error mapping, transaction cancellation reasons, partial failures, and retry handling against a local or integration test environment.

3. AppSync or realtime transport
   - A GraphQL schema, local contract tests, and CDK AppSync/Lambda resolver wiring now exist.
   - A deployed smoke script is available for the mutation and query resolvers.
   - No deployed AppSync API, live resolver run, or subscription delivery has been validated.
   - No subscription gap detection is wired into the app.
   - No deployed reconnect query exists, though the local resolver shell and CDK resolver definition exist.

4. Hidden-information enforcement
   - Engine redaction exists, and query resolver tests enforce public/private separation.
   - CDK prevents direct client table access by routing through Lambda/AppSync, but resolver-level room membership checks are still incomplete.
   - Trusted event records may contain private hands and must remain server-only.
   - Public subscriptions must never publish raw hand-dealt events.

5. Mobile multiplayer UI
   - No room creation/join screens.
   - No multiplayer active-game screen.
   - No reconnect/offline/pending-action UX.

6. Lifecycle and abuse handling
   - No leave/rejoin/replacement flow.
   - No room expiry/archive job.
   - No rate limits or invite-code abuse controls.

7. Migration/versioning
   - Runtime parsers reject unsupported versions, but no migration path exists.
   - Physical adapter payload compatibility is untested.

## Recommended AWS Topology

Recommended v1 topology:

```text
Expo app
  -> Cognito user/session
  -> AppSync GraphQL API
      -> Lambda resolvers for authority-sensitive mutations
          -> game-engine multiplayer session/schema/write-plan modules
          -> DynamoDB transactional writes
      -> DynamoDB direct resolvers only for safe read models
  -> AppSync subscriptions for room/game notifications
  -> CloudWatch logs/metrics
```

Core AWS components:

- Cognito User Pool: authenticated user identity.
- AppSync: GraphQL API, subscriptions, mobile-friendly reconnect surface.
- Lambda resolvers: action validation, session restore, write-plan translation, authorization.
- DynamoDB: room metadata, event records, latest public snapshots, private hand records, idempotency records.
- CloudWatch: structured logs and alarms.
- EventBridge scheduled job or Lambda cron: room expiry/archive cleanup.

Recommended DynamoDB layout should follow current backend-neutral records:

- `ROOM#<roomId> / META`
- `GAME#<gameId> / EVENT#<sequence>`
- `GAME#<gameId> / SNAPSHOT#LATEST`
- `GAME#<gameId> / PRIVATE_HAND#<seatIndex>`
- `ACTION#<actionId> / RESULT`

Recommended indexes:

- Room code lookup: `roomCode -> roomId`.
- Player rooms: `playerId -> active room/game summaries`.
- Expiry/archive scan: `expiresAt`.

## AppSync vs Alternatives

Recommended default: AppSync for v1 multiplayer.

Why AppSync fits:

- Good Cognito integration.
- Built-in GraphQL subscriptions.
- Mobile clients can query snapshots and subscribe to updates with one API model.
- Amplify Gen 2 aligns with the original tech-stack ADR.
- Server authority can stay inside Lambda resolvers that call the existing engine.

AppSync risks:

- Subscriptions are not guaranteed delivery. Clients still need reconnect/snapshot refresh.
- Fine-grained hidden-hand authorization is easy to get wrong if raw event records are exposed.
- Complex conditional transactions still belong in Lambda, not simple direct resolvers.
- Resolver sprawl can become hard to test unless logic stays in shared TypeScript modules.

Viable alternatives:

- API Gateway WebSocket + Lambda
  - More control over realtime delivery and connection state.
  - More infrastructure and client complexity.
  - Better if AppSync subscription filtering becomes limiting.

- API Gateway HTTP/REST + polling
  - Simpler backend.
  - Poorer gameplay experience.
  - Acceptable only as a fallback or early internal test path.

- Custom WebSocket service on ECS/Fargate
  - Maximum control.
  - Too much operations burden for current stage.

- Firebase/Supabase
  - Faster hosted realtime in some cases.
  - Conflicts with the AWS/Amplify direction already chosen.

Recommendation: start with AppSync plus Lambda resolvers. Keep the engine/backend adapter portable enough that a WebSocket transport can replace AppSync subscriptions later if needed.

## Reconnect Strategy

Reconnect must treat subscriptions as hints, not truth.

Target flow:

1. Client stores `gameId`, `lastAppliedEventSequence`, `snapshotVersion`, and pending action IDs.
2. On resume or subscription gap, client calls reconnect query.
3. Backend restores authoritative session from records.
4. Backend returns latest redacted player view.
5. Backend classifies pending actions as accepted, rejected, or unknown.
6. Client replaces local view with authoritative snapshot.
7. Client clears accepted/rejected pending actions.
8. Client retries safe unknown pending actions by original `actionId`.
9. Client resumes subscriptions from the latest sequence.

Already implemented in engine:

- `MultiplayerClientSyncState`
- `getMultiplayerReconnectView`
- accepted/rejected/unknown pending action classification
- redacted player snapshot views
- restore with validated replay and snapshot comparison

Backend contract drafted:

- AppSync `getReconnectView` query shape exists in `backend/src/appsync/schema.graphql`.
- Local mapper from query input to `MultiplayerClientSyncState` exists.
- Local mapper from engine reconnect view to a GraphQL-safe response exists.
- Local resolver shell now loads reconnect records through `MultiplayerStore` and classifies accepted/rejected/unknown pending actions without exposing raw trusted events.

Still needed:

- Deployed AppSync query for reconnect.
- Client-side pending action queue.
- Event gap detection in mobile session state.
- UX for reconnecting/offline/pending/rejected actions.

## Hidden-Information Security Model

The most important multiplayer security invariant is: no player can see another player’s hand.

Current protections:

- Public snapshots omit `hands`.
- Public snapshots expose hand counts only.
- Player views include only the viewer’s own hand.
- Private hands are separated into seat-specific records.
- Runtime parsers reject public snapshots containing private hands.

Required backend rules:

- Raw authoritative snapshots are server-only.
- Raw trusted events are server-only, especially `fortyTwo.hand.dealt`, because it contains all hands.
- Public subscriptions must publish redacted event views or notification envelopes, not raw event records.
- `getMyPrivateHand` must verify authenticated user owns the requested seat.
- Resolver logs must not include private hand contents.
- DynamoDB IAM should prevent clients from direct table access.
- Lambda/AppSync authorization must check room membership and seat ownership for every action.

Current backend contract tests cover:

- Public snapshot GraphQL type and mapper do not expose full hands.
- Private hand query maps through an explicit seat-ownership boundary.
- Subscription notification payloads include only safe public fields.
- Reconnect response can represent accepted, rejected, and unknown pending actions.
- Query resolver shell tests enforce public/private separation and private-hand ownership.
- Infrastructure tests assert AppSync uses Cognito authorization, Lambda resolvers, and native-app Cognito client settings.
- Submit-action tests assert rejected actions persist idempotency results without writing public snapshots, trusted events, or private hand records.
- Smoke harness tests assert the deployed smoke checks cover all current AppSync resolvers without requiring seeded private hand data.

Recommended subscription payload:

- room/game ID
- latest sequence/snapshot version
- public event summary safe for all room members
- optional actor/action status

Clients should fetch a fresh redacted snapshot after reconnect or when they detect a sequence gap.

## Room Lifecycle

Current code supports:

```text
waiting -> ready -> inGame -> completed
```

Target lifecycle:

```text
created -> waiting -> ready -> inGame -> completed -> archived
```

Recommended v1 behavior:

- Created/waiting: host creates room, players join, seats fill.
- Ready: all four seats occupied; host can start.
- In game: seating is locked; server owns actions.
- Completed: game has winner; room is readable but no new actions.
- Archived: room is hidden from default lists after expiry.

Still missing:

- explicit archived status
- TTL/expiry policy
- leave room
- kick/reassign seat
- replace disconnected player with bot
- spectator policy
- invite-code expiry and regeneration

## Estimated Effort Remaining

Rough effort for multiplayer v1, assuming one experienced engineer with this codebase context:

| Workstream | Estimate |
|---|---:|
| Deployed dev stack smoke tests and AWS error mapping | 3-5 days |
| Room authorization and lifecycle resolver hardening | 3-5 days |
| AppSync subscription validation and reconnect gap behavior | 4-7 days |
| Reconnect endpoint and client sync queue | 4-6 days |
| Mobile multiplayer room/start/join UI | 4-7 days |
| Mobile active-game multiplayer UX | 5-8 days |
| Hidden-information security tests and redaction tests | 2-4 days |
| Load/contention/idempotency tests | 2-4 days |
| Room lifecycle cleanup, expiry, replacement basics | 3-5 days |
| Deployment, observability, runbook, smoke tests | 3-5 days |

Minimum credible multiplayer alpha:

- 3-5 engineering weeks.

Production-quality casual multiplayer:

- 7-11 engineering weeks, depending on UI polish, auth UX, replacement/disconnect policy, and App Store readiness.

## Recommended Next Slices

1. Deploy-and-smoke-test development stack
   - Deploy the CDK stack into a disposable AWS development account/region.
   - Run `npm run smoke:deployed -w @shake2/backend`.
   - Capture and review the live smoke result.

2. DynamoDB failure mapping and local integration test harness
   - Map transaction cancellation reasons back to stable `EngineError` codes.
   - Add DynamoDB Local or equivalent integration tests for conditional failures.
   - Keep AWS SDK dependencies isolated inside `backend`.

3. Read-side authorization hardening
   - Enforce room membership on `getGameSnapshot`.
   - Keep seat ownership enforcement on `getMyPrivateHand`.
   - Add abuse/rate-limit behavior for reconnect and snapshot reads.

4. Reconnect client model
   - Add pending action queue and gap detection in the app without real network transport.

5. Security test matrix
   - Actor not in room.
   - Actor claiming wrong seat.
   - Private hand access by wrong player.
   - Raw hand data in public snapshot/subscription payload.
