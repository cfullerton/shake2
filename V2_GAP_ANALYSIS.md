# V2 Gap Analysis

Last reviewed: 2026-05-30

## Current Repository Baseline

The repository currently contains:

- `apps/mobile`: Expo React Native scorekeeper app with local state, AsyncStorage persistence, navigation, scorekeeper screens, and React Native Testing Library coverage.
- `packages/game-engine`: pure TypeScript scorekeeper commands, validation, selectors, dealer helpers, persistence codecs, and Node tests.
- `packages/shared`: initial TypeScript contracts for scorekeeper-focused actions, events, snapshots, results, and error codes.
- `.github/workflows/ci.yml`: CI for install, typecheck, tests, and non-blocking audit reporting.
- `docs/v2`: spec package for the next architecture layer.
- `adr`: accepted local-first, server-authoritative, and scorekeeper-boundary decisions, plus a duplicate proposed ADR-0004 file.

There is no `/backend`, no full Texas 42 rules engine, no bot engine, no room state machine, no AppSync API, and no DynamoDB model implementation.

## Gap Matrix

| Area | Current repository | V2 target | Missing components | Difficulty | Technical risk |
|---|---|---|---|---|---|
| M1 scorekeeper hardening | Mostly complete: versioned persistence, validation, tests, CI, ADRs | Durable local scorekeeper ready to extend | Recovery/reset UX, delete/archive/rename, stable UI error taxonomy | Medium | Dropping corrupt saves silently can look like data loss |
| Engine module layout | `scorekeeper/commands`, `dealer`, `selectors`, `types`, `validation`, `persistence` | `errors`, `ids`, `time`, scorekeeper events/reducer, dominoes, forty-two, replay, test-utils | Shared engine errors, injected context, event reducers, replay modules | Medium | Refactoring scorekeeper too broadly could destabilize M1 |
| Command/event model | Scorekeeper commands return updated snapshots | Commands produce events; reducers apply events to snapshots | `CommandResult`, event payloads, reducers, replay helpers | Large | Event design mistakes become expensive when backend arrives |
| Shared contracts | Initial scorekeeper-only compile-time contracts | V2 envelopes for actions, events, snapshots, stale clients, idempotency | Envelope alignment, actor seat, known sequence fields, runtime validation | Medium | Mobile/backend drift if contracts change without tests |
| Domino domain | Absent | Pip, Domino, normalized identity, double-six set, count scoring | `dominoes/` module and invariant tests | Medium | Ambiguous equality/serialization can poison later events |
| Seat and partnership model | String seats for scorekeeper | Numeric seat index for full gameplay | SeatIndex mapping, teams, partners, dealer rotation, bid order | Medium | Mismatch between scorekeeper and full-game seats can cause adapters everywhere |
| Deterministic shuffle/deal | Absent | Injected randomness/seed and four hands of seven | Shuffle helper, deal model, hand ownership, no-duplicate tests | Medium | Non-deterministic deal logic blocks replay and server validation |
| Rule config | Absent outside scorekeeper target marks | Explicit standard rules and future variants | Standard config, variant flags, validation | Small/Medium | Variant creep can delay standard-game support |
| Bidding rules | Absent | Numeric bids first; pass; all-pass dealer forced bid | Bidding state, validation, declarer selection, events/tests | Large | Edge cases around all-pass and turn order |
| Trump and suit logic | Absent | Trump call, led suit, follow-suit logic, ranking | Suit model, trump model, legal play validation | Large | Texas 42 suit/trump rules are subtle and variant-prone |
| Trick play | Absent | Played dominoes, trick winner, captured points | Trick state, winner calculation, count/trick scoring | Large | One wrong rule cascades into hand scoring |
| Hand scoring and marks | Scorekeeper-only mark awards | Points total 42, made/set bid, mark award | Hand completion, bid outcome, mark scoring | Large | Need precise tests for count/trick point invariants |
| Replay/snapshots | Persistence snapshots only | Replay event sequences into snapshots | Initial snapshot, applyEvent, replay, migrations | Large | Replay bugs are hard to diagnose after multiplayer |
| Mobile game UI | Scorekeeper UI only | Eventually local practice/multiplayer UI | No M2 UI required | Not applicable for M2 | Adding UI during M2 would blur engine boundaries |
| Backend/AWS | Absent | Amplify, Cognito, AppSync, Lambda, DynamoDB | Entire `/backend` workspace | Extra Large | Should remain deferred until rules are deterministic |
| Reconnect/sync | Absent | Snapshot fetch, event gap detection, pending actions | Client sync state, subscription handling, server snapshots | Large | Premature without backend; critical later |
| Bots | Absent | Legal random, heuristic, deterministic under seed | Bot decision API and simulations | Large | Bots before legal-action engine would duplicate rules |
| Security/abuse | Documented only | Auth, authorization, private hand protection, abuse controls | Auth model, room membership checks, schema validation | Extra Large | Cannot be client-side only |
| Testing | Engine, shared, mobile tests exist | Broad engine, contract, persistence, mobile, E2E tests | M2 table tests, fixture builders, replay tests, coverage | Medium | Rule gaps may hide until late integration |
| iOS release readiness | Dev scorekeeper app | Scorekeeper release candidate | App icon, launch screen, privacy policy, screenshots, accessibility pass | Medium | Not part of M2, but needed for App Store |

