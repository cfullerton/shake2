import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  callTrump,
  createBiddingState,
  createDomino,
  createInitialFortyTwoSnapshot,
  createNumericBid,
  createPassBid,
  createTrumpCallState,
  handlePlayFortyTwoDominoCommand,
  isEngineError,
  replayFortyTwoEvents,
  startTrick,
  submitBid,
  type Domino,
  type DominoSuit,
  type EngineContext,
  type FortyTwoActionEnvelope,
  type FortyTwoCommandResult,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope,
  type FortyTwoHands,
  type FortyTwoSnapshotEnvelope,
  type PlayFortyTwoDominoAction,
  type SeatIndex,
  type TrumpSuit
} from "../index.ts";

test("play command completes a valid four-play trick lifecycle", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(5, 4)],
    3: [createDomino(5, 3)]
  });
  const { events, snapshot } = playTrick(
    initialSnapshot,
    context,
    [
      [1, createDomino(5, 5), "fives"],
      [2, createDomino(5, 4)],
      [3, createDomino(5, 3)],
      [0, createDomino(5, 2)]
    ]
  );

  assert.deepEqual(
    events.map((event) => event.event.type),
    [
      "fortyTwo.domino.played",
      "fortyTwo.domino.played",
      "fortyTwo.domino.played",
      "fortyTwo.domino.played",
      "fortyTwo.trick.completed"
    ]
  );
  assert.equal(snapshot.snapshot.phase, "trickPlay");

  if (snapshot.snapshot.phase === "trickPlay") {
    assert.equal(snapshot.snapshot.completedTricks.length, 1);
    assert.equal(snapshot.snapshot.completedTricks[0]?.winner, 1);
    assert.equal(snapshot.snapshot.currentTrick.leader, 1);
    assert.deepEqual(snapshot.snapshot.hands, createEmptyHands());
  }
});

test("play command rejects invalid turn", () => {
  const context = createCommandContext();
  const snapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(5, 4)],
    3: [createDomino(5, 3)]
  });
  const result = handlePlayFortyTwoDominoCommand(
    snapshot,
    createPlayAction(snapshot, 2, createDomino(5, 4), "fives"),
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "NOT_PLAYERS_TURN");
  }
});

test("play command rejects a domino not held by the player", () => {
  const context = createCommandContext();
  const snapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(5, 4)],
    3: [createDomino(5, 3)]
  });
  const result = handlePlayFortyTwoDominoCommand(
    snapshot,
    createPlayAction(snapshot, 1, createDomino(4, 4), "fours"),
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_DOMINO");
  }
});

test("play command enforces must-follow suit", () => {
  const context = createCommandContext();
  const firstPlay = playOne(
    createTrickPlaySnapshot({
      0: [createDomino(5, 2)],
      1: [createDomino(5, 5)],
      2: [createDomino(5, 4), createDomino(3, 3)],
      3: [createDomino(5, 3)]
    }),
    context,
    1,
    createDomino(5, 5),
    "fives"
  );
  const result = handlePlayFortyTwoDominoCommand(
    firstPlay.snapshot,
    createPlayAction(firstPlay.snapshot, 2, createDomino(3, 3)),
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "MUST_FOLLOW_SUIT");
  }
});

test("play command completes a trick with a trump winner", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(5, 4)],
    3: [createDomino(6, 0)]
  });
  const { snapshot } = playTrick(
    initialSnapshot,
    context,
    [
      [1, createDomino(5, 5), "fives"],
      [2, createDomino(5, 4)],
      [3, createDomino(6, 0)],
      [0, createDomino(5, 2)]
    ]
  );

  assert.equal(snapshot.snapshot.phase, "trickPlay");

  if (snapshot.snapshot.phase === "trickPlay") {
    assert.equal(snapshot.snapshot.completedTricks[0]?.winner, 3);
    assert.equal(snapshot.snapshot.currentTrick.leader, 3);
  }
});

test("play command completes a trick with a led-suit winner", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 3)],
    1: [createDomino(5, 2)],
    2: [createDomino(5, 5)],
    3: [createDomino(5, 4)]
  });
  const { snapshot } = playTrick(
    initialSnapshot,
    context,
    [
      [1, createDomino(5, 2), "fives"],
      [2, createDomino(5, 5)],
      [3, createDomino(5, 4)],
      [0, createDomino(5, 3)]
    ]
  );

  assert.equal(snapshot.snapshot.phase, "trickPlay");

  if (snapshot.snapshot.phase === "trickPlay") {
    assert.equal(snapshot.snapshot.completedTricks[0]?.winner, 2);
    assert.equal(snapshot.snapshot.currentTrick.leader, 2);
  }
});

