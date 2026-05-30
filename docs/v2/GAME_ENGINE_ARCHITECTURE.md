# Game Engine Architecture

## Goal

The game engine should be the most reliable part of the project.

It must support scorekeeper mode, full Texas 42 local play, server-side multiplayer validation, client-side previews, bot decision making, replay, and game history.

## Package Layout

Recommended structure:

```text
packages/game-engine/src
  index.ts
  errors.ts
  ids.ts
  time.ts

  scorekeeper/
    commands.ts
    events.ts
    selectors.ts
    types.ts
    validation.ts
    reducer.ts

  dominoes/
    domino.ts
    set.ts
    scoring.ts
    sorting.ts
    tests/

  forty-two/
    rules-config.ts
    seats.ts
    deal.ts
    bidding.ts
    trump.ts
    tricks.ts
    scoring.ts
    actions.ts
    events.ts
    reducer.ts
    selectors.ts
    validation.ts
    tests/

  replay/
    replay.ts
    snapshots.ts
    migrations.ts

  test-utils/
    fixtures.ts
    deterministic-random.ts
```

## Engine Design

Use deterministic reducers.

A command should not mutate state directly. It should validate the action and produce one or more events.

```ts
type CommandResult<E, ErrorCode> =
  | { ok: true; events: E[] }
  | { ok: false; error: EngineError<ErrorCode> };
```

Events are applied to snapshots:

```ts
function applyEvent(snapshot: GameSnapshot, event: GameEvent): GameSnapshot;
```

Replay is:

```ts
function replay(initial: GameSnapshot, events: GameEvent[]): GameSnapshot;
```

## Dependency Injection

Do not call these directly inside core engine logic:

- `Date.now()`
- `Math.random()`
- platform UUID APIs
- AsyncStorage
- network APIs

Inject:

```ts
type EngineContext = {
  now: () => string;
  newId: () => string;
  random: () => number;
};
```

For multiplayer, the server provides IDs, timestamps, actor identity, and shuffle seed.

## Scorekeeper vs Full Game

Scorekeeper mode and full rules mode should share concepts where appropriate, but they are separate game modes.

Do not force scorekeeper state into the full multiplayer shape if it makes the simple offline flow worse.

Recommended discriminated union:

```ts
type GameMode = "scorekeeper" | "localPractice" | "multiplayer";

type BaseGameSnapshot = {
  schemaVersion: number;
  gameId: string;
  mode: GameMode;
  createdAt: string;
  updatedAt: string;
};

type ScorekeeperSnapshot = BaseGameSnapshot & {
  mode: "scorekeeper";
  scorekeeper: ScorekeeperState;
};

type FortyTwoSnapshot = BaseGameSnapshot & {
  mode: "localPractice" | "multiplayer";
  fortyTwo: FortyTwoState;
};
```

## Error Taxonomy

Use stable error codes.

```ts
type GameErrorCode =
  | "GAME_NOT_FOUND"
  | "GAME_ALREADY_COMPLETE"
  | "INVALID_ACTOR"
  | "INVALID_PHASE"
  | "INVALID_BID"
  | "INVALID_TRUMP"
  | "INVALID_DOMINO"
  | "NOT_PLAYERS_TURN"
  | "MUST_FOLLOW_SUIT"
  | "DUPLICATE_ACTION"
  | "STALE_ACTION"
  | "SCHEMA_VERSION_UNSUPPORTED";
```

Never make UI depend on raw error message strings.

## Engine Test Philosophy

Every rule should have a test. Prefer table-driven tests and fixture builders.