## Missing Components By Package

### `packages/game-engine`

- `errors.ts` with stable engine errors and codes.
- `time.ts`, `ids.ts`, or an equivalent injected `EngineContext`.
- `scorekeeper/events.ts` and `scorekeeper/reducer.ts` if scorekeeper is brought into the event model.
- `dominoes/domino.ts`, `set.ts`, `scoring.ts`, and sorting/identity helpers.
- `forty-two/rules-config.ts`, `seats.ts`, `deal.ts`, `bidding.ts`, `trump.ts`, `tricks.ts`, `scoring.ts`, `actions.ts`, `events.ts`, `reducer.ts`, `selectors.ts`, and `validation.ts`.
- `replay/replay.ts`, `snapshots.ts`, and `migrations.ts`.
- `test-utils/fixtures.ts` and deterministic random helpers.

### `packages/shared`

- V2-compatible action/event/snapshot envelopes.
- Full 42 action and event payload types.
- Known snapshot/version fields for stale-client handling.
- Runtime schema validation or JSON compatibility tests.
- Explicit compatibility story for current scorekeeper contracts.

### `apps/mobile`

- No M2 app changes are required for the pure rules engine.
- Later work will need adapters from UI intent to actions, but that should not be part of M2 unless a local practice UI is explicitly started.

### `/backend`

- Entirely absent, correctly deferred for now.

## Difficulty Estimates

- Small: isolated pure types/config with narrow tests.
- Medium: pure logic with several invariants but no phase orchestration.
- Large: stateful rules with turn order, replay, or edge-case interactions.
- Extra Large: backend, real-time sync, auth, hidden information, and abuse controls.

M2 should prefer Small and Medium tasks first. Large tasks should start only after the domain primitives are stable.

## Technical Risks

- Scope mismatch: top-level `ROADMAP.md` makes M2 sound like full rules, while v2 splits physical domain model into M2 and full local hand rules into M3.
- Rule ambiguity: Texas 42 has regional variants, especially around bidding, trump, doubles, nello/sevens/splash/plunge, and mark scoring.
- Contract drift: existing shared contracts do not match v2 envelope names and fields.
- Event model timing: forcing all existing scorekeeper code into event sourcing before domino rules could slow M2; waiting too long could make replay harder.
- Determinism: shuffle/deal must be reproducible, or replay/server validation will be unreliable.
- Hidden information: private hands must not leak into future public snapshots, bot inputs, or logs.
- Error handling: current raw `Error` strings are not durable enough for UI, tests, or server errors.
- ADR confusion: duplicate ADR-0004 files can mislead future agents about the accepted decision.
- CI signal: audit is non-blocking due to known Expo advisory, so security posture depends on explicit tracking.
- Premature backend work: implementing AWS before deterministic rules would bake unstable game shapes into data models.
