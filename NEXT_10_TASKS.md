# Next 10 Tasks

Last reviewed: 2026-05-29

These tasks are ordered to protect the future real-time multiplayer iOS goal while still moving through the roadmap sensibly.

## 1. Add Versioned Local Persistence

Wrap AsyncStorage data in a schema envelope with `schemaVersion`, `games`, and optional metadata. Add migrations and tests before any more saved-game fields are introduced.

## 2. Harden Scorekeeper Validation

Add length limits and validation for game names, team names, player names, hand notes, target marks, and mark awards. Keep validation in the engine/shared domain layer where possible.

## 3. Split The Game Engine Into Modules

Refactor `packages/game-engine/src/index.ts` into explicit modules for types, scorekeeper commands, selectors, validation, and dealer utilities. This should happen before the file becomes a full rules engine.

## 4. Define Action/Event/Snapshot Contracts

Create versioned TypeScript contracts for local and future server use:

- `GameAction`
- `GameEvent`
- `GameSnapshot`
- `GameActionResult`
- `GameErrorCode`

Include actor ID, game ID, client action ID, sequence number, and schema version where appropriate.

## 5. Add Persistence And UI Tests

Add tests for AsyncStorage load/save/corruption behavior and core screen flows: create game, award marks, undo, history, and dealer rotation.

## 6. Add CI

Run install, typecheck, engine tests, and audit reporting on every branch. Document the current Expo audit advisory instead of letting it become background noise.

## 7. Add ADRs For Current Architecture Deviations

Add ADRs for:

- Local-first M1 scorekeeper despite original AWS architecture.
- Event-sourced/server-authoritative target architecture for multiplayer.
- Scorekeeper mode as separate from full rules/multiplayer mode.

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
