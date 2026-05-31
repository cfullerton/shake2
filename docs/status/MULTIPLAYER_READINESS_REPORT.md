# Multiplayer Readiness Report

Last reviewed: 2026-05-31

## Executive Summary

Multiplayer now has a deployable development infrastructure definition, but it is still not ready for production or mobile users.

The strongest part of the system is now the pure TypeScript authority boundary in `packages/game-engine`. It can create rooms, start a multiplayer-mode game, validate player actions, protect idempotency, redact player views, serialize durable records, parse boundary payloads, validate accepted event replay, and produce backend-neutral write plans for future conditional persistence.

The first DynamoDB adapter contract slice converts backend-neutral multiplayer write plans into deterministic DynamoDB-style transaction intent shapes. A backend workspace, testable Lambda resolver shells, production-shaped Cognito identity parser, mocked-testable AWS SDK DynamoDB store implementation, and AppSync schema/contract adapter now exist. A CDK v2 infrastructure workspace now synthesizes Cognito, DynamoDB, AppSync, Lambda, and IAM for a development environment. Basic room lifecycle API fields now exist for create, join, seat, start-game, and room lookup flows. The mobile app now has a multiplayer network/auth foundation, lobby UI for Cognito sign-in/create/join/seat/start, and the first active-game UI slice for public snapshots, private hands, and bidding. The dev stack has completed deployed smoke runs for Cognito/AppSync/Lambda wiring, the optional seeded gameplay/read/reconnect path, and live `onGameUpdated` delivery in seeded mode. The largest remaining gaps are deployed room-flow smoke coverage, client reconnect behavior, abuse handling, and completing the active multiplayer game UI beyond bidding.

## Current Multiplayer Architecture

Current multiplayer code is backend-neutral and lives under `packages/game-engine/src/multiplayer`.

- `session.ts`: room membership, seat ownership, host-only start, server-managed initial game/deal, player action submission, idempotency, automation for bidding completion, redacted player views.
- `storage.ts`: durable record shapes for room metadata, trusted event records, public snapshots, private hands, and action results; restore/reconnect helpers.
- `schema.ts`: runtime parsers for action envelopes, storage records, public snapshots, private hands, idempotency records, and client reconnect state.
- `write-plan.ts`: backend-neutral persistence write intentions for game start, accepted actions, and rejected actions.
- `dynamodb-adapter.ts`: pure DynamoDB transaction-intent conversion for write plans, with conditional-write expressions for room state, snapshot version, event append, and action idempotency conflicts.

Backend shell code now lives under `backend`.

- `src/functions/submitGameAction/handler.ts`: AppSync-like Lambda resolver shell for submit-game-action requests.
- `src/functions/rooms/handler.ts`: AppSync-like room lifecycle resolver shells for creating rooms, joining by room code, taking seats, starting ready rooms, and reading safe room views.
- `src/functions/getGameSnapshot/handler.ts`: AppSync-like query resolver shell that returns only public/redacted game snapshots after room membership authorization.
- `src/functions/getMyPrivateHand/handler.ts`: AppSync-like query resolver shell that enforces private-hand seat ownership before returning dominoes.
- `src/functions/getReconnectView/handler.ts`: AppSync-like query resolver shell that returns latest public state, actor private hand when seated, and accepted/rejected/unknown pending action status.
- `src/dynamodb/store.ts`: `MultiplayerStore` interface plus AWS SDK v3 `DynamoDBMultiplayerStore` for loading stored game records, authorizing public snapshot reads, loading private hands, reconnect records, idempotency results, committing write plans, and mapping DynamoDB transaction cancellations to stable backend errors.
- `src/appsync/schema.graphql`: undeployed draft schema for submit action, public snapshot, private hand, reconnect, and game-update subscription operations.
- `src/appsync/contracts.ts`: local AppSync contract adapters for safe submit-action results, reconnect views, private-hand ownership boundaries, and public update notifications.
- `src/auth/identity.ts`: shared actor extraction boundary that prefers AppSync Cognito `sub` as the stable multiplayer `playerId` and preserves mock identity support for tests.
- `src/smoke/deployed-smoke.ts`: deployed-stack smoke harness that loads CloudFormation outputs, authenticates Cognito smoke users, verifies unauthenticated rejection, confirms Cognito actor propagation, invokes current gameplay/read resolvers, and can optionally seed a live started game for accepted-action/read/reconnect, live `onGameUpdated` subscription delivery, plus secondary-user non-member denial checks.
- `src/types/index.ts`: backend-local request, response, actor, AppSync Cognito identity, resolver-context, and error types.

