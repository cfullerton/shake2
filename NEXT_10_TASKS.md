# Next 10 Tasks

Last reviewed: 2026-05-29

These tasks are ordered to protect the future real-time multiplayer iOS goal while still moving through the roadmap sensibly.

## 1. Add AsyncStorage Integration Tests And Recovery UX

The pure persistence codec is versioned and tested. Next, add tests around the AsyncStorage wrapper and a user-facing recovery/reset path for invalid local data.

## 2. Mirror Validation Limits In The UI

The engine now validates scorekeeper inputs. Add matching UI limits, counters, and clearer validation messages so users hit fewer generic alerts.

## 3. Add CI

Run install, typecheck, engine tests, and audit reporting on every branch. Document the current Expo audit advisory instead of letting it become background noise.

## 4. Define Action/Event/Snapshot Contracts

Create versioned TypeScript contracts for local and future server use:

- `GameAction`
- `GameEvent`
- `GameSnapshot`
- `GameActionResult`
- `GameErrorCode`

Include actor ID, game ID, client action ID, sequence number, and schema version where appropriate.

## 5. Add UI Flow Tests

Add React Native screen tests for create game, award marks, undo, history, dealer rotation, and validation errors.

## 6. Add ADRs For Current Architecture Deviations

Add ADRs for:

- Local-first M1 scorekeeper despite original AWS architecture.
- Event-sourced/server-authoritative target architecture for multiplayer.
- Scorekeeper mode as separate from full rules/multiplayer mode.

## 7. Add User-Controlled Game Management

Add delete/archive/rename flows for local scorekeeper games before saved data grows.

## 8. Build The M2 Domino Domain Model

Implement pure TypeScript types and tests for dominoes, double-six set generation, shuffling/dealing via injected randomness, seats, hands, tricks, count domino values, and hand total invariants.

## 9. Implement M2 Rules Validation Incrementally

Add bidding, trump selection, legal play validation, trick winner determination, scoring, and bid evaluation as tested pure engine commands. Do not touch AWS or multiplayer until these rules are deterministic.

## 10. Design Multiplayer Backend Contracts Before Backend Code

Before creating `/backend`, write the room lifecycle and reconnect protocol:

- room creation/join/leave
- seat assignment
- invitation expiry
- authoritative action validation
- event sequence ordering
- snapshot fetch on reconnect
- duplicate action handling
- stale client recovery
- disconnect/timeout behavior
