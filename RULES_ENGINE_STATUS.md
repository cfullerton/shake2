# Rules Engine Status Report

Last reviewed: 2026-05-30

## Executive Summary

The rules engine has moved beyond scorekeeper-only support and now contains the core local Texas 42 rule primitives for dominoes, seating, dealing, numeric bidding, trump, trick legality, trick winners, and full-hand scoring.

The implementation is still a collection of focused pure modules, not a complete orchestrated game engine. `FortyTwoState`, accepted-event envelopes, event application, and replay now exist, but there is no command validation layer and no UI integration. That is a good boundary for the current scope, but it is the main gap before this can power real local practice or future server-authoritative multiplayer.

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
|   |-- actions.ts
|   |-- bidding.ts
|   |-- commands.ts
|   |-- deal.ts
|   |-- events.ts
|   |-- reducer.ts
|   |-- rules-config.ts
|   |-- scoring.ts
|   |-- seats.ts
|   |-- state.ts
|   |-- tricks.ts
|   `-- trump.ts
`-- __tests__/
    |-- dominoes.test.ts
    |-- engine-primitives.test.ts
    |-- forty-two-bidding.test.ts
    |-- forty-two-commands.test.ts
    |-- forty-two-deal.test.ts
    |-- forty-two-play-command.test.ts
    |-- forty-two-reducer.test.ts
    |-- forty-two-scoring.test.ts
    |-- forty-two-state.test.ts
    |-- forty-two-tricks.test.ts
    `-- forty-two-trump.test.ts
```

The mobile app still uses the scorekeeper engine, not the full Texas 42 rules modules.

## Implemented Rules Engine Capabilities

- Stable `EngineError` codes and command-result primitives.
- `EngineContext` injection for `now`, `newId`, and `random`.
- Standard `RuleConfig` and `standardRules` for marks scoring, target marks, numeric bid limits, all-pass behavior, table size, trick count, hand value, disabled variants, and trump behavior.
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
- Serializable `FortyTwoState` phase types for setup, dealt, bidding, trump, trick play, hand complete, and game complete.
- Initial full-game snapshot builder for local practice setup state.
- Forty Two action and event envelope types with schema version, actor, action ID, sequence, and timestamp fields.
- Core Forty Two event payload types for game created, hand dealt, bid submitted, bidding completed, trump called, domino played, trick completed, hand completed, and game completed.
- Event application and deterministic replay helpers for accepted Forty Two events.
- First Forty Two command handlers for create game, deal hand, submit bid, complete bidding, and call trump.
- Command handlers validate phase, stale snapshot/event metadata, and actor seat where applicable.
- Play-domino command validation and event emission.
- Automatic trick completion when the fourth domino is played.
- Trick winner derivation through the existing trick winner helper.
- Completed tricks are stored in `FortyTwoState`, and the next trick leader is set to the trick winner.

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
- Default rules and config-backed rule constants.
- Initial full-game snapshot serialization, dealer, teams, target marks, and setup phase.
- Deterministic Forty Two event replay across all core event types.
- Snapshot version and event sequence advancement during event application.
- Out-of-sequence event rejection.
- Command happy path through deal, bidding, bidding completion, and trump call.
- Command failure coverage for invalid phase, invalid declarer/actor, and invalid bid.
- Command-emitted events replay to the same state produced by command application.
- Play-command coverage for a valid four-play trick lifecycle.
- Play-command failures for invalid turn, missing domino, and must-follow-suit.
- Play-command winner coverage for trump and led-suit winners.
- Play-command replay coverage for completed-trick state.

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

- Command validation for hand completion and game completion actions.
- Dealer rotation and game-completion logic after a full rules hand.

This means the repository has implemented several later rules primitives and accepted-event scaffolding, with command coverage now extending through trick completion but not hand completion.

## Known Gaps

- `FortyTwoState` phase shapes exist, but no phase machine connects deal, bidding, trump, tricks, hand scoring, and marks.
- Commands validate and emit events through play and automatic trick completion; hand completion and game completion commands are still missing.
- The reducer applies already-accepted events, but it does not yet derive hand completion, marks, next dealers, or game completion.
- Rule constants now route through `standardRules`, but existing modules still expose compatibility constants.
- No local practice screen or app flow consumes the rules engine.
- No multiplayer-safe authority model is implemented in code.
- No AWS, AppSync, DynamoDB, Cognito, room state, or reconnect handling.
- No bots or bot decision interface.
- No variant contracts such as mark bids, 84, plunge, splash, nello, sevens, or follow-me.
- No runtime schema validation for serialized full-game snapshots or accepted-event payloads yet.
- No package-local test utilities for deterministic hands; tests currently build fixtures inline.

## Technical Risks

- The rules modules are individually tested, but there is no end-to-end hand lifecycle test from deal through hand scoring.
- `scoreCompletedHand` trusts caller-provided trick winners. The trick winner helper exists, but scoring does not yet derive winners from tricks and trump in an orchestrated flow.
- The trick model removes played dominoes from hands and completed tricks now accumulate through commands, but seven-trick hand completion is not orchestrated yet.
- The bidding, trump, trick, and scoring states are separate shapes. `FortyTwoState` can represent phases, but without command validation future callers could still compose invalid accepted-event streams.
- Constants are now behind `RuleConfig`, but variant-specific behavior still needs command-level enforcement.
- Current full-rules replay is deterministic for accepted events, and command slices through trick completion prove command-emitted events replay to the same state. Hand/game completion commands still need that proof.
- Full-hand mark awards are calculated, but not applied to a match score or game-complete state.
- Dealer rotation after a rules hand is not implemented outside scorekeeper mode.
- Test fixtures are becoming repetitive and may hide coupling as the engine grows.

## Recommended Next Work

1. Wire hand completion so seven completed tricks produce a hand score, mark awards, next dealer, and optional game completion.
2. Move repeated rules test fixtures into `packages/game-engine/src/test-utils`.
3. Add integration tests for a full seven-trick hand lifecycle.
4. Map full-rules events into the shared Action/Event/Snapshot contracts once local command validation is stable.
5. Defer AWS, multiplayer rooms, bots, tournaments, and UI until the local rules command/reducer path is stable.

## Architecture Notes

- The current separation between scorekeeper mode and full rules mode is still correct.
- The rules engine is pure TypeScript and remains UI-independent.
- The current implementation favors small functional modules, serializable state shapes, accepted-event replay, and narrow command slices over an early monolithic reducer. That has kept tests focused, but the next milestone needs hand-completion commands.
- The docs describe a future server-authoritative multiplayer engine. The code is not there yet, but the pure deterministic module boundary is compatible with that direction.
- The biggest remaining architecture deviation is sequence: later rule primitives were implemented before all command validation. `RuleConfig`, `FortyTwoState`, event envelopes, replay, setup/bidding/trump commands, and play/trick-completion commands now exist, so the next correction should validate hand/game completion into those events.
