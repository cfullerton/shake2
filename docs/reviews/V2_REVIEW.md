# V2 Review

Last reviewed: 2026-05-30

## Summary

The v2 architecture package is a strong target architecture, especially because it repeatedly says not to implement everything at once. Its best ideas are the pure deterministic engine, local-first scorekeeper separation, server-authoritative multiplayer target, immutable events, reconnect snapshots, and explicit rule variants.

The main risk is scope gravity. The v2 package contains enough AWS, AppSync, DynamoDB, reconnect, room, bot, and abuse-model detail to distract from the immediate next milestone: a deterministic Texas 42 rules engine. M2 should stay inside `packages/game-engine` and, where needed, `packages/shared`.

## Good Assumptions

- Spec-first sequencing is correct. The docs explicitly defer AWS, multiplayer, bots, tournaments, leaderboards, and push notifications until the rules engine is deterministic and tested.
- The game engine should remain pure TypeScript, independent of UI, AsyncStorage, AWS, and network APIs.
- Scorekeeper mode should remain separate from full Texas 42 gameplay. This matches the accepted ADR and avoids forcing a simple local scorekeeper into a room/gameplay schema.
- Multiplayer should eventually be server-authoritative. Client state should not be trusted for turns, private hands, trick winners, hand scores, or mark awards.
- Immutable events plus snapshots are the right model for reconnect and auditability.
- Mobile reconnect is treated as a first-class product constraint. The docs correctly assume subscriptions can be missed.
- Rule variants should be explicit configuration rather than hidden conditionals.
- Private player hands need a separate data/security model from public room snapshots.
- Bot logic should use the same legal-action engine as humans and should never bypass validation.
- The testing pyramid is right: engine tests first, then contracts, persistence, React Native tests, integration, and E2E smoke tests.

## Assumptions That Conflict With Current Code

- The v2 engine architecture assumes command functions validate actions and emit events. Current scorekeeper commands in `packages/game-engine/src/scorekeeper/commands.ts` return updated `ScorekeeperGame` snapshots directly.
- The v2 architecture assumes reducers and replay helpers. Current engine modules have no `events.ts`, `reducer.ts`, `replay/`, `snapshots.ts`, or `migrations.ts`.
- The v2 docs assume stable engine error codes. Current engine validation throws raw `Error` messages, and mobile UI catches message strings.
- The v2 dependency-injection rule says core engine logic should not call clock, ID, random, storage, or network APIs directly. Current `GameStore` still calls `new Date()`, `Date.now()`, and `Math.random()` for local IDs/timestamps, and `createPersistedScorekeeperGames` defaults to `new Date()`.
- The v2 action envelope uses `clientCreatedAt`, `knownSnapshotVersion`, `knownLastEventSequence`, `actorSeat`, and nested `action`. Current shared contracts use `submittedAt`, `type`, and `payload`, with no known-snapshot fields.
- The v2 event envelope uses `serverCreatedAt`, optional `causationActionId`, and nested `event`. Current shared events use `occurredAt`, required `actionId`, `type`, and `payload`.
- The v2 snapshot envelope uses `snapshotVersion`, `lastEventSequence`, `generatedAt`, and nested `snapshot`. Current `GameSnapshot` uses `snapshotId`, `lastEventSequence`, `createdAt`, and `state`.
- The v2 docs use numeric `SeatIndex`; current scorekeeper code uses string seats: `north`, `east`, `south`, `west`.
- The v2 scorekeeper actions include archive/delete. Current app has create, award, undo, and history, but no delete/archive/rename game management.
- The v2 M1 hardening list includes corrupt-data handling. Current persistence drops invalid local data safely, but there is no user-facing recovery, reset, or quarantine flow.
- The v2 CI gate lists `npm audit --audit-level=moderate`. Current CI runs audit as non-blocking because the Expo transitive `uuid/xcode` advisory has no safe fix path yet.
- ADR-0004 now has a single accepted file for the scorekeeper/full-game boundary.

## Overengineering

- The AWS/AppSync/DynamoDB design is useful for M5/M6, but too concrete for M2. It should not influence M2 module shapes beyond keeping contracts serializable and server-safe.
- Room lifecycle, spectators, invite behavior, host bot replacement, and disconnect penalties are premature until the local rules engine exists.
- Bot architecture is directionally good, but bot strategy should not be implemented until legal actions and full-hand replay are complete.
- Private-hand DynamoDB records are correct for future multiplayer, but they are not needed for M2 unless they distort the in-memory hand model.
- A full event-sourced scorekeeper refactor would be overkill unless it directly supports shared replay primitives for the full rules engine.
- Adding every folder from the recommended engine layout at once would create empty architecture. M2 should add folders only when a tested domain concept needs them.
- Regional variants like nello, sevens, splash, plunge, mark bids, and 84 are useful to name, but implementing them before standard numeric-bid Texas 42 would slow the core path.

## Missing Details

- M2 scope is inconsistent across docs. `docs/project/ROADMAP.md` says M2 is "Bidding, trump, tricks, scoring, validation"; `docs/v2/V2_ROADMAP.md` says M2 is the physical domain model and M3 is full rules. This needs a working definition before implementation.
- The SeatIndex model needs an explicit mapping to current string seats and partnerships.
- Domino serialization needs a canonical key/string format for snapshots, events, tests, and future API payloads.
- The docs do not define a deterministic shuffle algorithm, seed shape, or whether tests should use a seeded PRNG helper versus an injected ordered random stream.
- Deal order needs exact rules: who receives first domino, how hands are ordered, and whether output should be sorted for stable snapshots.
- Bidding needs phase-state details: pass tracking, bidder order after each call, all-pass forced dealer bid event shape, and completed-bidding snapshot shape.
- Led-suit selection needs sharper rules for non-double dominoes and trump interactions, especially around a domino that belongs to two suits.
- Trick state needs exact payloads for played dominoes, led suit, winner, captured count dominoes, and next leader.
- Mark scoring should define whether only one mark is possible for numeric bids in standard mode, even on a 42 bid.
- Runtime contract validation strategy is missing. TypeScript guards exist, but future API boundaries need a stricter schema approach.
- Migration strategy from current shared contracts to the v2 envelopes is not defined.
- Local scorekeeper save compatibility with future mode-discriminated snapshots is not specified.
- Engine fixture and test-utils conventions are not specified.
- ADR process should keep using one file per number so future decisions do not duplicate ADR numbers or statuses.
