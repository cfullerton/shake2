# M2 Implementation Plan

Last reviewed: 2026-05-30

## Scope Definition

M2 should be engine-first and local-only. Do not add AWS, multiplayer, bots, infrastructure, or new app screens.

There is a scope mismatch in the docs:

- `ROADMAP.md` describes M2 as bidding, trump, tricks, scoring, and validation.
- `docs/v2/V2_ROADMAP.md` defines M2 as the physical Texas 42 domain model, with full local hand rules in the next phase.

This plan breaks the work into small Codex-sized phases. Phases 1-7 complete the strict v2 M2 domain model. Phases 8-14 extend into the top-level "Rules Engine" meaning of M2. Stop after Phase 7 if the project wants to follow the v2 roadmap literally.

## Phase 1: Engine Error And Context Primitives

Goal: add common pure-engine utilities without changing scorekeeper behavior.

Work:

- Add stable engine error type and error codes.
- Add `EngineContext` shape for injected `now`, `newId`, and `random`.
- Add minimal tests for error construction and context usage helpers.

Acceptance criteria:

- No app code changes.
- Existing scorekeeper tests still pass.
- Engine exports stable error/context primitives.
- No direct migration of scorekeeper commands yet.

## Phase 2: Domino Primitive

Goal: model one normalized domino.

Work:

- Add `Pip` and `Domino` types.
- Add normalized domino creation with `high >= low`.
- Add canonical domino key/string helpers.
- Add equality helpers.

Acceptance criteria:

- Invalid pips are rejected.
- `4-6` normalizes to `6-4`.
- Equivalent domino inputs produce the same key.
- Tests cover doubles, blanks, and invalid values.

## Phase 3: Double-Six Set And Count Scoring

Goal: model the physical domino set and count points.

Work:

- Generate the 28 unique double-six dominoes.
- Identify the five count dominoes.
- Score count points for a domino and a collection.

Acceptance criteria:

- Generated set has exactly 28 dominoes.
- No duplicate canonical keys exist.
- Count domino total is exactly 35.
- Non-count dominoes score 0.

## Phase 4: Full-Game Seat And Partnership Model

Goal: add full Texas 42 seat helpers without replacing scorekeeper seats.

Work:

- Add `SeatIndex` model for seats 0-3.
- Add partnership helpers: seats 0/2 and 1/3.
- Add clockwise next-seat/dealer helpers.
- Add bid-order helper starting after dealer.

Acceptance criteria:

- Seat helpers do not require React Native or scorekeeper state.
- Dealer rotation is deterministic for all four seats.
- Bid order starts clockwise after dealer.
- Partnership tests cover all seats.

## Phase 5: Standard Rule Config

Goal: encode standard Texas 42 defaults and variant flags.

Work:

- Add `RuleConfig` and `standardRules`.
- Include target marks, minimum bid, all-pass behavior, enabled contracts, and trump behavior.
- Validate supported M2/M3 config.

Acceptance criteria:

- Standard rules match `docs/v2/TEXAS_42_RULES_SPEC.md`.
- Unsupported variant flags are explicit and default to false.
- Minimum bid defaults to 30.
- Target marks defaults to 7.

## Phase 6: Deterministic Shuffle

Goal: support reproducible ordering without calling `Math.random()` in engine logic.

Work:

- Add shuffle helper that accepts injected random source.
- Add deterministic test random source under `test-utils`.
- Keep seed/PRNG choice simple and documented.

Acceptance criteria:

- Same random source produces same shuffled set.
- Shuffled set preserves all 28 unique dominoes.
- Engine shuffle code does not call `Math.random()` directly.

## Phase 7: Deal Model And Hand Ownership

Goal: create legal four-player hands.

Work:

- Deal 28 shuffled dominoes into four hands of seven.
- Associate hands with `SeatIndex`.
- Add hand summary/selectors that do not leak future private-hand assumptions into UI.

Acceptance criteria:

- Four hands are produced.
- Each hand has exactly seven dominoes.
- No domino appears in more than one hand.
- Total dealt dominoes equals 28.
- This phase completes strict v2 M2 domain-model exit criteria.

## Phase 8: Full-Hand State Skeleton

