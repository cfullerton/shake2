# Security Review

Last reviewed: 2026-05-30

## Executive Assessment

The current app has a small security surface because it is local-only and has no secrets, auth, backend, network calls, or user accounts. That will change dramatically once real-time multiplayer, Cognito, AppSync, DynamoDB, invitations, and reconnects are added. The codebase should not treat the current client-authoritative scorekeeper model as a security foundation for multiplayer.

## Current Security Posture

- No secrets are present in source files reviewed.
- No AWS resources, credentials, API keys, Cognito config, or AppSync endpoints exist.
- All game data is stored locally in AsyncStorage.
- Player/team names and notes are user-provided local strings only.
- There is no authentication or authorization.
- There are no outbound app network calls in the source.
- CI now reports dependency audit findings, but the audit step is non-blocking because the current Expo transitive advisory has no safe fix path in this repo yet.

## Dependency Findings

`npm audit --audit-level=moderate` reports 10 moderate vulnerabilities through Expo's transitive dependency chain:

- Advisory: `uuid <11.1.1` missing buffer bounds check in v3/v5/v6 when `buf` is provided.
- Path includes `uuid -> xcode -> @expo/config-plugins -> @expo/cli/expo`.
- `npm audit fix --force` suggests installing `expo@46.0.21`, which is a breaking downgrade and should not be applied blindly.

Recommendation: track this as an accepted temporary development dependency risk, monitor Expo updates, and avoid force-fixing into an older/broken Expo SDK.

## Current Risks

1. AsyncStorage is not secure storage.

Current saved games are not sensitive, but future auth tokens, refresh tokens, private room secrets, invite tokens, or user identifiers must not be stored in AsyncStorage unless the platform guidance explicitly permits it. Use secure token handling through the auth provider/platform storage.

2. User input limits are local-only.

Game names, team names, player names, notes, target marks, timestamps, and mark awards now have engine-level validation. Future multiplayer must duplicate/enforce equivalent limits server-side.

3. Local persisted data recovery is minimal.

The persistence codec validates nested saved-game shape and drops invalid data. There is still no quarantine, audit, or user-facing recovery path.

4. Client-side validation would be insufficient for multiplayer.

The engine currently rejects invalid local marks, but any real multiplayer action must be revalidated server-side with authenticated actor context and current authoritative state.

5. IDs are not security-grade.

`Date.now()` plus `Math.random()` is fine for local prototype identifiers, but not for room IDs, invite codes, user IDs, event IDs, or replay protection.

6. No abuse model exists.

Future multiplayer needs rate limits, room membership checks, action authorization, invite expiry, reconnect throttling, and anti-spam controls.

7. No privacy model exists.

The project has no data classification for player names, game history, stats, invites, or eventual community features.

## Multiplayer Security Requirements

- Authenticate every multiplayer action.
- Authorize every action against room membership, seat assignment, game phase, and turn order.
- Server validates all bids, plays, joins, leaves, reconnects, and score transitions.
- Use server-generated event IDs and monotonically increasing per-game sequence numbers.
- Make client actions idempotent with client action IDs.
- Expire invitation links/codes and bind them to intended room behavior.
- Use least-privilege DynamoDB/AppSync access.
- Prevent clients from writing snapshots directly.
- Keep audit trails for accepted game events.
- Validate string lengths and accepted character ranges on client and server.
- Avoid logging sensitive auth/session material.

## Recommended Security Tasks

1. Mirror scorekeeper input limits in UI affordances and future server validation.
2. Replace local ID generation with an injectable ID provider and use `crypto.randomUUID` where available.
3. Add user-facing recovery for invalid local persistence data.
4. Create a security-focused multiplayer action authorization matrix.
5. Define data classes: public profile data, private account data, room membership data, game event data, analytics data.
6. Decide token/session storage strategy for Cognito on iOS before implementing auth.
7. Design invite codes as short-lived, server-generated, single-room scoped capabilities.
8. Add backend security tests before exposing multiplayer writes.
9. Create a policy for dependency updates and Expo SDK upgrades.
10. Make dependency audit blocking once the Expo transitive advisory has a safe upgrade path.
