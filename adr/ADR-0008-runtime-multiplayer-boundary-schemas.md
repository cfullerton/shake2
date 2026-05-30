# ADR-0008: Runtime Multiplayer Boundary Schemas

Status: Accepted

Date: 2026-05-30

## Context

The multiplayer session and storage modules are backend-neutral TypeScript. TypeScript types are useful inside the package, but future AppSync, Lambda, DynamoDB, and reconnect boundaries will receive plain JSON. Those payloads can be malformed, stale, partially migrated, or hostile.

Validated event replay already protects restored accepted event streams. It does not, by itself, validate every action envelope, durable record wrapper, public snapshot, private hand record, idempotency result, or client reconnect request before typed code reads it.

## Decision

Add a dependency-free runtime parser module at `packages/game-engine/src/multiplayer/schema.ts`.

Boundary-facing multiplayer APIs accept `unknown` payloads and parse them before use:

- `submitMultiplayerGameAction`
- `restoreMultiplayerSessionFromRecords`
- `getMultiplayerReconnectView`

The parsers return typed values on success and throw stable `EngineError` codes on failure.

## Consequences

- Network and storage boundaries no longer rely on TypeScript-only trust.
- Public snapshot records reject private `hands` and viewer-specific hands.
- Malformed action envelopes, invalid seats, invalid domino pips, malformed idempotency records, and bad reconnect state are rejected before command or restore logic trusts them.
- Accepted-event replay still recomputes derived game facts after schema parsing.
- Future physical AWS adapters should call these parsers at ingress/egress and add migration handling when schema versions change.
