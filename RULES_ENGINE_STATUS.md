# Rules Engine Status Report

Last reviewed: 2026-05-30

## Executive Summary

The rules engine has moved beyond scorekeeper-only support and now contains the core local Texas 42 rule primitives for dominoes, seating, dealing, numeric bidding, trump, trick legality, trick winners, full-hand scoring, mark awards, dealer advancement, and game completion.

The implementation is now a focused local command/reducer path through `PLAY_DOMINO`: a fourth play completes a trick, the seventh completed trick completes the hand, scoring is applied, marks are awarded, and the game completes when target marks are reached. M3 Phase 1 adds a local playable session layer, legal-random bots, and a minimal mobile practice flow. The first multiplayer implementation adds a backend-neutral authoritative room/session layer, but it is still not wired into persistence, AWS, auth, realtime transport, mobile multiplayer UI, advanced bots, or variants.

## Current Package Boundary

Rules code lives in `packages/game-engine/src` and is exported through `packages/game-engine/src/index.ts`.

Current rules-related layout:

```text
packages/game-engine/src
|-- bots/
|   `-- legal-random.ts
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
|   |-- legal-actions.ts
|   |-- reducer.ts
|   |-- rules-config.ts
|   |-- scoring.ts
|   |-- seats.ts
|   |-- state.ts
|   |-- tricks.ts
|   `-- trump.ts
|-- local-play/
|   `-- session.ts
|-- multiplayer/
|   `-- session.ts
`-- __tests__/
    |-- dominoes.test.ts
    |-- engine-primitives.test.ts
    |-- forty-two-bidding.test.ts
    |-- forty-two-commands.test.ts
    |-- forty-two-deal.test.ts
    |-- forty-two-full-hand-integration.test.ts
    |-- forty-two-play-command.test.ts
    |-- forty-two-reducer.test.ts
    |-- forty-two-scoring.test.ts
    |-- forty-two-state.test.ts
    |-- forty-two-tricks.test.ts
    |-- forty-two-trump.test.ts
    |-- local-play-session.test.ts
    `-- multiplayer-session.test.ts
```

The mobile app now has two local modes: the original scorekeeper flow and a minimal local practice flow backed by the full Texas 42 rules modules.

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
- Canonical led-suit selection for local play: a non-trump domino always leads its higher pip suit.
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
- Automatic hand completion when the seventh trick is completed.
- `HAND_COMPLETED` event emission with a full `HandScore`.
- Mark awards applied to match score through the reducer.
- Non-terminal hand completion prepares the next hand by rotating dealer, incrementing hand number, clearing current-hand data, and returning to setup.
- Target-mark detection and `GAME_COMPLETED` event emission.
- Terminal game state records the winning team and completion timestamp.
- Legal-action selectors for bids, trump calls, and domino plays.
- Legal-random bot that only chooses actions exposed as legal by the engine.
- Local game-session layer that creates games, manages human/bot seats, advances bot turns, dispatches engine commands, exposes session views, supports hand continuation, and supports restart.
- Minimal mobile local-practice screens for start, bidding, trump selection, trick play, hand summary, and game summary.
- Backend-neutral multiplayer room/session layer for room creation, join, four-seat assignment, ready/in-game/completed status, and host-only game start.
- `FortyTwoState.mode` now supports `multiplayer` snapshots in addition to `localPractice`.
- Multiplayer session starts games with server-managed `GAME_CREATED` and `HAND_DEALT` events.
- Multiplayer action submission validates room membership and seat ownership before routing bid, trump, and domino actions through the Forty Two command layer.
- Multiplayer action submission records action results by `actionId` for idempotent duplicate retries.
- Multiplayer session automatically emits `BIDDING_COMPLETED` after the fourth bid.
- Multiplayer player views redact `hands`, expose public hand counts, and include only the viewer's own hand.
- Multiplayer storage records split room metadata, trusted event records, public latest snapshots, private hand records, and action idempotency records.
- Multiplayer storage restore rebuilds an authoritative in-memory session from records and verifies the trusted event log can replay to the restored snapshot.
- Multiplayer reconnect views return a redacted player snapshot plus accepted, rejected, and unknown pending action IDs.

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
- Play-command full-hand coverage for automatic hand completion after seven tricks.
- Made-bid and set-bid mark awards through command/reducer application.
- Dealer rotation after a non-terminal hand.
- Game completion at target marks.
- Replay coverage for post-hand state.
- End-to-end command-layer full-hand integration coverage from game creation and deal through bidding, trump, all 28 plays, hand completion, mark awards, dealer rotation, game completion, and replay.
- Full-hand integration cases for normal made bids, exact 42 bids, set-by-one bids, trump-heavy hands, no-trump-played led-suit tricks, all-pass dealer-forced bidding, multiple dealer rotations, and target-mark game completion.
- Local session tests for start, restart/reset, dealer rotation, 100 completed simulated hands, and 25 completed simulated games.
- Simulation assertions for replay equality, possible hand scores, mark awards, and game completion.
- Multiplayer session tests for room seating, host-only start, server-managed initial deal, invalid seat claims, bidding auto-completion, duplicate action ID idempotency, hidden-hand redaction, and replay equality.
- Multiplayer storage tests for public/private hand separation, full session restore, accepted/rejected pending-action reconnect handling, missing private-hand rejection, and replay equality.

