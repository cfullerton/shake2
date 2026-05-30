# Rules Engine Status Report

Last reviewed: 2026-05-30

## Executive Summary

The rules engine has moved beyond scorekeeper-only support and now contains the core local Texas 42 rule primitives for dominoes, seating, dealing, numeric bidding, trump, trick legality, trick winners, and full-hand scoring.

The implementation is still a collection of focused pure modules, not a complete orchestrated game engine. There is no full `FortyTwoState`, no command/event reducer for full rules play, no replay path, and no UI integration. That is a good boundary for the current scope, but it is the main gap before this can power real local practice or future server-authoritative multiplayer.

## Current Package Boundary

Rules code lives in `packages/game-engine/src` and is exported through `packages/game-engine/src/index.ts`.

Current rules-related layout:

```text
packages/game-engine/src
|-- context.ts
|-- errors.ts
|-- dominoes/
|   |-- domino.ts
|   |-- scoring.ts
|   `-- set.ts
|-- forty-two/
|   |-- bidding.ts
|   |-- deal.ts
|   |-- scoring.ts
|   |-- seats.ts
|   |-- tricks.ts
|   `-- trump.ts
`-- __tests__/
    |-- dominoes.test.ts
    |-- engine-primitives.test.ts
    |-- forty-two-bidding.test.ts
    |-- forty-two-deal.test.ts
    |-- forty-two-scoring.test.ts
    |-- forty-two-tricks.test.ts
    `-- forty-two-trump.test.ts
```

The mobile app still uses the scorekeeper engine, not the full Texas 42 rules modules.

## Implemented Rules Engine Capabilities

- Stable `EngineError` codes and command-result primitives.
- `EngineContext` injection for `now`, `newId`, and `random`.
- Normalized `Pip` and `Domino` model with canonical keys and string formatting.
- Double-six domino set generation with exactly 28 unique dominoes.
- Count-domino recognition and scoring for the five count dominoes.
- Seat model for seats `0` through `3`.
- Team model with seats `0/2` versus `1/3`.
- Dealer rotation and bid order starting left of dealer.
- Deterministic shuffle using `EngineContext.random`.
- Deal model that gives exactly 7 dominoes to each of 4 seats.
- Numeric bidding with pass, 30-42 bids, increasing bid validation, one bid per player, all-pass forced dealer bid, and declarer selection.
- Trump suit model for blanks, ones, twos, threes, fours, fives, and sixes.
- Standard numeric contract model after declarer calls trump.
- Trump identity and trump ranking with double highest.
- Trick model with leader, led domino, led suit, and played dominoes.
- Legal play validation for turn order, hand ownership, led-suit legality, and follow-suit.
- Trick winner determination by highest trump, then highest led-suit domino.
- Completed hand scoring by winning team.
- One point per completed trick.
- Captured count-domino points per trick.
- Total hand-point invariant of 42.
- Bidding-team point calculation.
- Numeric bid made/set outcome.
- Mark awards for made or set numeric bids.

## Test Status

The game-engine package currently has focused Node tests for the implemented rules modules.

Important covered invariants:

- 28 unique double-six dominoes.
- Total count points equal 35.
- Four seats and opposite-seat partnerships.
- Dealer and bid-order rotation.
- Deterministic shuffle.
- Seven dominoes per player and all 28 dominoes dealt once.
- Numeric bid limits and ordering.
- All-pass dealer-forced bid.
- Declarer-only trump call.
- Trump ranking across every suit.
- Legal and illegal trick plays.
- Trump and led-suit trick winners.
- Made bid exactly.
- Made bid over target.
- Set bid by one point.
- All and no count dominoes captured by bidding team.
- Total hand points equal 42.

Latest known verification before this report:

```text
npm run typecheck
npm test
```

Both passed after the hand-scoring work.

## Current M2 Plan Alignment

The implementation no longer maps cleanly to the older phase numbering in `M2_IMPLEMENTATION_PLAN.md`.

Completed or mostly completed:

