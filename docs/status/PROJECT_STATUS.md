# Project Status

Last reviewed: 2026-05-30

## Current Architecture

Shake 2 is currently a local-first Expo React Native TypeScript app in an npm workspace monorepo.

- `apps/mobile` contains the Expo app, React Navigation stack, screens, local state provider, AsyncStorage persistence, shared UI components, and theme tokens.
- `packages/game-engine` contains pure TypeScript scorekeeper domain logic, validation, selectors, persistence codecs, and Node test coverage.
- `packages/game-engine` also contains the full Texas 42 local rules engine, legal-action selectors, legal-random bots, and an in-memory local practice session layer.
- `packages/game-engine` now contains the first backend-neutral multiplayer session layer for rooms, seat ownership, server-authoritative action submission, idempotency, and redacted player views.
- `packages/game-engine` now contains backend-neutral multiplayer storage records for room metadata, trusted event logs, redacted public snapshots, private hands, action idempotency, restore, and reconnect views.
- `packages/game-engine` now contains a validated Forty Two replay path for restoring accepted events at multiplayer persistence/reconnect boundaries.
- `packages/game-engine` now contains runtime multiplayer boundary parsers for action envelopes, room records, event records, public snapshots, private hands, idempotency records, and client reconnect state.
- `packages/shared` contains initial versioned Action/Event/Snapshot contracts for scorekeeper and future server use.
- `.github/workflows/ci.yml` runs install, typecheck, tests, and audit reporting on pull requests and pushes to `main`.
- `.github/workflows/deploy-web.yml` builds the Expo web bundle and deploys static assets to AWS S3/CloudFront with GitHub OIDC.
- `infra/aws/web-hosting.yml` provisions static web hosting resources, optional custom-domain ACM/Route 53 wiring, and a least-privilege GitHub Actions deploy role.
- There is no `backend` workspace yet, despite the original architecture docs naming AWS Amplify Gen 2, Cognito, AppSync, and DynamoDB.
- App state is client-owned today. The mobile app loads/saves games from AsyncStorage and applies game-engine functions locally.
- The game engine is serializable and UI-independent, with scorekeeper, local full-rules, bot-practice, and early multiplayer authority modules.

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
|   |       |-- multiplayer/
|   |       |-- scorekeeper/
|   |       `-- index.ts
|   `-- shared/
|       |-- package.json
|       |-- tsconfig.json
|       `-- src/
|           |-- __tests__/
|           |-- contracts/
|           `-- index.ts
|-- docs/
|-- infra/
|   `-- aws/
|       `-- web-hosting.yml
|-- adr/
|-- .github/
|   `-- workflows/
|       |-- ci.yml
|       `-- deploy-web.yml
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
- Local practice start screen for playing a full Texas 42 game against three legal-random bots.
- Local practice active game screen for bidding, trump selection, trick play, hand summary, game summary, restart, and next-hand flow.
- Local persistence through AsyncStorage using a versioned scorekeeper snapshot envelope.
- Legacy migration from the original raw saved-game array format.
- Hardened scorekeeper validation for target marks, mark awards, timestamps, IDs, names, and notes.
- Pure TypeScript scorekeeper engine with tests for creation, mark awards, dealer rotation, undo, winner detection, validation, and persistence codecs.
- Pure TypeScript full-rules engine with tests for deal, bidding, trump, legal play, trick winners, hand scoring, replay, local session orchestration, legal-random bots, 100 completed simulated hands, and 25 completed simulated games.
- Backend-neutral multiplayer room/session primitives in the engine: room creation, joins, seat assignment, host-only start, multiplayer-mode snapshots, server-managed initial deal, authorized bid/trump/play submission, duplicate action ID handling, automatic bidding completion, and private-hand redaction.
- Backend-neutral multiplayer storage/reconnect primitives: public snapshot records omit full hands, private hands are stored by seat, authoritative sessions can be restored from records, and reconnect views classify accepted/rejected/unknown pending actions.
- Validated accepted-event replay for restored Forty Two event streams, including runtime envelope checks, deal validation, derived bid/trump/play validation, trick-winner recomputation, hand-score recomputation, and stored-snapshot comparison.
- Runtime schema parsers for multiplayer network/storage boundaries. Multiplayer action submission, session restore, and reconnect now parse `unknown` payloads before typed engine code trusts them.
- Initial shared contracts for `GameAction`, `GameEvent`, `GameSnapshot`, `GameActionResult`, and `GameErrorCode`.
- React Native Testing Library coverage for core scorekeeper flows and AsyncStorage persistence wrapper behavior.
- GitHub Actions CI for install, typecheck, tests, and non-blocking audit reporting.
- GitHub Actions web deployment workflow for Expo web export to AWS S3/CloudFront using OIDC.
- CloudFormation template and runbook for static AWS web hosting, including optional custom domain and ACM certificate support.
- ADRs documenting local-first M1, server-authoritative event target architecture, the scorekeeper mode boundary, and the backend-neutral multiplayer session layer.

## Features Partially Implemented

