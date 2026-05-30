# ADR-0007: Validated Accepted Event Restore

Status: Accepted

Date: 2026-05-30

## Context

The Forty Two reducer intentionally trusts accepted events. That is safe only when events are produced by trusted command handlers. Durable multiplayer restore and future reconnect endpoints may read records from storage, migrations, or network boundaries, so those events need runtime validation before they become authoritative state again.

## Decision

Add a validated replay path for Forty Two events. Boundary restore code must validate event envelopes, event payload shape, event sequence, and derived rule facts before applying events.

Validation recomputes high-risk derived values including:

- Bidding state after submitted bids.
- Trump state and starting trick after trump is called.
- Domino play hand/trick transitions.
- Trick winners.
- Hand scores and mark awards.

Multiplayer restore must compare the validated replay result with the stored latest snapshot before returning an authoritative session.

## Consequences

- Command-emitted streams still replay normally.
- Forged stored events, forged trick winners, forged hand scores, and inconsistent latest snapshots are rejected before reconnect or server restore.
- Runtime schema coverage is still intentionally focused on the current standard numeric rules path. Broader network payload schemas and migration/version tooling remain future work.
