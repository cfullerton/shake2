# Codex Implementation Plan

## Important

Do not ask Codex to implement the whole v2 package at once.

## Prompt 1 — Review V2 Package

```text
Read all files in docs/v2 and adr.

Do not code yet.

Create V2_REVIEW.md with:
- assumptions you agree with
- assumptions you disagree with
- conflicts with current code
- missing details
- recommended implementation order
```

## Prompt 2 — Domino Domain

```text
Read docs/v2/TEXAS_42_RULES_SPEC.md and docs/v2/GAME_ENGINE_ARCHITECTURE.md.

Implement only the domino domain model:
- Pip
- Domino
- normalized domino creation
- double-six set generation
- count domino scoring
- total count invariant tests

Do not implement bidding, trump, tricks, bots, AWS, or UI.
```

## Prompt 3 — Contracts

```text
Read docs/v2/ACTION_EVENT_SNAPSHOT_CONTRACT.md.

Implement shared action/event/snapshot contracts and error codes.

Do not add AWS or multiplayer UI.

Add tests for JSON compatibility and invalid schema handling.
```

## Prompt 4 — Deal and Seat Model

```text
Implement only seats, teams, dealer rotation, deterministic shuffle/deal using injected randomness, and hand ownership.

Add tests proving 28 unique dominoes, 4 hands of 7, no duplicates, and dealer/bid order rules.
```

## Prompt 5 — Bidding

```text
Implement numeric bidding only: minimum bid 30, pass, increasing bids, all-pass dealer forced bid, and declarer selection.

Add tests for all bidding edge cases.
```

## Prompt 6 — Trump and Trick Validation

```text
Implement trump call, led suit selection, legal follow-suit validation, and trick winner calculation. Use default standard rules only.
```