- Engine errors/context.
- Domino primitive.
- Double-six set and count scoring.
- Seats, teams, dealer rotation, and bid order.
- Deterministic shuffle.
- Deal model and hand ownership.
- Numeric bidding.
- Trump call and trump ranking.
- Trick play validation.
- Trick winner determination.
- Hand scoring and numeric bid outcome.

Still missing from the plan:

- Standard `RuleConfig` and `standardRules`.
- Full-hand state skeleton, such as `FortyTwoState`.
- Initial full-game snapshot builder.
- Event/reducer/replay model for full Texas 42.
- Integration between trick completion and next-trick leader.
- Dealer rotation and game-completion logic after a full rules hand.

This means the repository has implemented several later rules primitives while skipping the state/reducer scaffolding that would tie them together.

## Known Gaps

- No full `FortyTwoState` or phase machine connects deal, bidding, trump, tricks, hand scoring, and marks.
- No rules command layer emits events for full Texas 42 actions.
- No full rules event types, reducer, snapshots, or replay helper.
- No standard rules configuration object, so constants such as minimum bid, target marks, all-pass behavior, and trump behavior are currently spread across modules.
- No local practice screen or app flow consumes the rules engine.
- No multiplayer-safe authority model is implemented in code.
- No AWS, AppSync, DynamoDB, Cognito, room state, or reconnect handling.
- No bots or bot decision interface.
- No variant contracts such as mark bids, 84, plunge, splash, nello, sevens, or follow-me.
- No runtime schema validation for serialized full-game snapshots because full-game snapshots do not exist yet.
- No package-local test utilities for deterministic hands; tests currently build fixtures inline.

## Technical Risks

- The rules modules are individually tested, but there is no end-to-end hand lifecycle test from deal through hand scoring.
- `scoreCompletedHand` trusts caller-provided trick winners. The trick winner helper exists, but scoring does not yet derive winners from tricks and trump in an orchestrated flow.
- The trick model removes played dominoes from hands, but completed tricks are not yet accumulated by a game state reducer.
- The bidding, trump, trick, and scoring states are separate shapes. Without a single state machine, future callers could compose them in an invalid order.
- Constants should move behind `RuleConfig` before variants or multiplayer are added.
- Current full-rules code is deterministic where randomness is involved, but replay is not proven because no event log applies these rules yet.
- Full-hand mark awards are calculated, but not applied to a match score or game-complete state.
- Dealer rotation after a rules hand is not implemented outside scorekeeper mode.
- Test fixtures are becoming repetitive and may hide coupling as the engine grows.

## Recommended Next Work

1. Add `forty-two/rules-config.ts` with standard rules and explicit disabled variants.
2. Add `FortyTwoState` and a serializable initial snapshot builder.
3. Add a small command/event/reducer slice for full rules setup, deal, bid, trump, play domino, complete trick, and complete hand.
4. Wire trick completion so the engine derives the winner, captures points, stores the completed trick, and sets the next leader.
5. Wire hand completion so seven completed tricks produce a hand score, mark awards, next dealer, and optional game completion.
6. Add deterministic replay tests from an initial snapshot plus events.
7. Move repeated rules test fixtures into `packages/game-engine/src/test-utils`.
8. Add integration tests for a full seven-trick hand lifecycle.
9. Only after local replay is stable, map full-rules events into the shared Action/Event/Snapshot contracts.
10. Defer AWS, multiplayer rooms, bots, tournaments, and UI until the local rules reducer is stable.

## Architecture Notes

- The current separation between scorekeeper mode and full rules mode is still correct.
- The rules engine is pure TypeScript and remains UI-independent.
- The current implementation favors small functional modules over an early monolithic state machine. That has kept tests focused, but the next milestone needs an orchestrator.
- The docs describe a future server-authoritative multiplayer engine. The code is not there yet, but the pure deterministic module boundary is compatible with that direction.
- The biggest architecture deviation is sequence: later rule primitives were implemented before `RuleConfig`, `FortyTwoState`, reducers, and replay. That is manageable, but should be corrected before adding more gameplay surface.
