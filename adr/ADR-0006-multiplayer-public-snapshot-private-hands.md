# ADR-0006: Multiplayer Public Snapshots And Private Hands

Status: Accepted

Date: 2026-05-30

## Context

The Forty Two command layer needs full hands to validate bids, trump calls, and domino plays. Multiplayer clients must not receive other players' hands, and public subscriptions must not broadcast private hand data.

The first multiplayer session layer already exposes redacted player views, but durable records need the same boundary before DynamoDB or AppSync adapters exist.

## Decision

Persist multiplayer state as separate record shapes:

- Public latest snapshot record with public state and hand counts only.
- Private hand records keyed by game and seat.
- Trusted server event records for authoritative replay.
- Action idempotency records keyed by client action ID.

The backend adapter may reconstruct a trusted authoritative session by combining the public snapshot, private hand records, and trusted event log. Client reconnect should return a redacted player view, not raw authoritative state.

## Consequences

- The durable shape no longer depends on hiding full hands in UI code.
- Reconnect can safely refresh the player's latest view without leaking other seats.
- Backend resolvers still need IAM/AppSync authorization to keep private hand records readable only by the owning player and trusted server code.
- Runtime schemas and accepted-event validation are still required before accepting network payloads.
