# Testing Gaps

Last reviewed: 2026-05-30

## Current Test Coverage

The repo currently has focused Node tests for `packages/game-engine`, contract tests for `packages/shared`, and React Native Testing Library tests for the main scorekeeper mobile flow.

Covered today:

- Create scorekeeper game.
- Assign partners by seat.
- Award marks.
- Advance hand number.
- Rotate dealer.
- Detect winner.
- Undo latest score.
- Reject zero-mark awards.
- Reject over-target mark awards.
- Reject invalid target marks, timestamps, and overlong labels/notes.
- Serialize, parse, and migrate versioned scorekeeper persistence data.
- Create and validate versioned action, event, and snapshot contracts.
- Save, load, migrate, and reject invalid data through the mobile AsyncStorage wrapper.
- New Game target-mark validation and normalized Team Setup navigation.
- Team Setup game creation defaults.
- Scorekeeper dealer display, mark award, History navigation, undo, and dealer rotation.
- History hand rendering, dealer display, note display, and undo.

Manual/browser verification has also been performed for the app flow, but visual and device-specific behavior is not automated.

## Major Gaps

1. Mobile component coverage is still narrow.

The core scorekeeper flow now has React Native Testing Library coverage, but Home loading/error/saved-game states, accessibility labels, long text wrapping, delete/archive flows, and edge-case button disabled states are still untested.

2. No local persistence recovery UX tests.

The pure persistence codec and AsyncStorage wrapper have tests, but there is no user-facing reset/quarantine/recovery flow to test yet.

3. Navigation coverage is partial.

The New Game -> Team Setup creation path and Scorekeeper -> History button behavior are covered at screen level. Full stack navigation, route guards, deep links, and missing-game navigation are not.

4. No UI regression tests.

There are no screenshots, visual baselines, or layout checks for iOS device sizes.

5. No full rules tests.

Expected at this stage, but important: there are no tests for domino modeling, bidding, trump, legal play, trick winner, count domino scoring, or bid fulfillment.

6. No multiplayer simulation tests.

There are no tests for event ordering, reconnect, duplicate actions, stale clients, invalid actor actions, server/client divergence, or room membership.

7. Contract tests are initial only.

Shared TypeScript action/event/snapshot guards have tests, but there is no runtime schema validator, backend consumer, generated schema, or compatibility suite.

8. CI is basic.

GitHub Actions now runs install, typecheck, tests, and audit reporting. It does not run linting, coverage thresholds, iOS simulator tests, visual regression, or a required audit gate.

9. Security tests are not present.

CI reports dependency audit findings, but there are no input limit tests in the UI, authorization tests, invalid remote payload tests, or abuse-case tests.

10. No performance tests.

No checks for large history lists, many saved games, slow AsyncStorage, or low-end iOS behavior.

## Engine Test Gaps

- Undo on empty history behavior.
- Complete-game behavior and error path.
- Invalid IDs/timestamps.
- Sanitizing empty game/team/player names.
- Deterministic replay from an event sequence.
- Command result to event generation and event application.
- Variant configuration once rules are added.

## App Test Gaps

- Home empty/loading/error/saved-game states.
- Team Setup loading and failure behavior.
- Scorekeeper mark stepper bounds.
- Award button disabled on completed games.
- Undo button disabled without history.
- Persistence across app reload.
- Long names/notes wrapping correctly on small iPhones.
- Accessibility labels/roles for icon buttons and controls.

## Recommended Testing Stack

- Keep Node's built-in test runner or move to Vitest for pure engine tests; either is fine, but be consistent.
- Add React Native Testing Library for screen/component behavior.
- Add AsyncStorage mock tests for persistence.
- Add Playwright or Expo-compatible smoke tests for web-only sanity checks, but do not treat web as a substitute for iOS.
- Add Detox or Maestro for critical iOS flows before App Store launch.
- Expand contract/schema tests before backend work and add runtime validators.

## Minimum CI Gate

CI now runs the minimum gate:

```text
npm ci
npm run typecheck
npm test
npm audit --audit-level=moderate
```

The audit step currently reports the known Expo transitive moderate advisory without blocking. That should become stricter once the dependency chain has an upgrade path.
