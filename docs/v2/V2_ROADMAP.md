# V2 Roadmap

## Current State

Shake 2 has a working local scorekeeper MVP. The v2 goal is to move from a useful scorekeeper into a maintainable game platform foundation.

## Phase 1 — M1 Hardening

Objective: make the current local scorekeeper durable enough to ship and safe enough to extend.

Deliverables:

- Versioned local persistence envelope.
- Migration and corrupt-data handling.
- Strong validation for names, notes, marks, and target marks.
- Split engine modules: `types`, `scorekeeper`, `validation`, `selectors`, `events`, and `errors`.
- Baseline action/event/snapshot contracts.
- Persistence tests.
- UI tests for critical scorekeeper flows.
- CI running install, typecheck, tests, and audit.
- ADRs documenting current deviations.

Exit criteria:

- Saved local games survive app restart.
- Corrupt saved data does not crash the app.
- Scorekeeper flows are tested.
- Engine package is ready for domain expansion.

## Phase 2 — M2 Texas 42 Domain Model

Objective: model the physical game without UI or network dependencies.

Deliverables:

- Domino type.
- Double-six set generation.
- Count-domino scoring.
- Seat and partnership model.
- Dealer and deal order.
- Deterministic shuffle using injected seed/random source.
- Hand model.
- Trick model.
- Bid model.
- Trump model.
- Rule variant config.
- Unit tests for all invariants.

Exit criteria:

- Engine can create a legal 42 hand state.
- Engine can deal four valid hands of seven dominoes.
- Total domino count is always 28.
- Count points total 35.
- Hand total equals 42 when trick points are included.

## Phase 3 — M3 Rules Engine

Objective: support a full local hand of standard Texas 42.

Deliverables:

- Bidding validation.
- Winning bidder/declarer selection.
- Trump selection.
- Legal play validation.
- Follow-suit logic.
- Trick winner calculation.
- Hand scoring.
- Bid made/set evaluation.
- Mark award calculation.
- Replay from events.

Exit criteria:

- A full hand can be replayed deterministically from actions/events.
- Illegal plays are rejected.
- Bid outcome is correctly calculated.
- Rules tests cover edge cases.

## Phase 4 — M4 Local Practice

Objective: play a local game with one human and simple bots.

Deliverables:

- Local game UI.
- Basic legal-move bot.
- Simple bidding heuristic.
- Turn-by-turn play.
- Game review screen.

Exit criteria:

- One human can complete a full game against bots.
- Bot behavior is legal, even if not smart.

## Phase 5 — M5 Multiplayer Contracts

Objective: prepare backend contracts before backend implementation.

Deliverables:

- Room lifecycle.
- Auth identity mapping.
- Seat assignment.
- Action/event schemas.
- Event ordering.
- Snapshot versioning.
- Reconnect protocol.
- Timeout/disconnect rules.
- Duplicate action handling.
- Stale-client recovery.

Exit criteria:

- Mobile and backend can share contract package.
- Local simulator can test server-authoritative flow in-process.

## Phase 6 — M6 AWS Backend

Objective: deploy multiplayer infrastructure.

Deliverables:

- `/backend` workspace.
- Amplify Gen 2 project.
- Cognito auth.
- AppSync API.
- DynamoDB tables.
- Resolver/Lambda validation path.
- Deployment docs.
- Local/dev/prod environment strategy.

Exit criteria:

- Two clients can join a room and receive authoritative state.
- Server validates actions.
- Reconnect fetches snapshot and resumes play.
