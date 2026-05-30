# ADR-0009: Backend-Neutral Multiplayer Write Plans

Status: Accepted

Date: 2026-05-30

## Context

The multiplayer engine now has backend-neutral session authority, durable record shapes, accepted-event restore validation, and runtime boundary parsers. The next production risk is the write boundary: future backend code must append accepted events, update redacted snapshots, update private hand records, and store idempotency results atomically with conditional checks.

Adding DynamoDB/AppSync before that write boundary is explicit would force the first AWS adapter to define persistence semantics and rule validation at the same time.

## Decision

Add a backend-neutral write-plan module at `packages/game-engine/src/multiplayer/write-plan.ts`.

Write plans describe the records and conditions a physical adapter must apply for:

- game start
- accepted player action
- rejected player action

Accepted write plans must run validated replay before emitting persistence records. Plans include backend-neutral condition hints for room state, append-only event records, previous snapshot sequence/version, and action-idempotency uniqueness.

## Consequences

- Future AWS code can translate tested write intentions into DynamoDB transactions instead of inventing persistence rules in resolvers.
- Accepted events are validated before initial persistence planning as well as during restore.
- Rejected actions can persist idempotency results without mutating snapshots or event logs.
- The module still does not provide physical persistence, auth, AppSync schemas, subscriptions, or migrations.
