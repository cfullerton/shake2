# ADR-0005: Backend-Neutral Multiplayer Session Layer

Status: Accepted

Date: 2026-05-30

## Context

The app now has a deterministic full-rules engine and local bot practice flow, but no backend workspace, auth provider, AppSync API, or DynamoDB event store. Multiplayer still needs server authority, seat ownership, idempotent action handling, hidden-hand protection, replay, and reconnect-safe snapshots.

Creating AWS resolvers before these boundaries exist in pure TypeScript would make the first backend implementation carry too many unproven assumptions.

## Decision

Add the first multiplayer implementation as a backend-neutral engine module in `packages/game-engine/src/multiplayer`.

The module owns:

- Room membership and four-seat assignment.
- Host-only game start.
- A `multiplayer` mode for Forty Two snapshots.
- Server-managed game creation and initial deal.
- Authorized submission of player gameplay actions.
- Idempotent duplicate `actionId` handling.
- Automatic server completion of bidding after the fourth bid.
- Redacted player views that expose only the viewer's hand plus public hand counts.

AWS, Cognito, AppSync, DynamoDB, and mobile multiplayer UI remain separate future layers that should call this authority module rather than reimplementing rule checks.

## Consequences

- The multiplayer authority boundary can be tested locally before network code exists.
- The future backend can adapt authenticated users to `playerId` and seat ownership checks.
- Hidden hands are no longer just a UI convention for multiplayer-facing views.
- Reconnect, durable persistence, runtime schema validation, and accepted-event validation are still required before production multiplayer.
