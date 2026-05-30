# Architecture Review

Last reviewed: 2026-05-30

## Executive Assessment

The current architecture is a good Milestone 1 scorekeeper prototype and has started laying contract groundwork for future multiplayer. The most important positive choices are keeping scorekeeper logic in `packages/game-engine`, adding versioned contracts in `packages/shared`, and recording the local-first deviation in ADRs. The biggest risk remains that the running app is snapshot-oriented, client-authoritative, and local-only, while the target product needs deterministic rules, server-authoritative actions, event replay, reconnects, and conflict handling.

## What Is Working

- The monorepo layout matches the intended app/package separation for `apps/mobile`, `packages/game-engine`, and `packages/shared`.
- The engine is pure TypeScript and independent of React Native, Expo, AsyncStorage, and AWS.
- Scorekeeper engine code is split into command, selector, dealer, validation, persistence, and type modules.
- Navigation is simple and understandable for M1.
- Scorekeeper state is serializable JSON.
- Local persistence now has a versioned envelope and migrates the original raw-array format.
- Basic engine tests exist, and they cover the most important current business behavior.
- Local persistence is isolated in `apps/mobile/src/storage/gameStorage.ts`, not scattered through screens.
- `packages/shared` now defines initial versioned `GameAction`, `GameEvent`, `GameSnapshot`, `GameActionResult`, and `GameErrorCode` contracts.
- Mobile tests cover the core New Game, Team Setup, Scorekeeper, History, undo, dealer rotation, and AsyncStorage wrapper flows.
- CI runs dependency installation, typecheck, tests, and dependency audit reporting.
- ADRs now document the local-first M1 approach, target server-authoritative events, and the scorekeeper mode boundary.

## Critical Gaps For Real-Time Multiplayer

1. No server-authoritative model exists.

The current `GameProvider` applies commands locally and saves the result. Multiplayer must invert that flow: client submits an action, server validates, server persists an event/snapshot, clients receive authoritative state.

2. Initial contracts exist, but they are not wired into app or engine execution.

The docs say "Store immutable events when possible", and `packages/shared` now defines first-pass contracts. Current mobile persistence still writes full mutable scorekeeper snapshots. Realtime rooms still need durable event storage, server-generated event IDs, authenticated actor IDs, idempotency handling, sequence enforcement, and replay/application logic.

3. The game engine is not yet a rules engine.

Current commands track marks and dealer. There is no domino model, shuffle/deal, bidding, trump, legal-play validation, trick resolution, count domino scoring, or bid evaluation.

4. State shape is not future-proofed.

`ScorekeeperGame` is useful for M1, but not enough for a server snapshot. Future state needs room/session metadata, player identities, seats, connection state, current phase, hand state, trick state, bidding state, action history, and variant config.

5. Local persistence is still snapshot-only.

AsyncStorage now stores a versioned document, but it still persists mutable snapshots rather than immutable events. That is fine for local scorekeeping, but it is not the multiplayer persistence model.

6. `packages/shared` contracts are compile-time only.

The shared package is now the right home for cross-boundary contracts, but it does not yet provide runtime schema validation, generated API schemas, backend integration, or compatibility tests against a deployed service.

7. No backend workspace exists.

Original docs list `/backend` and Amplify Gen 2, but the repo has no backend app, auth model, schema, resolver code, or deployment config.

## Current Data Flow

```mermaid
flowchart LR
  UI["React Native Screens"] --> Store["GameProvider"]
  Store --> Engine["@shake2/game-engine"]
  Engine --> Store
  Shared["@shake2/shared contracts"] -.-> Store
  Store --> Storage["AsyncStorage JSON"]
  Storage --> Store
```

This is correct for a local scorekeeper and wrong for multiplayer authority.

## Target Multiplayer Data Flow

```mermaid
flowchart LR
  Client["iOS Client"] --> Action["Submit Signed/Authenticated Action"]
  Action --> Server["Server Validation + Rules Engine"]
  Server --> Events["Immutable GameEvents"]
  Server --> Snapshot["GameSnapshot"]
  Events --> Realtime["Realtime Fanout"]
  Snapshot --> Reconnect["Reconnect Snapshot Fetch"]
  Realtime --> Client
  Reconnect --> Client
```

The same pure engine should be usable on the server for validation and optionally on the client for previews, but server results must win.

## Recommended Architecture Direction

- Keep `packages/game-engine` pure, deterministic, and side-effect-free.
- Split scorekeeper-only logic from full-game rules logic before adding M2.
- Keep versioned action/event/snapshot types in `packages/shared` and add runtime validators before backend use.
- Connect the engine to a command/event model:
  - `GameAction`: requested by clients.
  - `GameEvent`: accepted immutable server fact.
  - `GameSnapshot`: materialized state for reconnect/rendering.
  - `GameCommandResult`: validation result plus generated events.
- Inject clocks, IDs, random shuffle seeds, and player identity into engine commands instead of generating them inside engine logic.
- Keep schema versions on every persisted client/server document.
- Keep mobile UI as a renderer and action submitter, not a rules authority.

## Architecture Decisions Needed Soon

- Whether the full rules engine lives in `packages/game-engine` beside scorekeeper logic or in submodules such as `scorekeeper/` and `rules/`.
- Whether to use Amplify/AppSync subscriptions directly or place a custom realtime/game service behind AppSync for stricter ordering.
- How to represent Texas 42 variants without fragmenting the rules engine.
- How to migrate or intentionally isolate local scorekeeper saves once multiplayer games exist.
- How reconnect snapshots and event replay interact when a client misses events.

## High-Risk Areas

- Event ordering and idempotency: AppSync subscriptions alone do not solve all gameplay ordering concerns.
- Server validation latency: client UX may need optimistic previews, but server must remain authoritative.
- Randomness: dealing must be reproducible/auditable server-side, not client generated.
- Reconnect: snapshot version and last-seen event sequence must be part of the protocol.
- Rule variants: unmodeled variants can poison assumptions in legal-play validation.

## Concrete Recommendations

1. Add a user-facing local data reset/recovery path before App Store release.
2. Continue refining engine domain boundaries before implementing domino rules.
3. Add event application/replay tests before relying on shared contracts for multiplayer.
4. Add runtime contract validation before accepting remote payloads.
5. Design reconnect and duplicate-action semantics before building `/backend`.
6. Keep CI expanding toward linting, coverage thresholds, and iOS flow tests.