Mobile multiplayer foundation now lives under `apps/mobile/src/multiplayer`.

- `config.ts`: reads public Expo multiplayer configuration and derives the AppSync realtime endpoint.
- `auth.ts`: signs in to Cognito through the public app client and exposes an ID-token provider boundary.
- `graphql.ts`: sends authenticated AppSync GraphQL requests without leaking token handling into UI code.
- `rooms.ts`: wraps create/join/take-seat/start room GraphQL operations behind typed helpers.
- `game.ts`: wraps public snapshot, private hand, and submit-action GraphQL operations behind typed helpers.
- `activeGame.ts`: projects normalized public snapshots plus the viewer private hand into table, score, turn, and bidding UI state outside React components.
- `useMultiplayerActiveGame.ts`: owns active-game snapshot/private-hand loading, manual refresh, and pass/numeric bid submission state.
- `useMultiplayerLobby.ts`: owns mobile lobby auth/client/session state and room lifecycle operations outside screen components.

The first mobile multiplayer screens now live under `apps/mobile/src/screens`.

- `MultiplayerLobbyScreen.tsx`: gates missing config, signs in through Cognito, creates or joins rooms, renders room code/participants/seats, lets players take seats, and lets the host start a ready room before handing off to the active-game panel.
- `MultiplayerActiveGamePanel.tsx`: renders a started multiplayer game with public table state, scores, turn/dealer/bid status, the viewer private hand, refresh, and pass/numeric bidding controls.

Infrastructure code now lives under `infra`.

- `config/multiplayer-config.ts`: stage-aware resource naming, removal policy, and index-name configuration.
- `constructs/multiplayer-auth.ts`: Cognito User Pool and native-app-shaped app client.
- `constructs/multiplayer-data.ts`: DynamoDB table with room/game/action record access patterns, TTL, point-in-time recovery, and GSIs.
- `constructs/multiplayer-lambdas.ts`: Lambda functions for room lifecycle, start-game, submit action, and read-side query resolvers, with table configuration injected by environment.
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
   - A smoke script validates real sign-in and AppSync identity payloads after deployment.
   - Seeded smoke has run against the deployed stack, and the smoke harness now includes a secondary-user path for negative room-membership checks.
   - Need guest/anonymous account decision.

2. Physical persistence adapter
   - DynamoDB transaction intent shapes now exist and are tested.
   - A Lambda-style resolver shell can delegate transaction intents to `MultiplayerStore` mocks.
   - An AWS SDK v3 DynamoDB store implementation exists behind the interface and is tested with mocked clients.
   - CDK now defines a DynamoDB table, Lambda functions, and IAM grants.
   - Disposable dev-stack DynamoDB/Lambda deployment has been smoke-tested; no production persistence deployment exists yet.
   - Mocked AWS SDK tests cover transaction cancellation mapping to duplicate-action, stale-action, and persistence-conflict errors.
   - Need DynamoDB Local or equivalent integration tests for partial failures and retry handling.

3. AppSync or realtime transport
   - A GraphQL schema, local contract tests, and CDK AppSync/Lambda resolver wiring now exist.
   - Room lifecycle fields now exist for create/join/take-seat/start and room lookups.
   - A deployed smoke script is available for the mutation and query resolvers, including a seeded happy-path action/read/reconnect check.
   - The smoke harness can validate live AppSync `onGameUpdated` delivery after registering the subscription and before submitting the seeded action.
   - Need to run and record the subscription smoke mode against the current deployed dev stack.
   - No subscription gap detection is wired into the app.
   - Basic and seeded deployed reconnect smoke checks have completed.

