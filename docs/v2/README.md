# Shake 2 V2 Architecture Package

## Purpose

This package defines the next architecture layer for Shake 2 after the local scorekeeper MVP.

It is intentionally **spec-first**. Do not implement all of this at once.

The next implementation sequence should be:

1. Finish M1 hardening: versioned persistence, validation, engine module split, action/event/snapshot contracts, persistence/UI tests, CI, and ADRs.
2. Implement the M2 Texas 42 domain model and rules engine.
3. Only after the rules engine is deterministic and tested, introduce backend infrastructure.

## Guiding Principles

- Keep the rules engine pure TypeScript.
- Keep scorekeeper mode local-first and useful offline.
- Treat multiplayer as server-authoritative.
- Store immutable game events where possible.
- Use snapshots for fast reconnect and rendering.
- Design for bad mobile network behavior from day one.
- Keep regional 42 variants explicit and configurable.
- Do not let UI screens become the source of game truth.

## Documents

- `V2_ROADMAP.md`
- `TEXAS_42_RULES_SPEC.md`
- `GAME_ENGINE_ARCHITECTURE.md`
- `ACTION_EVENT_SNAPSHOT_CONTRACT.md`
- `MULTIPLAYER_STATE_MACHINE.md`
- `AWS_BACKEND_ARCHITECTURE.md`
- `DYNAMODB_DATA_MODEL.md`
- `APPSYNC_API_DESIGN.md`
- `RECONNECT_AND_SYNC_PROTOCOL.md`
- `BOT_ARCHITECTURE.md`
- `TESTING_STRATEGY.md`
- `SECURITY_AND_ABUSE_MODEL.md`
- `IOS_RELEASE_PLAN.md`
- `CODEX_IMPLEMENTATION_PLAN.md`

## Non-Goals For Immediate Next Step

Do not implement AWS, online multiplayer, bots, tournaments, leaderboards, or push notifications until M2 rules are complete and tested.
