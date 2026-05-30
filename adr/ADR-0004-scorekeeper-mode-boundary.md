# ADR-0004: Scorekeeper Mode Boundary

Status: Accepted

Date: 2026-05-30

## Context

The product roadmap starts with a local scorekeeper and later adds full Texas 42 rules, practice bots, multiplayer rooms, tournaments, and community features. Scorekeeper state tracks marks, dealer, history, teams, and players. Full Texas 42 gameplay will require dominoes, bidding, trump, tricks, legal play validation, bid evaluation, player identity, room membership, connection state, and variant configuration.

Trying to stretch the M1 scorekeeper model into the full multiplayer game model would blur concerns and make future server authority harder.

## Decision

Keep scorekeeper mode as a distinct product and domain boundary. Scorekeeper logic lives in `packages/game-engine/src/scorekeeper`. Future full-game rules should be added beside it in separate modules rather than by overloading scorekeeper types.

Shared contracts may include scorekeeper actions and events, but full-game actions and events should get their own payload types and validation paths.

## Consequences

- M1 stays simple and useful without pretending to enforce full Texas 42.
- Local scorekeeper games can remain local-only even after multiplayer exists.
- Full-game rules can be modeled with deterministic state, events, and validation without preserving every M1 shortcut.
- UI navigation can later separate local scorekeeper flows from practice and multiplayer room flows.