Latest known verification before this report:

```text
npm run typecheck -w @shake2/game-engine
npm run test -w @shake2/game-engine
```

Both passed after the first multiplayer storage/reconnect slice.

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
- Accepted-event envelopes and reducer replay.
- Command validation through create, deal, bid, complete bidding, call trump, and play domino.
- Automatic trick completion, hand completion, mark awards, next-hand setup, and game completion from the play command.
- Local playable session with legal-random bots.
- Minimal mobile practice UI for human-vs-bot local games.

Still missing from the plan:

- A standalone `COMPLETE_HAND` command is not implemented; hand completion is currently automatic after the seventh completed trick.
- Shared deterministic full-hand test fixtures should be extracted once the integration cases settle.
- Local practice state is in-memory only and is not persisted.

This means the repository has implemented and tested the core local hand lifecycle through the command layer, but fixtures should still be consolidated before UI or server-authoritative multiplayer depends on it.

## Known Gaps

- There is no standalone `COMPLETE_HAND` command; this is acceptable for the current automatic lifecycle but should be an explicit ADR or implementation note if retained.
- Rule constants now route through `standardRules`, but existing modules still expose compatibility constants.
- Local practice screen consumes the rules engine, but only as an in-memory vertical slice.
- A multiplayer-safe authority and storage model has started in code, but it is backend-neutral only.
- No AWS, AppSync, DynamoDB, Cognito, physical durable room state, or deployed reconnect endpoint exists.
- Only legal-random bots exist; no heuristic or advanced strategy exists.
- No variant contracts such as mark bids, 84, plunge, splash, nello, sevens, or follow-me.
- No runtime schema validation for serialized full-game snapshots or accepted-event payloads yet.
- No package-local test utilities for deterministic hands; integration tests currently build fixtures inline.
- No persistence adapter exists for full-rules snapshots/events.
- No physical multiplayer event log, snapshot table, private-hand table, or idempotency table exists yet.
- Multiplayer redaction exists for player views, but bots and local practice still use full snapshots.

## Technical Risks

- The rules modules now have end-to-end command tests from actual dealt hands through hand scoring, but the deterministic fixture helpers are still test-local.
- `scoreCompletedHand` trusts caller-provided trick winners. The trick winner helper exists, but scoring does not yet derive winners from tricks and trump in an orchestrated flow.
- The play command derives trick winners before scoring, but accepted events can still contain externally supplied trick winners; server-authoritative validation must reject forged or inconsistent streams before persistence.
- The bidding, trump, trick, scoring, and next-hand transitions are connected for the local command path, but accepted-event replay intentionally trusts accepted events.
- Constants are now behind `RuleConfig`, but variant-specific behavior still needs command-level enforcement.
- Current full-rules replay is deterministic for accepted events, and command-emitted events replay to the same state through post-hand and game-complete outcomes.
- Test fixtures are becoming repetitive and may hide coupling as the engine grows.
- Game completion currently follows automatic hand completion; a future manual adjudication or admin correction path would need separate command design.
- The mobile local-practice UI intentionally exposes a simple single-screen flow and does not persist in-progress games.

## Recommended Next Work

1. Move repeated rules test fixtures into `packages/game-engine/src/test-utils`.
2. Document the automatic hand-completion decision in an ADR or implementation note if a standalone `COMPLETE_HAND` command remains intentionally omitted.
3. Add accepted-event validation or command-side consistency checks before any server-authoritative persistence path.
4. Add local-practice persistence or explicit resume/discard UX if practice games should survive app restarts.
5. Add runtime schemas and accepted-event validation before accepting network-sourced multiplayer payloads.
6. Build the physical AWS adapter for room/event/snapshot/private-hand/idempotency records.
7. Defer advanced bots, tournaments, and analytics until standard multiplayer is stable.

## Architecture Notes

- The current separation between scorekeeper mode and full rules mode is still correct.
- The rules engine is pure TypeScript and remains UI-independent.
- The current implementation favors small functional modules, serializable state shapes, accepted-event replay, and narrow command slices over an early monolithic reducer. Hand completion is currently automatic from `PLAY_DOMINO`, which keeps the normal rules path simple but should be documented before server-authoritative multiplayer work.
- The docs describe a future server-authoritative multiplayer engine. The new backend-neutral multiplayer session and storage modules are the first code-level steps in that direction, but they still need runtime schemas, accepted-event validation, auth, physical persistence, and deployed reconnect handling before production use.
- The biggest remaining architecture deviation is sequence: later rule primitives were implemented before all command validation. `RuleConfig`, `FortyTwoState`, event envelopes, replay, setup/bidding/trump commands, play/trick-completion commands, and automatic hand/game completion now exist, so the next correction should harden full-hand integration fixtures and accepted-event validation boundaries.
