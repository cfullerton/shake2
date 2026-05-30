# Edge Case Audit

Last reviewed: 2026-05-30

## Summary

The standard local rules path has strong edge-case coverage. The engine rejects common invalid actions through command handlers and proves complete-hand invariants through integration and simulation tests.

The weak edge is not normal local gameplay. The weak edge is trust at boundaries: externally sourced events, persisted snapshots, hidden information, duplicate action IDs, and unsupported variants.

## Audit Table

| Area | Edge case | Status | Evidence or next action |
|---|---|---:|---|
| Dominoes | Invalid pip values | Partial | Type-level model and helpers exist; add runtime schema checks at persistence/network boundaries. |
| Dominoes | Reversed domino input | Covered | Normalized domino model and canonical key helpers. |
| Dominoes | Duplicate double-six set entries | Covered | Tests prove exactly 28 unique dominoes. |
| Dominoes | Count domino total | Covered | Tests prove total count points equal 35. |
| Deal | Wrong number of players | Covered for standard | Rule config fixes four seats; no variable table-size mode implemented. |
| Deal | Wrong hand size | Covered | Tests prove 7 dominoes per seat. |
| Deal | Duplicate or missing dealt domino | Covered | Tests prove all 28 dominoes are dealt once. |
| Deal | Nondeterministic shuffle | Covered locally | Shuffle uses injected `EngineContext.random`. Persisted/server seed protocol is missing. |
| Seats | Invalid seat index | Covered in helpers | Seat assertions exist. Add runtime envelope schema validation for external inputs. |
| Seats | Partner/team mapping | Covered | Tests cover seats `0/2` vs `1/3`. |
| Seats | Dealer rotation | Covered | Unit, integration, and local-session tests cover rotation. |
| Bidding | Bid before deal | Covered | Command phase validation rejects invalid phase. |
| Bidding | Out-of-turn bid | Covered | Bidding helper validates order. |
| Bidding | Bid below 30 | Covered | Unit tests cover invalid low bid. |
| Bidding | Bid over 42 | Covered | Unit tests cover over-42 bid. |
| Bidding | Non-increasing bid | Covered | Unit tests cover equal/lower follow-up bid. |
| Bidding | Bid after one opportunity | Covered | Bidding order exhausts after four bids. |
| Bidding | All pass | Covered | Dealer is forced to bid 30. |
| Bidding | Redeal all pass | Missing | Config type mentions `"redeal"`, but no command behavior exists. |
| Trump | Non-declarer calls trump | Covered | Command/helper validation rejects invalid actor/declarer. |
| Trump | Trump called before bidding complete | Covered | Phase validation rejects invalid phase. |
| Trump | Invalid trump suit | Partial | Type-level union exists; runtime schema validation is still needed. |
| Trump | Double-high trump ranking | Covered | Tests cover double-high ranking. |
| Trump | Trump identity over off-suit identity | Covered for default | Tests and helpers use default trump identity behavior. Variant behavior is not implemented. |
| Trick play | Play before trump | Covered | Command phase validation rejects non-`trickPlay`. |
| Trick play | Invalid turn | Covered | Tests cover invalid turn. |
| Trick play | Domino not in hand | Covered | Tests cover missing domino. |
| Trick play | Leader omits led suit | Covered | Helper requires led suit on first play. |
| Trick play | Leader chooses lower suit for two-pip domino | Covered | Local standard play canonicalizes led suit to the higher pip and rejects lower-suit leads. |
| Trick play | Leader chooses illegal led suit | Covered | Helper validates led suit for led domino. |
| Trick play | Player sloughs while holding led suit | Covered | Tests cover must-follow failures. |
| Trick play | Player sloughs when unable to follow | Covered | Tests cover legal sloughing. |
| Trick play | Highest trump wins | Covered | Unit and command tests cover trump winner. |
| Trick play | Highest led suit wins when no trump | Covered | Unit and command tests cover led-suit winner. |
| Trick play | Played domino remains in hand | Covered | Reducer state updates hands from command-emitted events. |
| Trick play | Next trick leader | Covered | Trick-completed event starts next trick with winner. |
| Hand scoring | Fewer than seven tricks | Covered | Scoring rejects incomplete hand; integration tests cover six tricks not completing. |
| Hand scoring | More than seven tricks | Covered indirectly | Automatic lifecycle completes at seven; add explicit forged-event validation before multiplayer. |
| Hand scoring | Duplicate captured domino | Covered in scoring helper | Scoring rejects duplicate captured dominoes. |
| Hand scoring | Missing captured domino | Covered in scoring helper | Scoring requires all 28 dominoes. |
| Hand scoring | Total points not 42 | Covered | Tests prove total 42 and scoring rejects impossible complete hands. |
| Hand scoring | Made exactly | Covered | Unit and integration tests cover exact made bid. |
| Hand scoring | Made over target | Covered | Unit and integration tests cover made-over. |
| Hand scoring | Set by one | Covered | Unit and integration tests cover set by one. |
| Hand scoring | All count dominoes captured | Covered | Unit tests cover all count dominoes captured by bidding team. |
| Hand scoring | No count dominoes captured | Covered | Unit tests cover no count dominoes captured by bidding team. |
| Marks | Made bid mark award | Covered | Command/reducer tests cover bidding-team mark. |
| Marks | Set bid mark award | Covered | Command/reducer tests cover opposing-team mark. |
| Marks | Game reaches target | Covered | Command and session tests cover target-mark completion. |
| Events | Sequence must advance by one | Covered | Reducer rejects out-of-sequence events. |
| Events | Wrong game ID | Covered | Reducer rejects event for different game. |
| Events | Unsupported event schema version | Covered | Reducer checks event schema version. |
| Events | Duplicate action ID | Missing | Event envelope carries `actionId`, but no idempotency store rejects or replays duplicates. |
| Events | Forged trick winner | Missing | Reducer accepts `TRICK_COMPLETED` payloads. Add accepted-event validation. |
| Events | Forged hand score | Missing | Reducer accepts `HAND_COMPLETED` payloads. Add accepted-event validation. |
| Events | Replay mismatch | Covered for command streams | Full-hand and session tests compare replayed state to command-applied state. |
| Snapshots | JSON serialization | Covered for initial/full paths | Tests cover serializable snapshots. Runtime schema/migration still missing. |
| Snapshots | Corrupt persisted state | Missing | Full-rules persistence does not exist yet. |
| Local session | Human can start game | Covered | Session tests and UI wiring exist. |
| Local session | Restart/reset | Covered | Session tests cover restart. |
| Local session | Continue after hand summary | Covered | Session tests advance across hands. |
| Local session | Infinite bot loop | Covered by guard | Session loop has a 500-step guard; simulations exercise it. |
| Bots | Bot returns legal bid/trump/play | Covered by selectors/simulations | Add direct per-phase legality table tests as bot sophistication grows. |
| Bots | Bot cannot see hidden hands | Missing | Bot receives full snapshot. Introduce redacted bot input DTOs. |
| UI | Complete game by user | Partial | Minimal flow exists, but robust UI automation is not in place. |
| UI | App reload during local game | Missing | Full-rules local practice is in-memory only. |

## Highest Priority Edge Fixes

1. Add accepted-event validation before any event can enter durable storage or server replay.
2. Add runtime schemas and migrations for all full-rules snapshots and event envelopes.
3. Add idempotency handling for duplicate `actionId` values.
4. Redact hidden information at the bot/client boundary.
5. Add local full-rules persistence with corruption and unsupported-version tests.
6. Add UI integration tests for start, bid, trump call, trick play, hand summary, game summary, restart, and app reload behavior.

## Multiplayer-Specific Edge Cases Not Yet Solved

- Two clients submit actions for the same turn at the same time.
- A stale client submits a legal-looking action based on an old hand.
- A client retries an action after a network timeout.
- A client reconnects after multiple events were accepted.
- A client receives a snapshot that must hide other players' hands.
- A server deploy introduces a new snapshot/event schema version.
- An accepted event stream is partially persisted and must be recovered or rejected.
- A disputed hand needs correction after an accepted but incorrect table action.

## Bottom Line

The engine is ready for continued local-play iteration and UI hardening. It is not ready to be treated as a multiplayer authority until accepted-event validation, runtime schemas, idempotency, persistence, and hidden-information boundaries are added.
