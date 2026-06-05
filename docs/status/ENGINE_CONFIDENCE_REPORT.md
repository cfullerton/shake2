# Engine Confidence Report

Last reviewed: 2026-06-01

## Summary

Confidence is high for the local, standard, numeric-bid Texas 42 command path. The engine can create a game, deal, bid, force the dealer on all-pass hands, call trump, play seven tricks, score a hand, award marks, rotate the dealer, complete a game, and replay command-emitted events deterministically. Confidence is early but growing for no-trump and mark-bid variants now that both are behind explicit rule flags and have focused engine/API/mobile tests.

Multiplayer confidence has improved with runtime boundary parsing, validated replay before persisted writes/restores, AppSync/DynamoDB adapters, and active-game UI, but it still needs broader deployed smoke coverage and reconnect/pending-action hardening. Local practice remains in-memory only, and the bot/session boundary does not yet enforce hidden-information limits by construction.

## Confidence Matrix

| Area | Confidence | Evidence | Residual risk |
|---|---:|---|---|
| Domino model | High | Normalized pip model, canonical keys, double-six set tests, count domino tests. | Runtime validation is compile-time only unless callers use constructors/helpers. |
| Count scoring | High | Five count dominoes are identified; count total is proven as 35. | None for standard double-six rules. |
| Seats and teams | High | Seat `0-3`, teams `0/2` vs `1/3`, dealer and bid-order tests. | No player identity/seat-claiming model yet. |
| Shuffle and deal | High | Deterministic shuffle uses `EngineContext.random`; tests prove 7 dominoes to 4 seats and all 28 dealt once. | No persisted shuffle seed or server-verifiable shuffle protocol yet. |
| Numeric and mark bidding | High for numeric, medium for mark bids | Tests cover minimum 30, maximum 42, increasing numeric bids, turn order, all-pass dealer-forced bid, declarer selection, mark-bid gating, opening one/two-mark bids, one-mark ladder progression, and numeric rejection after mark bids. | `RuleConfig.bidding.allPassBehavior: "redeal"` exists as a type but behavior is not implemented. Mark bids still need broader full-hand fixtures and deployed multiplayer smoke coverage. |
| Trump model | High for standard pip trump and early no-trump | Tests cover each suit, declarer-only calls, phase validation, trump identity, double-high ranking, and no-trump contract calls. | Follow-me, nello, sevens, splash, plunge, and 84 behavior are not implemented. |
| Trick legality | High for standard rules, medium for no-trump | Tests cover invalid turn, missing domino, led suit legality, must-follow, sloughing, trump winners, led-suit winners, and no-trump led-suit behavior. | No-trump needs broader fixture coverage; other variant behavior is not implemented yet. |
| Hand scoring | High for command-emitted standard hands, medium for mark bids | Tests cover made exact, made over target, set by one, count capture extremes, total 42 points, and made/set mark bids. | Mark bids need more declarer/team fixture coverage. |
| Mark scoring and game completion | High locally | Tests cover mark awards, mark-bid multi-mark awards, dealer rotation, target marks, and game-complete event emission. | No standalone adjudication/correction command. |
| Event replay | High for accepted, command-emitted streams | Replay tests prove deterministic state for command-emitted event streams through full hands and games. | Reducer intentionally trusts accepted events; it does not prove that accepted events were valid. |
| Local session layer | Medium-high | Session tests cover start, restart, dealer rotation, 100 completed hands, and 25 completed games. | Session is in-memory only and is not resumable after process/app restart. |
| Legal-random bots | Medium-high for legality | Bots choose from legal-action selectors; simulation tests complete many hands/games without illegal states. | Bot input receives the full snapshot, so hidden information is a convention, not an enforced boundary. |
| Mobile local practice UI | Medium | Minimal screens are wired to the local session and compile. | Browser click-through smoke was not fully automated; no robust UI integration suite yet. |
| Scorekeeper mode | Medium-high | Existing scorekeeper tests still pass. | Scorekeeper and full-rules mode remain separate and need clear product navigation as both grow. |
| Persistence | Low for full rules | Scorekeeper persistence exists; full-rules session has no persistence adapter. | Cannot resume local full games or recover event streams. |
| Multiplayer/AWS | Not implemented | Out of scope so far. | Needs authority, idempotency, schema validation, persistence, reconnect, and hidden-information controls before use. |

## Strong Evidence

- The engine package has focused unit tests for dominoes, seats, dealing, bidding, trump, tricks, scoring, state, reducer replay, commands, and local play.
- Full-hand integration tests exercise the command layer from game creation through deal, bidding, trump, all 28 plays, automatic hand completion, mark awards, dealer rotation, game completion, and replay.
- Local simulation tests run 100 completed hands and 25 completed games through the local session and legal-random bots.
- The latest status report records passing workspace verification with `npm run typecheck` and `npm run test` after the local playable vertical slice.

## Confidence Blockers

1. Accepted-event validation is missing.

   `applyFortyTwoEvent` checks schema version, game ID, and sequence, but it does not revalidate event payload consistency. A forged `TRICK_COMPLETED` event can name an incorrect winner, and a forged `HAND_COMPLETED` event can supply precomputed scoring. That is fine only if events are produced by trusted command handlers and never accepted from clients.

2. Runtime schemas are missing.

   TypeScript types describe actions, events, snapshots, dominoes, seats, and rule configs, but external data from persistence or network boundaries needs runtime validation and migration before replay.

3. Full-rules persistence is missing.

   Local practice can play a game, but the game disappears on reload/app restart. There is no event log or full-rules snapshot adapter yet.

4. Hidden information is not enforced for bots.

   The legal-random bot chooses actions from legal selectors, but its input includes the full snapshot, including all hands. That is acceptable for V1 tests, but not acceptable as a hard architecture boundary.

5. Variant behavior is partially modeled; no-trump and mark bids are implemented behind explicit rules.

   `RuleConfig` exposes future switches such as redeal all-pass behavior and variant contracts. Command logic currently implements standard numeric, no-trump, and mark-bid behavior; other variant flags remain placeholders.

6. UI confidence lags engine confidence.

   The mobile local-practice flow is intentionally minimal. It needs UI tests around bidding, trump selection, trick play, summaries, restart, and long-game completion.

## Recommended Confidence Gates

Before multiplayer or durable full-rules persistence:

1. Add an accepted-event validator that recomputes derived winners, hand scores, mark awards, and game winners before persistence/replay of externally sourced events.
2. Add runtime schemas for action envelopes, event envelopes, snapshots, rule config, dominoes, seats, bids, trump calls, tricks, and hand scores.
3. Add full-rules event-log/snapshot persistence with versioned migrations and corrupt-state recovery.
4. Introduce bot/player view DTOs so bots and clients cannot access hidden hands by construction.
5. Extract shared full-hand fixtures and deterministic simulation helpers into `packages/game-engine/src/test-utils`.
6. Add mobile UI integration tests for the local playable flow.
7. Document the automatic hand-completion decision in an ADR if it remains the intended architecture.
