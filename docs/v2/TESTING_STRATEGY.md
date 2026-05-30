# Testing Strategy

## Test Pyramid

1. Engine unit tests
2. Contract/schema tests
3. Persistence tests
4. React Native component tests
5. Integration tests
6. E2E smoke tests

## Engine Tests

Use table-driven tests for domino generation, count scoring, dealing, bidding, trump ranking, legal play, trick winner, hand scoring, bid made/set, mark scoring, and replay.

## Persistence Tests

Test save, load, corrupt JSON, unsupported schema version, migration, storage write failure, deleting, and archiving games.

## Mobile Tests

Use React Native Testing Library for home saved-game list, new game validation, team setup, award marks, undo, completed game behavior, and history rendering.

## E2E Tests

Before App Store release, add Maestro or Detox for create game, score several hands, undo, close/reopen, and resume game.

## CI Gate

```text
npm ci
npm run typecheck
npm test
npm audit --audit-level=moderate
```

Later add lint, format check, and coverage.
