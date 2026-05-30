# AWS Backend Architecture

## Timing

Do not create backend until action/event/snapshot contracts are stable and the M2/M3 rules engine is deterministic.

## Recommended Stack

- AWS Amplify Gen 2
- Amazon Cognito
- AWS AppSync
- AWS Lambda for validation/resolution where needed
- Amazon DynamoDB
- CloudWatch logs
- AWS CDK escape hatches when Amplify abstractions are insufficient

## Backend Workspace

```text
/backend
  amplify/
  src/
    functions/
      validateAction/
      materializeSnapshot/
    lib/
      game-engine-adapter.ts
      auth.ts
      errors.ts
```

## Server Authority

The server owns room creation, seat assignment, shuffle/deal, action validation, event sequencing, snapshot materialization, and reconnect state.

## Validation Path

```text
Client submits action
  -> AppSync mutation
  -> Lambda resolver validates auth + action
  -> rules engine validates legality
  -> DynamoDB conditional write appends event
  -> snapshot updated
  -> AppSync subscription notifies room
```

## Observability

Log roomId, gameId, actionId, actorId, actionType, result, errorCode, and latencyMs. Do not log private hands in production.
