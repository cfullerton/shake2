# Multiplayer Dev Smoke Runbook

Last reviewed: 2026-05-31

## Purpose

This runbook verifies that a deployed development stack can authenticate a Cognito user, invoke each AppSync resolver, and reach the Lambda/DynamoDB boundary without exposing private game data.

The default smoke path does not create gameplay data or multiplayer UI. The optional seeded path writes disposable gameplay records so action, reconnect, and subscription delivery can be tested against live data.

## Prerequisites

- AWS credentials for a disposable development account or sandbox.
- CDK bootstrap completed for the target account/region.
- The `shake2-dev-multiplayer-infra` stack deployed from `infra/`.
- A temporary smoke-test Cognito user, or permission to let the smoke script create one.

## Deploy

From the repository root:

```text
npm run typecheck
npm test
npm run synth -w @shake2/infra
npm run build -w @shake2/infra
npm run cdk -w @shake2/infra -- deploy --app "node dist/app.js" -c stage=dev
```

No deploy command runs automatically.

## Smoke Test

Set the smoke variables in your shell, or copy `backend/.env.example` to `backend/.env` and edit the local file. The smoke runner loads `backend/.env` automatically when present. Do not commit real values.

```text
export AWS_REGION=us-east-1
export SHAKE2_SMOKE_STACK_NAME=shake2-dev-multiplayer-infra
export SHAKE2_SMOKE_EMAIL=smoke@example.com
export SHAKE2_SMOKE_USERNAME=smoke-user
export SHAKE2_SMOKE_PASSWORD='temporary-password'
```

Use a non-email smoke username. The Cognito pool stores email as a required verified attribute/alias; the username itself is only a sign-in handle. The backend uses Cognito `sub` as the multiplayer `playerId`, so changing the username format has no gameplay or ownership implication.

The smoke mutation sends the action envelope as a JSON-encoded string because AppSync validates `AWSJSON` variables before invoking Lambda. The deployed Lambda handler accepts both this encoded form and already-parsed action objects.

If the script should create or reset the smoke Cognito user:

```text
export SHAKE2_SMOKE_CREATE_USER=true
```

Then run:

```text
npm run smoke:deployed -w @shake2/backend
```

For the larger live-data smoke path:

```text
export SHAKE2_SMOKE_SEED_GAME=true
```

That path writes a disposable started game into DynamoDB, submits one legal pass bid through AppSync as the authenticated Cognito user, submits the same action again to prove idempotency, reads the public snapshot, reads the actor private hand, verifies another seat's private hand is rejected, and checks reconnect pending-action classification. `SHAKE2_SMOKE_SEEDED_GAME_ID` is optional; omit it for a generated one-time game ID.

To include live AppSync subscription delivery in the seeded path:

```text
export SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION=true
```

Subscription validation requires `SHAKE2_SMOKE_SEED_GAME=true`. The runner opens `onGameUpdated(gameId)` over the AppSync realtime endpoint, waits for `start_ack`, submits the seeded legal action through the GraphQL HTTPS endpoint, and verifies the WebSocket `data` payload includes the accepted action, root `gameId`, safe event summaries, and a redacted public snapshot.

If `SHAKE2_SMOKE_CREATE_USER=true`, seeded mode also creates or resets a derived second user and proves that authenticated non-members cannot read the seeded public snapshot or private hand. To use a pre-existing second user instead, set:

```text
export SHAKE2_SMOKE_SECONDARY_EMAIL=smoke-nonmember@example.com
export SHAKE2_SMOKE_SECONDARY_USERNAME=smoke-nonmember-user
export SHAKE2_SMOKE_SECONDARY_PASSWORD='temporary-password'
```

## What The Smoke Test Proves

- AppSync rejects unauthenticated `submitGameAction` calls.
- Cognito authentication returns an ID token accepted by AppSync.
- `submitGameAction` uses Cognito identity rather than a client-claimed actor ID.
- `getGameSnapshot`, `getMyPrivateHand`, and `getReconnectView` invoke their Lambda resolvers.
- Missing smoke game data returns controlled GraphQL errors instead of exposing private records.
- With `SHAKE2_SMOKE_SEED_GAME=true`, the deployed stack can persist and read a real started game, accept a legal action, return an idempotent duplicate result, enforce private-hand ownership, and classify accepted/unknown pending actions during reconnect.
- With `SHAKE2_SMOKE_VALIDATE_SUBSCRIPTION=true`, the deployed stack can deliver the accepted seeded action through `onGameUpdated` without exposing private hand data.
- With a secondary smoke user, the deployed stack rejects authenticated non-members from seeded public snapshot and private-hand reads.

## Expected Result

The command prints JSON with `ok: true` and one entry per smoke check.

By default, the read resolver checks intentionally use a missing game ID. That avoids seeding real hands while still proving the deployed Lambda and DynamoDB read path is wired. The optional seeded mode creates real smoke records in the multiplayer table.

## Cleanup

For a disposable dev stack:

```text
npm run cdk -w @shake2/infra -- destroy --app "node dist/app.js" -c stage=dev
```

Confirm the stack and any smoke Cognito users are removed before leaving a sandbox environment idle.

## Known Limits

- Subscription validation covers one accepted seeded action; it does not test mobile gap detection or reconnect recovery from missed messages.
- Does not yet exercise the organic create/join/take-seat/start AppSync room flow.
- Seeded mode starts a real room/game and submits one bid, but does not complete a full hand or game.
- Does not test DynamoDB transaction cancellation mapping.
- Does not replace the local backend and engine test suite.
