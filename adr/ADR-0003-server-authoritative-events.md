# ADR-0003: Server-Authoritative Event Target

Status: Accepted

Date: 2026-05-30

## Context

Real-time multiplayer Texas 42 needs reconnect, duplicate action handling, stale client recovery, turn-order enforcement, and server-side validation. The current scorekeeper stores local snapshots, which is suitable for M1 but not enough for multiplayer authority or replay.

The repo now defines initial versioned action, event, snapshot, result, and error-code contracts in `packages/shared`. These contracts are intentionally TypeScript-only and backend-neutral for now.

## Decision

The target multiplayer architecture is server-authoritative and event-based:

- Clients submit versioned `GameAction` objects with actor ID, game ID, client action ID, type, payload, and submitted timestamp.
- The server validates actions against authenticated actor context and current authoritative state.
- Accepted actions create immutable `GameEvent` records with event ID, action ID, actor ID, game ID, sequence number, type, payload, and occurred timestamp.
- Reconnect uses `GameSnapshot` plus last-seen event sequence.
- Clients may render optimistic previews, but server events and snapshots are authoritative.

## Consequences

- The mobile UI must evolve toward submitting actions and rendering authoritative state instead of mutating state directly.
- The game engine must remain deterministic, pure TypeScript, and usable by backend validation.
- Event IDs, sequence numbers, actor authorization, and idempotency cannot be optional in multiplayer.
- Current shared contracts are a starting point, not the final backend schema.
- Backend implementation remains deferred until contracts and rules logic are stable enough.
