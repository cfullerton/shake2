# Shake 2

Shake 2 is a mobile app for Texas 42: useful first as a local scorekeeper, and growing into a full rules-driven game with practice bots and online multiplayer.

The project is intentionally built around one idea: the game rules should live in a pure TypeScript engine, not in screens, storage code, or cloud resolvers. The mobile app can render the game and collect player intent, while the engine stays deterministic, testable, and reusable for local play, backend validation, bots, replay, and reconnect flows.

## What Is Here

- `apps/mobile` is the Expo React Native app with scorekeeper, local practice, learn, lobby, and active multiplayer screens.
- `packages/game-engine` contains scorekeeper logic, the Texas 42 rules engine, local bot practice, and backend-neutral multiplayer authority modules.
- `packages/shared` holds shared TypeScript contracts for app/backend boundaries.
- `backend` contains AppSync/Lambda resolver shells, DynamoDB adapters, and deployed smoke-test tooling.
- `infra` contains the CDK development stack for Cognito, AppSync, Lambda, and DynamoDB.
- `docs` and `adr` explain the product plan, architecture choices, status, and future direction.

## Current Shape

The scorekeeper and local rules engine are the solid center of the repo. Local scorekeeping works offline with saved games, dealer rotation, undo, and history. Local practice can run Texas 42 hands against legal-random bots. Multiplayer has a tested foundation for rooms, seats, redacted public snapshots, private hands, idempotent actions, reconnect views, and AppSync/DynamoDB development infrastructure, but production multiplayer still needs more lifecycle, retry, reconnect UX, and hardening.

## Quick Start

```sh
npm install
npm run typecheck
npm test
npm run start
```

Useful focused commands:

```sh
npm run test -w @shake2/game-engine
npm run typecheck -w @shake2/mobile
npm run test -w @shake2/backend
npm run synth -w @shake2/infra
```

Deployments are manual. Do not put secrets in the repo; local `.env` files and smoke-test credentials should stay local.

## Working Principles

- Keep business logic outside UI screens.
- Test engine rules and multiplayer authority behavior before relying on them elsewhere.
- Treat multiplayer clients as untrusted; server-authoritative events and snapshots are the source of truth.
- Keep public snapshots separate from private hands.
- Update docs and ADRs when architecture changes.

## Documentation Index

Most project documentation lives under this directory. `AGENTS.md` intentionally stays at the repository root because agent tooling reads it there.

## Project

- `project/PROJECT.md`
- `project/ARCHITECTURE.md`
- `project/ROADMAP.md`
- `project/BACKLOG.md`

## Status

- `status/PROJECT_STATUS.md`
- `status/RULES_ENGINE_STATUS.md`
- `status/ENGINE_CONFIDENCE_REPORT.md`
- `status/MISSING_RULES.md`
- `status/EDGE_CASE_AUDIT.md`
- `status/MULTIPLAYER_READINESS_REPORT.md`

## Reviews

- `reviews/ARCHITECTURE_REVIEW.md`
- `reviews/SECURITY_REVIEW.md`
- `reviews/TESTING_GAPS.md`
- `reviews/NEXT_10_TASKS.md`
- `reviews/V2_REVIEW.md`
- `reviews/V2_GAP_ANALYSIS.md`
- `reviews/VARIANT_READINESS_REVIEW.md`

## Plans

- `plans/M2_IMPLEMENTATION_PLAN.md`
- `plans/FULL_HAND_INTEGRATION_TEST_PLAN.md`

## References

- `42-rules.md`
- `AWS_WEB_HOSTING.md`
- `BOT_STRATEGY.md`
- `DATABASE_SCHEMA.md`
- `GAME_STATE_MODEL.md`
- `MULTIPLAYER_ARCHITECTURE.md`

## Architecture Decision Records

ADRs remain in `../adr`.