Goal: create the local full-game state shape before adding rules.

Work:

- Add `FortyTwoState` with phase, dealer, seats, teams, hands, rule config, and hand number.
- Add initial snapshot builder using injected context and dealt hands.
- Keep scorekeeper state separate.

Acceptance criteria:

- A legal full-hand snapshot can be created entirely in `packages/game-engine`.
- Snapshot is serializable JSON.
- Existing scorekeeper exports still work.
- Tests prove initial phase/dealer/hand ownership.

## Phase 9: Numeric Bidding

Goal: implement standard numeric bidding only.

Work:

- Add bid call types for pass and numeric bids 30-42.
- Validate turn order and increasing bid amounts.
- Implement all-pass dealer-forced 30 behavior.
- Select declarer when bidding completes.

Acceptance criteria:

- Minimum bid is 30.
- Bids must increase.
- Out-of-turn bids are rejected.
- All-pass forces dealer bid of 30.
- Declarer is highest bidder.
- No mark bids, 84, splash, plunge, sevens, or nello.

## Phase 10: Trump Call And Led Suit Model

Goal: model trump and led-suit choices before trick validation.

Work:

- Add pip-suit trump model.
- Add trump ranking helpers.
- Add led-suit selection for non-double dominoes.
- Validate that only declarer can call trump at the correct phase.

Acceptance criteria:

- Declarer can call one pip suit as trump.
- Non-declarer trump calls are rejected.
- Trump dominoes rank high-to-low according to standard rules.
- Led suit is explicit when a non-trump domino has two possible suits.

## Phase 11: Trick Play Validation

Goal: enforce legal plays for one trick.

Work:

- Add current trick state.
- Validate whose turn it is.
- Validate domino ownership.
- Validate follow-suit behavior under standard trump rules.
- Remove played domino from the player's hand.

Acceptance criteria:

- Out-of-turn play is rejected.
- A player cannot play a domino they do not hold.
- A player holding led suit cannot slough.
- Trump dominoes are treated as trump under default config.
- Legal plays advance trick state.

## Phase 12: Trick Winner And Captured Points

Goal: complete one trick deterministically.

Work:

- Determine trick winner.
- Capture trick dominoes for the winning team.
- Award one trick point plus count domino points.
- Set next trick leader.

Acceptance criteria:

- Highest trump wins when trump is played.
- Highest led-suit domino wins when no trump is played.
- Captured count dominoes add correct points.
- Winner leads next trick.
- Tests cover trump, no-trump, and count-capture cases.

## Phase 13: Hand Completion And Mark Scoring

Goal: score a complete seven-trick hand.

Work:

- Detect seven completed tricks.
- Sum trick points and count points by team.
- Enforce total hand value of 42.
- Evaluate made/set numeric bid.
- Award one mark to bidding team or opponents under standard rules.

Acceptance criteria:

- Hand cannot complete before seven tricks.
- Sum of team hand points is 42.
- Made bid exactly is accepted.
- Set by one point awards opponents.
- Dealer rotates for next hand.
- Mark target can complete a game.

## Phase 14: Events And Replay For Full-Hand Rules

Goal: prove deterministic replay for local rules before backend work.

Work:

- Add full 42 event types for deal, bid, trump, play, trick complete, hand complete, and game complete.
- Add reducer/apply-event functions.
- Add replay helper for full-game snapshots.
- Add fixture-driven replay tests.

Acceptance criteria:

- A full hand can be replayed from an initial snapshot and event sequence.
- Replaying the same events produces the same snapshot.
- Illegal actions do not produce events.
- Event payloads are serializable and compatible with shared contract direction.

## Phase 15: M2 Edge-Case Test Pass

Goal: harden the rules foundation before any UI, bots, or backend.

Work:

- Add table-driven tests for required edge cases from `TEXAS_42_RULES_SPEC.md`.
- Add fixture builders for common hands, bids, and tricks.
- Add regression tests for any ambiguous rule decisions discovered during implementation.

Acceptance criteria:

- Required edge-case tests from the v2 rules spec are covered or explicitly deferred.
- `npm run typecheck` passes.
- `npm test` passes.
- No AWS, multiplayer, bot, or app UI code is added.
