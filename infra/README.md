# Multiplayer Infrastructure

This workspace contains the CDK v2 development infrastructure for multiplayer Texas 42.

## What It Defines

- Cognito User Pool and public app client.
- DynamoDB multiplayer table with `pk`/`sk`, TTL, point-in-time recovery, and GSIs for current/near-term access patterns, including normalized uppercase room invite-code lookup and open public-room listing.
- Eleven Lambda functions:
  - `createRoom`
  - `joinRoom`
  - `takeSeat`
  - `startGame`
  - `getRoom`
  - `getRoomByCode`
  - `listPublicRooms`
  - `submitGameAction`
  - `getGameSnapshot`
  - `getMyPrivateHand`
  - `getReconnectView`
- AppSync GraphQL API using `backend/src/appsync/schema.graphql`.
- Lambda data sources and resolvers for the current mutation/query fields.
- IAM execution roles and DynamoDB grants.

## Local Commands

From the repository root:

```text
npm run typecheck -w @shake2/infra
npm run test -w @shake2/infra
npm run synth -w @shake2/infra
```

The synth command builds the CDK app and bundles Lambda entrypoints with esbuild. It does not deploy resources.

After deploying a disposable development stack, run the backend smoke test:

```text
npm run smoke:deployed -w @shake2/backend
```

See `docs/status/MULTIPLAYER_DEV_SMOKE_RUNBOOK.md` for required environment variables.

## Configuration

The default stage is `dev`. Override it with CDK context:

```text
npm run cdk -w @shake2/infra -- synth --app "node dist/app.js" -c stage=dev
```

Lambda environment variables are injected by the stack:

```text
SHAKE2_MULTIPLAYER_TABLE_NAME
SHAKE2_PUBLIC_ROOMS_INDEX_NAME
SHAKE2_ROOM_CODE_INDEX_NAME
SHAKE2_ROOM_GAME_ID_INDEX_NAME
AWS_REGION
```

For local resolver tests or manual local scripts, copy `backend/.env.example` and provide development values.

## Deployment

This slice intentionally does not deploy automatically. When ready:

```text
npm run build -w @shake2/infra
npm run cdk -w @shake2/infra -- deploy --app "node dist/app.js" -c stage=dev
```

Use an AWS profile/role with permission to create Cognito, DynamoDB, AppSync, Lambda, IAM, CloudWatch Logs, and CDK assets.

## Not Implemented

- No production stage hardening.
- No custom domain.
- No WAF/rate limiting.
- No Cognito-hosted UI or app auth flow.
- No deployed room-flow smoke coverage yet.
