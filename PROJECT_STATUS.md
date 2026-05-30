# Project Status

Last reviewed: 2026-05-29

## Current Architecture

Shake 2 is currently a local-first Expo React Native TypeScript app in an npm workspace monorepo.

- `apps/mobile` contains the Expo app, React Navigation stack, screens, local state provider, AsyncStorage persistence, shared UI components, and theme tokens.
- `packages/game-engine` contains pure TypeScript scorekeeper domain logic with Node test coverage.
- `packages/shared` exists as a placeholder package with only a shared `EntityId` type.
- There is no `backend` workspace yet, despite the original architecture docs naming AWS Amplify Gen 2, Cognito, AppSync, and DynamoDB.
- App state is client-owned today. The mobile app loads/saves games from AsyncStorage and applies game-engine functions locally.
- The game engine is serializable and UI-independent, but it is still a scorekeeper model, not a full Texas 42 rules engine.

## Folder Structure

```text
.
|-- apps/
|   `-- mobile/
|       |-- App.tsx
|       |-- app.json
|       |-- babel.config.js
|       |-- index.js
|       |-- metro.config.js
|       |-- package.json
|       |-- tsconfig.json
|       `-- src/
|           |-- components/
|           |-- navigation/
|           |-- screens/
|           |-- state/
|           |-- storage/
|           `-- theme.ts
|-- packages/
|   |-- game-engine/
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |   `-- src/
|   |       |-- __tests__/
|   |       `-- index.ts
|   `-- shared/
|       |-- package.json
|       |-- tsconfig.json
|       `-- src/index.ts
|-- docs/
|-- adr/
|-- package.json
|-- package-lock.json
`-- tsconfig.base.json
```

## Features Implemented

- Expo React Native TypeScript mobile app scaffold.
- Stack navigation for Home, New Game, Team Setup, Scorekeeper, and History.
- New game flow with game name, target marks, opening dealer, team names, and player names.
- Local saved games list with active/complete status.
- Scorekeeper screen for selecting a team, awarding marks, adding optional hand notes, viewing current dealer, and seeing score dots.
- Dealer tracking with clockwise rotation after every scored hand.
- Undo latest score, including dealer restoration.
- History screen showing scored hands, marks, winning team for the hand, timestamp, note, and dealer.
- Local persistence through AsyncStorage.
- Pure TypeScript scorekeeper engine with tests for creation, mark awards, dealer rotation, undo, winner detection, and validation.

## Features Partially Implemented

- Game engine: currently covers scorekeeper-only state, not legal Texas 42 play, bidding, trump, tricks, domino hands, or bid evaluation.
- Game state model: current shape is serializable, but not event-sourced or replayable in the way multiplayer docs require.
- Persistence: local JSON persistence exists, but there is no schema versioning, migration path, corruption recovery, or cloud sync.
- Navigation: functional stack navigation exists, but deep-linking, route guards, and multiplayer room paths do not.
- UI system: reusable components exist, but there is no formal design system, accessibility pass, or cross-device visual regression coverage.
- Shared package: present but essentially unused.

## Known Issues

- Existing saved games created before dealer-history support may have score entries without `dealer`; the UI hides missing historical dealer values.
- `loadPersistedGames` performs shallow validation only. Malformed nested game objects can still enter app state.
- AsyncStorage parse errors surface as load failures instead of quarantining bad data and offering reset/recovery.
- `createLocalId` uses `Date.now()` plus `Math.random()`, which is acceptable for local prototypes but not collision-resistant or multiplayer-safe.
- `findGame` reads from a ref and is stable, but screens rely on provider re-renders for freshness; this is acceptable now, not a durable state architecture.
- Completed games cannot receive marks, but there is no explicit "new match" or archive/delete flow.
- No automated tests cover React Native screens, navigation, persistence, or UI behavior.
- `npm audit` reports 10 moderate vulnerabilities through Expo's transitive `uuid/xcode` dependency chain.
- React Native packages warn that current Node `23.10.0` is outside their preferred engine range.

## Technical Debt

- The engine is a single file. It should be split into model, commands, selectors, validation, and scorekeeper modules before the full rules engine lands.
- Domain actions are state snapshots rather than explicit events. Multiplayer will need event IDs, actor IDs, idempotency keys, ordering, and replay.
- Persistence has no versioned envelope. Add `{ schemaVersion, games }` before more local data accumulates.
- There is no centralized error taxonomy. UI currently catches generic `Error` messages from engine/storage.
- Package build outputs (`packages/game-engine/dist`) are generated locally and ignored, but the package `main` still points at `src/index.ts`; this is fine for Metro path aliases, weak for external package consumers.
- No linting, formatting, CI, pre-commit hooks, or test coverage thresholds.
- No environment/config strategy for future AWS endpoints.
- No app icon/adaptive icon assets configured.
- No ADR records the local-first M1 implementation or the decision to defer `/backend`.

## Recommended Next Milestones

1. Harden M1 scorekeeper data before adding rules: version persisted data, validate nested shape, add migrations, add delete/archive, and add persistence tests.
2. Split and formalize the engine model: commands, events, selectors, rules primitives, and deterministic IDs/clocks injected by callers.
3. Build M2 rules engine as pure TypeScript: domino model, deal, bids, trump, legal play validation, trick winner, hand scoring, and regional variant config.
4. Add automated mobile tests around navigation, game creation, scoring, undo, and persistence.
5. Define multiplayer contracts before backend code: action schema, event log schema, snapshot schema, reconnect semantics, conflict/idempotency strategy, and server authority boundaries.
6. Introduce AWS Amplify Gen 2 only after contracts are stable enough to avoid baking prototype state shapes into DynamoDB.

## Architecture Decisions That Differ From Original Docs

- Original docs include `/backend`; the current repo has no backend workspace.
- Original stack includes AWS Amplify Gen 2, Cognito, AppSync, and DynamoDB; current implementation is local-only with AsyncStorage.
- Original game-state docs require server authority and reconnect support; current state is client-authoritative and offline-local.
- Original database docs mention immutable events; current persistence stores mutable full game snapshots.
- Original monorepo structure names `/packages/shared`; it exists, but meaningful shared contracts are currently in `packages/game-engine`.
- The current app includes Expo web dependencies for browser smoke testing, though the product target remains iOS-first mobile.
