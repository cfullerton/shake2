# Full Hand Integration Test Plan

Last updated: 2026-05-30

## Purpose

Add command-level integration tests that prove a full local Texas 42 hand can run from game creation through deal, bidding, trump call, seven tricks, hand scoring, mark awards, next-hand setup, and optional game completion.

The goal is not to add UI, multiplayer, AWS, bots, variants, or persistence. The goal is to harden the pure rules engine before anything else depends on it.

## Current Coverage

Existing tests already cover:

- Individual domino, count-scoring, seat, team, dealer, deal, bidding, trump, trick, and hand-scoring helpers.
- Command happy path through create, deal, bid, complete bidding, and trump call.
- Play-command trick lifecycle from crafted `trickPlay` snapshots.
- Automatic hand completion after seven completed tricks from crafted `trickPlay` snapshots.
- Made/set mark awards, dealer rotation, game completion, and replay for those crafted full-hand snapshots.

The main gap is that no test currently runs the whole hand from `CREATE_GAME` and `DEAL_HAND` through all 28 legal plays using command handlers only.

## Test Harness Work

Create shared test utilities under `packages/game-engine/src/__tests__/` or `packages/game-engine/src/test-utils/` once the patterns stabilize.

Recommended helpers:

- `createScriptedEngineContext`: deterministic `newId`, `now`, and `random`.
- `createActionEnvelope`: command action builder with actor seat, snapshot version, and last event sequence.
- `runCommand`: unwraps successful command results and preserves typed failures for negative tests.
- `collectEvents`: accumulates emitted event envelopes across command calls.
- `playScript`: applies an ordered list of seat/domino/led-suit plays through `handlePlayFortyTwoDominoCommand`.
- `assertReplayMatches`: replays collected events from the initial snapshot and compares with command-applied state.

Avoid mutating snapshots directly in integration tests. Directly crafted states are still useful for narrow unit tests, but these integration tests should exercise the public command layer.

## Fixture Strategy

Use deterministic dealing so the full-hand play scripts are stable.

Preferred approach:

1. Start with `handleCreateFortyTwoGameCommand`.
2. Use `handleDealFortyTwoHandCommand` with a deterministic `EngineContext.random`.
3. Verify the dealt hands match an expected fixture.
4. Bid, complete bidding, and call trump through command handlers.
5. Play the fixture hand through command handlers.

If the current shuffle makes a readable fixture awkward, first add a small test-only helper that finds or documents a deterministic random sequence for the desired hands. Do not add production-only hooks for test dealing.

## Required Integration Scenarios

1. **Made Bid, Next Hand Prepared**

   Acceptance criteria:

   - Commands run from `CREATE_GAME` through `DEAL_HAND`, bidding, trump, and 28 plays.
   - Exactly seven `fortyTwo.trick.completed` events are emitted.
   - Exactly one `fortyTwo.hand.completed` event is emitted.
   - No `fortyTwo.game.completed` event is emitted.
   - Hand score totals 42.
   - Bidding team receives one mark.
   - Dealer rotates.
   - Hand number increments.
   - Final phase is `setup`.
   - Current-hand data is absent from setup state.
   - Replay produces the same final snapshot.

2. **Set Bid, Opposing Mark Awarded**

   Acceptance criteria:

   - Commands run from `CREATE_GAME` and `DEAL_HAND` through a complete hand.
   - Bidding team points are below bid amount.
   - Hand outcome is `set`.
   - Opposing team receives one mark.
   - Final phase is `setup` unless target marks are reached.
   - Replay produces the same final snapshot.

3. **Target Marks Complete Game**

   Acceptance criteria:

   - Game starts with `targetMarks: 1`.
   - A made or set hand awards the decisive mark.
   - `fortyTwo.hand.completed` is emitted before `fortyTwo.game.completed`.
   - Final phase is `gameComplete`.
   - Winning team is correct.
   - Completion timestamp is serialized.
   - Replay produces the same final snapshot.

4. **Six Tricks Do Not Complete Hand**

   Acceptance criteria:

   - After 24 legal plays and six completed tricks, no `fortyTwo.hand.completed` event exists.
   - Final phase remains `trickPlay`.
   - Completed-trick count is six.
   - Hands still contain four total dominoes.

5. **Invalid Final Trick Does Not Score**

   Acceptance criteria:

   - An invalid seventh-trick play returns a typed `EngineError`.
   - No `HAND_COMPLETED` or `GAME_COMPLETED` event is emitted.
   - Snapshot remains unchanged from before the rejected command.

## Additional Assertions

Every full-hand integration test should assert:

- Event sequences are strictly monotonic.
- Snapshot versions advance by the number of emitted events.
- All final snapshots are JSON-serializable.
- Every played domino came from the active player's dealt hand.
- All hands are empty after a completed hand.
- No duplicate domino is captured across completed tricks.

## Risks To Watch

- A deterministic shuffle fixture can become opaque. Prefer documenting the resulting hands and play script in the test file.
- Tests that infer a full play script dynamically may accidentally duplicate engine logic. Keep scripts explicit where possible.
- Accepted-event replay intentionally trusts accepted events. Integration tests should verify command-emitted event streams, not manually forged event streams.
- Automatic hand completion means there may never be a standalone `COMPLETE_HAND` command. If that remains the design, document it in an ADR before multiplayer work.

## Done Criteria

This plan is complete when:

- At least three command-level full-hand integration tests exist: made bid, set bid, and game complete.
- The six-trick non-completion guard exists.
- Replay equality is proven for every full-hand success case.
- Tests run in the game-engine package without UI or network dependencies.
- `npm run test -w @shake2/game-engine` and `npm run typecheck -w @shake2/game-engine` pass.
