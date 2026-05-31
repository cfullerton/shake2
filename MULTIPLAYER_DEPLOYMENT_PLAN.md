# Multiplayer Deployment Plan

## AWS Resources

The CDK stack in `infra/` defines the development multiplayer environment:

- Cognito User Pool for authenticated players.
- Cognito App Client for the Expo app.
- DynamoDB multiplayer table for rooms, open public-room listings, game events, public snapshots, private hands, and idempotency results.
- AppSync GraphQL API using `backend/src/appsync/schema.graphql`.
- Lambda resolvers for room lifecycle/game-start operations, public-room listing, `submitGameAction`, `getGameSnapshot`, `getMyPrivateHand`, and `getReconnectView`.
- IAM roles for Lambda execution and DynamoDB access.

## Deployment Flow

1. Install workspace dependencies with `npm install`.
2. Run local verification:
   ```text
   npm run typecheck
   npm test
   npm run synth -w @shake2/infra
   ```
3. Bootstrap the AWS account/region once:
   ```text
   npm run cdk -w @shake2/infra -- bootstrap aws://ACCOUNT_ID/REGION --app "node dist/app.js"
   ```
4. Deploy the development stack:
   ```text
   npm run build -w @shake2/infra
   npm run cdk -w @shake2/infra -- deploy --app "node dist/app.js" -c stage=dev
   ```
5. Capture stack outputs for app configuration:
   - GraphQL API URL
   - GraphQL API ID
   - Cognito User Pool ID
   - Cognito App Client ID
   - DynamoDB table name
6. Run the deployed smoke test:
   ```text
   npm run smoke:deployed -w @shake2/backend
   ```

No deployment is run automatically by this repository.

## Local Testing

Backend contract tests remain local and do not require AWS credentials:

```text
npm run test -w @shake2/backend
```

Infrastructure tests synthesize the CDK construct tree locally and assert the expected resource wiring:

```text
npm run test -w @shake2/infra
```

The deployed smoke test requires a deployed stack and Cognito test user configuration:

```text
AWS_REGION
SHAKE2_SMOKE_STACK_NAME
SHAKE2_SMOKE_EMAIL
SHAKE2_SMOKE_USERNAME
SHAKE2_SMOKE_PASSWORD
SHAKE2_SMOKE_CREATE_USER
SHAKE2_SMOKE_SECONDARY_EMAIL
SHAKE2_SMOKE_SECONDARY_USERNAME
SHAKE2_SMOKE_SECONDARY_PASSWORD
```

`docs/status/MULTIPLAYER_DEV_SMOKE_RUNBOOK.md` has the full smoke-test flow.

For manual local resolver experiments, copy `backend/.env.example` and set:

```text
AWS_REGION
SHAKE2_MULTIPLAYER_TABLE_NAME
SHAKE2_PUBLIC_ROOMS_INDEX_NAME
SHAKE2_ROOM_CODE_INDEX_NAME
SHAKE2_ROOM_GAME_ID_INDEX_NAME
```

## Security Validation

Current tests verify:

- Public snapshot responses do not expose private hands.
- Room lifecycle responses do not expose raw Cognito/player IDs.
- Public snapshot reads require authenticated room membership.
- Private hand resolver responses require actor/seat ownership.
- Cognito `sub` is propagated as the backend multiplayer `playerId`.
- Rejected player actions persist idempotency results without game-state mutations.
- DynamoDB transaction cancellation reasons are mapped to stable backend errors for duplicate action, stale action, and persistence conflicts.
- The deployed smoke script can validate AppSync auth, Cognito ID-token flow, Lambda resolver invocation, the optional seeded gameplay/read/reconnect path, and secondary-user non-member read denial once a dev stack exists.

Required before production:

- AppSync resolver integration tests against deployed Cognito identities.
- DynamoDB retry policy and integration coverage for transaction cancellation behavior.
- Rate limiting or WAF protection for public API traffic.
- Resolver log review to ensure private hands are never emitted.

## Production Rollout

1. Deploy a disposable `dev` stack.
2. Smoke test Cognito sign-in, AppSync authorization, and Lambda resolver execution.
3. Run a seeded multiplayer game through backend-only scripts.
4. Add frontend multiplayer room/session screens behind a feature flag.
5. Add operational dashboards and alarms.
6. Add stricter production removal policies, retention, WAF/rate limiting, and incident runbooks.
7. Promote to a production stack only after reconnect and room lifecycle behavior is proven.
