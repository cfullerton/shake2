# Security and Abuse Model

## Risks

- Player submits action out of turn.
- Player tries to see another player's hand.
- Player replays old action.
- Player duplicates action after timeout.
- Player tampers with local state.
- Player joins room without permission.
- Player griefs by disconnecting.
- Client sends malformed payloads.

## Principles

- Server validates everything.
- Client state is untrusted.
- Authenticated identity maps to room membership.
- Private hand data is never broadcast to the whole room.
- Use idempotency for retries.
- Use sequence numbers for ordering.
- Use schema validation at API boundary.

## Authorization Checks

For every action: actor is authenticated, belongs to room, owns claimed seat, game is in correct phase, action is legal for phase, and action is not duplicate or conflicting.

## Logging

Log enough to debug action rejection, but do not log private hand contents in production.
