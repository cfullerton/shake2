# Multiplayer Architecture

## Current Implementation

The first multiplayer slice lives in `packages/game-engine/src/multiplayer/session.ts`.

It is backend-neutral and pure TypeScript. There is still no Cognito, AppSync, DynamoDB, Lambda, or mobile multiplayer UI.

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

## Authority Model

Server owns truth.

Clients may request actions:

- join room
- take seat
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

The current module covers the middle authority/command layer. Durable storage and realtime fanout are still missing.

## Hidden Information

Multiplayer player views must not expose `snapshot.hands` directly. The current redacted view exposes:

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

## Still Missing

- Authenticated identity mapping to `playerId`.
- Durable event log, snapshot, private-hand, and idempotency records.
- Runtime schema validation for all network payloads.
- Accepted-event validation before persistence.
- AppSync schema/resolvers and DynamoDB conditional writes.
- Subscription gap detection.
- Leave/rejoin/replacement behavior.
- Mobile multiplayer screens.
