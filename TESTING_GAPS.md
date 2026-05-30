# Testing Gaps

Last reviewed: 2026-05-29

## Current Test Coverage

The repo currently has focused Node tests for `packages/game-engine`.

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

Manual/browser verification has been performed for the app flow, but it is not automated.

## Major Gaps

1. No mobile component tests.

Screens and components have no React Native Testing Library coverage. Navigation, form validation, button disabled states, and rendering edge cases are untested.

2. No AsyncStorage integration tests.

The pure persistence codec has tests, but the React Native AsyncStorage wrapper has no tests for read/write failures or platform integration.

3. No navigation tests.

The New Game -> Team Setup -> Scorekeeper flow is not automated. History navigation and missing-game states are not covered.

4. No UI regression tests.

There are no screenshots, visual baselines, or layout checks for iOS device sizes.

5. No full rules tests.

Expected at this stage, but important: there are no tests for domino modeling, bidding, trump, legal play, trick winner, count domino scoring, or bid fulfillment.

6. No multiplayer simulation tests.

There are no tests for event ordering, reconnect, duplicate actions, stale clients, invalid actor actions, server/client divergence, or room membership.

7. No contract tests.

There are no shared schemas or tests proving mobile/backend compatibility, because backend/contracts do not exist yet.

8. No CI.

Local `npm run typecheck` and `npm test` work, but nothing enforces them on branches.

9. No security tests.

No dependency audit automation, input limit tests, authorization tests, or invalid payload tests.

10. No performance tests.

No checks for large history lists, many saved games, slow AsyncStorage, or low-end iOS behavior.

## Engine Test Gaps

- Undo on empty history behavior.
- Complete-game behavior and error path.
- Invalid IDs/timestamps.
- Sanitizing empty game/team/player names.
- Deterministic replay from an event sequence, once events exist.
- Variant configuration once rules are added.

## App Test Gaps

- Home empty/loading/error/saved-game states.
- New Game validation for invalid target marks.
- Team Setup create-game loading and failure behavior.
- Scorekeeper mark stepper bounds.
- Award button disabled on completed games.
- Undo button disabled without history.
- History list rendering and undo behavior.
- Persistence across app reload.
- Long names/notes wrapping correctly on small iPhones.
- Accessibility labels/roles for icon buttons and controls.

## Recommended Testing Stack

- Keep Node's built-in test runner or move to Vitest for pure engine tests; either is fine, but be consistent.
- Add React Native Testing Library for screen/component behavior.
- Add AsyncStorage mock tests for persistence.
- Add Playwright or Expo-compatible smoke tests for web-only sanity checks, but do not treat web as a substitute for iOS.
- Add Detox or Maestro for critical iOS flows before App Store launch.
- Add contract/schema tests once backend/action types exist.

## Minimum CI Gate

Before M2 grows, add CI that runs:

```text
npm ci
npm run typecheck
npm test
npm audit --audit-level=moderate
```

Treat the current Expo transitive audit issue explicitly, rather than ignoring audit output silently.