- Game engine: full local Texas 42 play now exists for standard numeric bids and pip-suit trump, but does not implement variants or advanced bot strategy.
- Multiplayer: engine-level authority and durable record primitives exist, but there is still no auth, physical backend persistence, realtime transport, deployed reconnect endpoint, or mobile multiplayer UI.
- Game state model: current scorekeeper shape is serializable, but the app does not yet apply shared actions/events or replay an event log.
- Persistence: local JSON persistence has schema versioning and legacy migration for scorekeeper games, but local practice games are currently in-memory only.
- Navigation: functional stack navigation exists, but deep-linking, route guards, and multiplayer room paths do not.
- UI system: reusable components exist, but there is no formal design system, accessibility pass, or cross-device visual regression coverage.
- Shared package: contracts exist, but they are initial scorekeeper-oriented TypeScript contracts, not a backend schema or runtime validator.
- Web hosting: AWS S3/CloudFront hosting infrastructure and workflow exist, including custom-domain support, but no production AWS stack has been deployed from this environment.
- CI: basic workflow exists, but there is no lint, coverage threshold, visual test, iOS device test, or required audit pass yet.

## Known Issues

- Existing saved games created before dealer-history support may have score entries without `dealer`; the UI hides missing historical dealer values.
- Corrupt or unsupported local persistence data is dropped rather than quarantined with a user-facing reset/recovery flow.
- `createLocalId` uses `Date.now()` plus `Math.random()`, which is acceptable for local prototypes but not collision-resistant or multiplayer-safe.
- `findGame` reads from a ref and is stable, but screens rely on provider re-renders for freshness; this is acceptable now, not a durable state architecture.
- Completed games cannot receive marks, but there is no explicit "new match" or archive/delete flow.
- Automated UI tests cover the main scorekeeper flow, but Home states, long text layout, accessibility, delete/archive, and end-to-end iOS behavior remain untested.
- `npm audit` reports 10 moderate vulnerabilities through Expo's transitive `uuid/xcode` dependency chain.
- React Native packages warn that current Node `23.10.0` is outside their preferred engine range.

## Technical Debt

- Full-rules fixtures and local-session helpers are still young and should be consolidated before multiplayer work.
- Multiplayer restore validates accepted events before replay, and multiplayer actions/storage/reconnect payloads now pass through runtime parsers. Schema migrations and physical backend adapters are still missing.
- Shared contracts define action/event/snapshot shapes, but the mobile app still does not submit actions through a remote authority.
- Persistence has a versioned envelope, but no backup/quarantine strategy or user-controlled reset path.
- There is no centralized error taxonomy. UI currently catches generic `Error` messages from engine/storage.
- Package build outputs (`packages/game-engine/dist`) are generated locally and ignored, but the package `main` still points at `src/index.ts`; this is fine for Metro path aliases, weak for external package consumers.
- No linting, formatting, pre-commit hooks, or test coverage thresholds.
- AWS static web hosting now has deployment docs, but there is still no broader environment/config strategy for future app backend endpoints.
- No app icon/adaptive icon assets configured.

## Recommended Next Milestones

1. Finish M1 hardening: add user-facing corrupt-data recovery and delete/archive/rename for saved games.
2. Mirror engine validation limits in the UI with input bounds, counters, and clearer form errors.
3. Connect engine command results to shared events so local replay can be proven before multiplayer.
4. Harden M3 local practice: persist or explicitly discard practice sessions, improve local game UI states, and extract reusable simulation fixtures.
5. Expand contract tests around duplicate actions, stale sequences, reconnect snapshots, and unsupported schemas.
6. Wire the runtime multiplayer schemas into a physical AWS adapter and add explicit migration handling.
7. Build the physical AWS backend adapter around the backend-neutral session/storage modules.
8. Introduce mobile multiplayer room UI after deployed auth and persistence exist.

## Architecture Decisions That Differ From Original Docs

- Original docs include `/backend`; the current repo has no backend workspace.
- Original stack includes AWS Amplify Gen 2, Cognito, AppSync, and DynamoDB; the mobile app runtime is still local-only with AsyncStorage.
- The repo now includes a narrow AWS static web hosting path using S3, CloudFront, and GitHub OIDC before any Amplify/AppSync backend exists.
- The repo now includes a backend-neutral multiplayer authority module before any AWS multiplayer infrastructure exists.
- Multiplayer durable records intentionally split public snapshots from private hand records before introducing AppSync subscriptions.
- Multiplayer restore validates event streams and compares replayed state to the stored latest snapshot before returning an authoritative session.
- Original game-state docs require deployed server authority and reconnect support; the engine now has backend-neutral authority primitives, but the app remains offline-local.
- Original database docs mention immutable events; current local persistence still stores mutable full game snapshots, although shared event contracts now exist.
- The current app includes Expo web dependencies for browser smoke testing, though the product target remains iOS-first mobile.
- ADR-0002 through ADR-0008 document why M1 is local-first, how server authority should work, why scorekeeper stays separate, why the first multiplayer slice is backend-neutral, why public snapshots are split from private hands, why restore uses validated replay, and why multiplayer boundary payloads are parsed at runtime.