test("replay produces same completed-trick state as play commands", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(5, 4)],
    3: [createDomino(6, 0)]
  });
  const { events, snapshot } = playTrick(
    initialSnapshot,
    context,
    [
      [1, createDomino(5, 5), "fives"],
      [2, createDomino(5, 4)],
      [3, createDomino(6, 0)],
      [0, createDomino(5, 2)]
    ]
  );
  const replayed = replayFortyTwoEvents(initialSnapshot, events);

  assert.deepEqual(replayed, snapshot);
});

type PlaySpec = readonly [
  SeatIndex,
  Domino,
  DominoSuit?
];

function playTrick(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  context: Pick<EngineContext, "newId" | "now">,
  plays: readonly [PlaySpec, PlaySpec, PlaySpec, PlaySpec]
): {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  let snapshot = initialSnapshot;
  const events: FortyTwoEventEnvelope[] = [];

  for (const [seat, domino, ledSuit] of plays) {
    const result = playOne(snapshot, context, seat, domino, ledSuit);
    snapshot = result.snapshot;
    events.push(...result.events);
  }

  return {
    events,
    snapshot
  };
}

function playOne(
  snapshot: FortyTwoSnapshotEnvelope,
  context: Pick<EngineContext, "newId" | "now">,
  seat: SeatIndex,
  domino: Domino,
  ledSuit?: DominoSuit
): Extract<FortyTwoCommandResult, { readonly ok: true }> {
  return unwrapSuccess(
    handlePlayFortyTwoDominoCommand(
      snapshot,
      createPlayAction(snapshot, seat, domino, ledSuit),
      context
    )
  );
}

function createTrickPlaySnapshot(
  hands: FortyTwoHands,
  trumpSuit: TrumpSuit = "sixes"
): FortyTwoSnapshotEnvelope {
  const initialSnapshot = createInitialFortyTwoSnapshot(
    {
      dealer: 0,
      gameId: "game-1"
    },
    {
      newId: () => "game-1",
      now: () => "2026-05-30T12:00:00.000Z"
    }
  );
  let bidding = createBiddingState(0);
  bidding = submitBid(bidding, 1, createNumericBid(30));
  bidding = submitBid(bidding, 2, createPassBid());
  bidding = submitBid(bidding, 3, createPassBid());
  bidding = submitBid(bidding, 0, createPassBid());

  const trump = callTrump(createTrumpCallState(bidding), 1, trumpSuit);
  const contract = trump.contract;

  if (!contract) {
    throw new Error("Test fixture failed to create a contract.");
  }

  return {
    ...initialSnapshot,
    snapshot: {
      ...initialSnapshot.snapshot,
      bidding,
      completedTricks: [],
      contract,
      currentTrick: startTrick(contract.declarer),
      hands,
      phase: "trickPlay"
    }
  };
}

function createHands(
  hands: Record<SeatIndex, readonly Domino[]>
): FortyTwoHands {
  return hands;
}

function createEmptyHands(): FortyTwoHands {
  return createHands({
    0: [],
    1: [],
    2: [],
    3: []
  });
}

function createPlayAction(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex,
  domino: Domino,
  ledSuit?: DominoSuit
): FortyTwoActionEnvelope<PlayFortyTwoDominoAction> {
  return {
    action: {
      payload: {
        domino,
        ...(ledSuit ? { ledSuit } : {}),
        seat
      },
      type: "fortyTwo.domino.play"
    },
    actionId: `action-${snapshot.lastEventSequence + 1}`,
    actorId: "actor-1",
    actorSeat: seat,
    clientCreatedAt: "2026-05-30T12:30:00.000Z",
    gameId: snapshot.gameId,
    knownLastEventSequence: snapshot.lastEventSequence,
    knownSnapshotVersion: snapshot.snapshotVersion,
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  };
}

function createCommandContext(): Pick<EngineContext, "newId" | "now"> {
  let id = 0;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `event-${id}`;
    },
    now: () => {
      time += 1;
      return `2026-05-30T12:00:${String(time).padStart(2, "0")}.000Z`;
    }
  };
}

function unwrapSuccess<TEvent extends FortyTwoEvent>(
  result: FortyTwoCommandResult<TEvent>
): Extract<FortyTwoCommandResult<TEvent>, { readonly ok: true }> {
  if (!result.ok) {
    assert.equal(isEngineError(result.error), true);
    throw result.error;
  }

  return result;
}
