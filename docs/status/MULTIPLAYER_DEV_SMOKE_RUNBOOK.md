# Multiplayer Dev Smoke Runbook

Last reviewed: 2026-05-30

## Purpose

This runbook verifies that a deployed development stack can authenticate a Cognito user, invoke each AppSync resolver, and reach the Lambda/DynamoDB boundary without exposing private game data.

It does not create gameplay data or multiplayer UI.

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
export SHAKE2_SMOKE_USERNAME=smoke@example.com
export SHAKE2_SMOKE_PASSWORD='temporary-password'
```

If the script should create or reset the smoke Cognito user:

```text
export SHAKE2_SMOKE_CREATE_USER=true
```

Then run:

```text
npm run smoke:deployed -w @shake2/backend
```

## What The Smoke Test Proves

- AppSync rejects unauthenticated `submitGameAction` calls.
- Cognito authentication returns an ID token accepted by AppSync.
- `submitGameAction` uses Cognito identity rather than a client-claimed actor ID.
- `getGameSnapshot`, `getMyPrivateHand`, and `getReconnectView` invoke their Lambda resolvers.
- Missing smoke game data returns controlled GraphQL errors instead of exposing private records.

## Expected Result

The command prints JSON with `ok: true` and one entry per smoke check.

The read resolver checks intentionally use a missing game ID. That avoids seeding real hands while still proving the deployed Lambda and DynamoDB read path is wired.

## Cleanup

For a disposable dev stack:

```text
npm run cdk -w @shake2/infra -- destroy --app "node dist/app.js" -c stage=dev
```

Confirm the stack and any smoke Cognito users are removed before leaving a sandbox environment idle.

## Known Limits

- Does not validate live subscription delivery.
- Does not seed a full multiplayer room or complete a game.
- Does not test DynamoDB transaction cancellation mapping.
- Does not replace the local backend and engine test suite.