4. Hidden-information enforcement
   - Engine redaction exists, and query resolver tests enforce public/private separation.
   - CDK prevents direct client table access by routing through Lambda/AppSync, and `getGameSnapshot` now enforces room membership before returning a public snapshot.
   - Trusted event records may contain private hands and must remain server-only.
   - Public subscriptions must never publish raw hand-dealt events.

5. Mobile multiplayer UI
   - Room creation/join/start lobby screen now exists and uses the mobile multiplayer client foundation.
   - First active-game screen now exists for snapshot rendering, private hand loading, refresh, and bidding actions.
   - No multiplayer trump selection or trick-play controls yet.
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
- Subscription output matches the subscribed mutation result and includes only safe event summaries plus public snapshots.
- Reconnect response can represent accepted, rejected, and unknown pending actions.
- Query resolver shell tests enforce public/private separation, public snapshot room membership, and private-hand ownership.
- Room lifecycle resolver tests enforce safe room views, room-code lookup, conditional persistence, and seat assignment behavior.
- Infrastructure tests assert AppSync uses Cognito authorization, Lambda resolvers, and native-app Cognito client settings.
- Submit-action tests assert rejected actions persist idempotency results without writing public snapshots, trusted events, or private hand records.
- Smoke harness tests assert the deployed smoke checks cover current gameplay/read resolvers without requiring seeded private hand data, cover secondary-user non-member denial when seeded data is available, and build/validate the AppSync realtime subscription handshake payload.

Current subscription payload:

- accepted/committed/duplicate action status
- root `gameId` for AppSync subscription filtering
- backend error for rejected actions
- safe event summaries
- latest public/redacted snapshot when an action is accepted

AppSync requires mutation-backed subscriptions to use a compatible output type with the subscribed mutation, so `onGameUpdated` currently returns `SubmitGameActionResult`.

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
| Mobile subscription handling and reconnect gap behavior | 3-6 days |
| Reconnect endpoint and client sync queue | 4-6 days |
| Mobile active-game multiplayer UX completion | 3-6 days |
| Hidden-information security tests and redaction tests | 2-4 days |
| Load/contention/idempotency tests | 2-4 days |
| Room lifecycle cleanup, expiry, replacement basics | 3-5 days |
| Deployment, observability, runbook, smoke tests | 3-5 days |

Minimum credible multiplayer alpha:

- 3-5 engineering weeks.

Production-quality casual multiplayer:

- 7-11 engineering weeks, depending on UI polish, auth UX, replacement/disconnect policy, and App Store readiness.

## Recommended Next Slices

1. Deployed room-flow smoke coverage
   - Exercise create/join/take-seat/start through deployed AppSync with real Cognito identities.
   - Verify the started room persists public snapshot and private hand records without exposing raw hands.
   - Keep the existing seeded gameplay/read/reconnect path as a separate smoke mode.

2. DynamoDB local integration test harness
   - Add DynamoDB Local or equivalent integration tests for conditional failures.
   - Keep AWS SDK dependencies isolated inside `backend`.

3. Read-side authorization hardening
   - Keep room membership enforcement on `getGameSnapshot`.
   - Keep seat ownership enforcement on `getMyPrivateHand`.
   - Add abuse/rate-limit behavior for reconnect and snapshot reads.

4. Reconnect client model
   - Add pending action queue and gap detection in the app without real network transport.

5. Active-game trump and trick-play UI
   - Add trump-call controls for the declarer once bidding completes.
   - Add legal domino selection/play controls for trick play.
   - Keep action derivation in `apps/mobile/src/multiplayer`, not in screen components.

6. Security test matrix
   - Actor not in room.
   - Actor claiming wrong seat.
   - Private hand access by wrong player.
   - Raw hand data in public snapshot/subscription payload.
