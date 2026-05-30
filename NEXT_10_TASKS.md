# Next 10 Tasks

Last reviewed: 2026-05-30

These tasks are ordered to protect the future real-time multiplayer iOS goal while still moving through the roadmap sensibly.

## Completed Since Previous Review

- Versioned local scorekeeper persistence.
- Hardened scorekeeper validation.
- Split scorekeeper engine modules.
- Initial shared Action/Event/Snapshot contracts.
- Mobile persistence and scorekeeper flow tests.
- GitHub Actions CI.
- ADRs for local-first M1, server-authoritative event target, and scorekeeper mode separation.

## 1. Add Local Data Recovery UX

The persistence codec drops corrupt or unsupported data safely, but users need a visible recovery path. Add a reset/quarantine flow, explain what happened, and test it.

## 2. Mirror Validation Limits In The UI

The engine validates scorekeeper inputs. Add matching UI limits, counters, and clearer validation messages so users hit fewer generic alerts.

## 3. Add User-Controlled Game Management

Add delete, archive, and rename flows for local scorekeeper games before saved data grows.

## 4. Connect Contracts To Engine Results

The shared contracts exist, but the app still mutates local snapshots directly. Add scorekeeper command-result/event application helpers so local replay can be tested before backend work.

## 5. Expand Contract And Reconnect Tests

Add tests for duplicate action IDs, stale sequences, unsupported schema versions, reconnect snapshots, and event ordering.

## 6. Build The M2 Domino Domain Model

Implement pure TypeScript types and tests for dominoes, double-six set generation, shuffling/dealing via injected randomness, seats, hands, tricks, count domino values, and hand total invariants.

## 7. Implement M2 Rules Validation Incrementally

Add bidding, trump selection, legal play validation, trick winner determination, scoring, and bid evaluation as tested pure engine commands. Do not touch AWS or multiplayer until these rules are deterministic.

## 8. Design Multiplayer Authorization Before Backend

Create an authorization matrix for room membership, seat assignment, turn order, action type, phase, invite state, reconnect state, and admin actions.

## 9. Design Backend And Reconnect Protocols

Before creating `/backend`, write the room lifecycle and reconnect protocol:

- room creation/join/leave
- seat assignment
- invitation expiry
- authoritative action validation
- event sequence ordering
- snapshot fetch on reconnect
- duplicate action handling
- stale client recovery
- disconnect/timeout behavior

## 10. Strengthen Engineering Gates

Add linting, formatting, coverage thresholds, visual regression or screenshots, and an iOS end-to-end smoke suite before the app grows beyond M1.
