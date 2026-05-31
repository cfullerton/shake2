# Multiplayer Architecture

## Current Implementation

The core multiplayer authority model lives in `packages/game-engine/src/multiplayer`.

It is backend-neutral and pure TypeScript. A backend workspace and CDK development stack now adapt that authority model to Cognito, AppSync, Lambda, and DynamoDB. There is still no mobile multiplayer UI.

Implemented now:

- Room creation with host membership.
- Player join and four-seat assignment.
- Ready/in-game/completed room status.
- Host-only game start.
- `FortyTwoState.mode = "multiplayer"`.
- Server-managed game creation and initial hand deal.
- Authorized player action submission for bid, trump call, and domino play.
- Seat ownership checks before actions reach the rules engine.
- Duplicate `actionId` handling for idempotent retries.
- Automatic server completion of bidding after the fourth bid.
- Redacted player views that hide other players' hands.
- Replay verification through existing Forty Two event reducers.
- Serializable storage records for rooms, trusted events, public snapshots, private hands, and action idempotency.
- Restore helpers that rebuild an authoritative session from records.
- Reconnect helpers that return a redacted latest player view and pending-action status.
- Validated replay for restored event streams, including forged trick-winner and forged hand-score rejection.
- Runtime boundary parsers for action envelopes, durable records, public snapshots, private hands, idempotency records, and client reconnect state.
- Backend-neutral write plans for game start, accepted player actions, and rejected player actions.
- AppSync/Lambda room lifecycle fields for creating rooms, joining by room code, taking seats, starting ready rooms, and reading safe room views.
- Mobile multiplayer network foundation for public environment config, Cognito ID-token sign-in, authenticated AppSync GraphQL calls, and typed room/start operations.

## Authority Model

Server owns truth.

Clients may request actions:

- join room
- take seat
- start game as host once the room is ready
- submit bid
- call trump
- play domino

Clients must not submit server-managed actions:

- create game
- deal hand
- complete bidding
- complete trick
- complete hand
- complete game

Those transitions are produced by the authoritative session/backend after validation.

## Target Backend Flow

```text
Client action
  -> Authenticated backend resolver
  -> Multiplayer session authorization
  -> Forty Two command handler
  -> Immutable events
  -> Materialized snapshot
  -> Durable event/snapshot storage
  -> Realtime notification
```

The current modules cover the middle authority/command layer, the backend-neutral durable record shape, validated accepted-event restore, runtime boundary parsing, conditional write planning, Cognito identity mapping, AppSync resolver shells, DynamoDB persistence for current room/action/read flows, and a mobile-side network client foundation. Realtime subscription validation and mobile multiplayer UI are still missing.

## Durable Record Shape

The backend-neutral storage module lives in `packages/game-engine/src/multiplayer/storage.ts`.

It produces records shaped for a future DynamoDB adapter:

- `ROOM#<roomId> / META`
- `GAME#<gameId> / EVENT#<sequence>`
- `GAME#<gameId> / SNAPSHOT#LATEST`
- `GAME#<gameId> / PRIVATE_HAND#<seatIndex>`
- `ACTION#<actionId> / RESULT`

The latest snapshot record is public/redacted. It stores hand counts, not full hands. Current private hands are stored in seat-specific private-hand records.

## Accepted Event Validation

The reducer applies trusted accepted events. Boundary restore must use validated replay before treating persisted records as authoritative.

Validated replay checks:

- event envelope schema version, IDs, timestamps, game ID, and sequence
- full deal shape and duplicate dominoes
- submitted bid result against the previous bidding state
- bidding completion and trump call state
- domino play hand/trick transitions
- trick winner recomputation
- completed hand score recomputation
- stored latest snapshot equality after replay

## Runtime Boundary Schemas

The backend-neutral schema module lives in `packages/game-engine/src/multiplayer/schema.ts`.

The current parsers are dependency-free TypeScript guards that accept `unknown`, return typed engine records on success, and throw stable `EngineError` codes on failure.

Boundary parsing is now applied before:

- multiplayer player action submission
- multiplayer session restore from durable records
- multiplayer reconnect view creation

Covered payloads:

- `FortyTwoActionEnvelope`
- room records
- game event records
- public snapshot records
- private hand records
- action idempotency records
- aggregate stored-game record bundles
- client sync/reconnect state

These parsers reject common corrupt or hostile payloads including unsupported schema versions, invalid seats, invalid domino pips, public snapshots that include private hands, event-record metadata mismatches, malformed idempotency records, and malformed reconnect state.

## Write Plans

The backend-neutral write-plan module lives in `packages/game-engine/src/multiplayer/write-plan.ts`.

It does not call AWS. Instead, it converts authoritative multiplayer sessions and action results into ordered persistence intentions that a future DynamoDB adapter can translate into transactions.

Covered plans:

- game start
- accepted player action
- rejected player action

Write plans can include:

- room record updates
- append-only event records
- latest public snapshot records
- private hand records
- action idempotency records

Write plans carry backend-neutral conditions for future adapters:

- room state must match expected previous status/game ID
- event records must not already exist
- latest snapshot must match expected previous sequence/version
- action idempotency records must not already exist

Accepted-action and game-start plans run validated replay before emitting records. This closes the earlier gap where accepted-event validation existed for restore but not for initial persistence planning.

## Hidden Information

Multiplayer player views and public snapshot records must not expose `snapshot.hands` directly. The current redacted view exposes:

- public game state
- public hand counts by seat
- the viewer's own remaining hand

Backend logs and public subscriptions should follow the same rule: do not broadcast private hands to the whole room.

## Reconnect Flow

Target reconnect behavior remains:

1. Client reconnects.
2. Fetch latest authoritative room and redacted player snapshot.
3. Compare `lastEventSequence`.
4. Replace local view with the authoritative snapshot.
5. Clear accepted pending actions.
6. Retry safe pending actions by `actionId`.
7. Resume subscriptions.

The current reconnect helper returns:

- whether the client needs a snapshot refresh
- the server snapshot version and last event sequence
- accepted pending action IDs
- rejected pending actions with stable error codes
- unknown pending action IDs
- the latest redacted player view

## Still Missing

- Schema migration/version-compatibility tooling for future payload changes.
- Deployed smoke coverage for organic create/join/take-seat/start room flows.
- Live AppSync subscription validation.
- Subscription gap detection.
- Leave/rejoin/replacement behavior.
- Mobile multiplayer screens.
