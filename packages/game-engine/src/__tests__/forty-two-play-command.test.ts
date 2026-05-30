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
  standardRules,
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

test("play command automatically completes the hand after seven completed tricks", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(createMadeBidHands());
  const { events, snapshot } = playHand(
    initialSnapshot,
    context,
    createMadeBidPlays()
  );
  const handCompleted = getHandCompletedEvent(events);

  assert.equal(countEvents(events, "fortyTwo.trick.completed"), 7);
  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 1);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 0);
  assert.equal(handCompleted.event.payload.handScore.totalPoints, 42);
  assert.equal(snapshot.snapshot.phase, "setup");
  assert.equal(snapshot.snapshot.handNumber, 2);
});

test("play command awards a made bid mark to the bidding team", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(createMadeBidHands());
  const { events, snapshot } = playHand(
    initialSnapshot,
    context,
    createMadeBidPlays()
  );
  const handCompleted = getHandCompletedEvent(events);

  assert.equal(handCompleted.event.payload.handScore.outcome, "made");
  assert.equal(handCompleted.event.payload.handScore.biddingTeamId, "teamB");
  assert.deepEqual(snapshot.snapshot.marks, {
    teamA: 0,
    teamB: 1
  });
});

test("play command awards a set bid mark to the opposing team", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(createSetBidHands());
  const { events, snapshot } = playHand(
    initialSnapshot,
    context,
    createSetBidPlays()
  );
  const handCompleted = getHandCompletedEvent(events);

  assert.equal(handCompleted.event.payload.handScore.outcome, "set");
  assert.equal(handCompleted.event.payload.handScore.biddingTeamId, "teamB");
  assert.deepEqual(snapshot.snapshot.marks, {
    teamA: 1,
    teamB: 0
  });
});

test("play command rotates dealer after a completed non-game hand", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(createMadeBidHands());
  const { snapshot } = playHand(
    initialSnapshot,
    context,
    createMadeBidPlays()
  );

  assert.equal(snapshot.snapshot.phase, "setup");
  assert.equal(snapshot.snapshot.dealer, 1);
});

test("play command completes the game when a team reaches target marks", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(
    createMadeBidHands(),
    "sixes",
    { targetMarks: 1 }
  );
  const { events, snapshot } = playHand(
    initialSnapshot,
    context,
    createMadeBidPlays()
  );

  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 1);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 1);
  assert.equal(snapshot.snapshot.phase, "gameComplete");

  if (snapshot.snapshot.phase === "gameComplete") {
    assert.equal(snapshot.snapshot.winningTeamId, "teamB");
    assert.equal(snapshot.snapshot.marks.teamB, 1);
  }
});

test("replay produces same post-hand state as play commands", () => {
  const context = createCommandContext();
  const initialSnapshot = createTrickPlaySnapshot(createMadeBidHands());
  const { events, snapshot } = playHand(
    initialSnapshot,
    context,
    createMadeBidPlays()
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

function playHand(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  context: Pick<EngineContext, "newId" | "now">,
  plays: readonly PlaySpec[]
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
  trumpSuit: TrumpSuit = "sixes",
  options: {
    readonly targetMarks?: number;
  } = {}
): FortyTwoSnapshotEnvelope {
  const initialSnapshot = createInitialFortyTwoSnapshot(
    {
      dealer: 0,
      gameId: "game-1",
      ...(options.targetMarks !== undefined
        ? {
            rules: {
              ...standardRules,
              targetMarks: options.targetMarks
            }
          }
        : {})
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

function createMadeBidHands(): FortyTwoHands {
  return createHands({
    0: [
      createDomino(3, 0),
      createDomino(2, 2),
      createDomino(2, 1),
      createDomino(2, 0),
      createDomino(1, 1),
      createDomino(1, 0),
      createDomino(0, 0)
    ],
    1: createSixes(),
    2: [
      createDomino(5, 5),
      createDomino(5, 4),
      createDomino(5, 3),
      createDomino(5, 2),
      createDomino(5, 1),
      createDomino(5, 0),
      createDomino(4, 4)
    ],
    3: [
      createDomino(4, 3),
      createDomino(4, 2),
      createDomino(4, 1),
      createDomino(4, 0),
      createDomino(3, 3),
      createDomino(3, 2),
      createDomino(3, 1)
    ]
  });
}

function createMadeBidPlays(): readonly PlaySpec[] {
  const hands = createMadeBidHands();
  const plays: PlaySpec[] = [];

  for (let index = 0; index < 7; index += 1) {
    const seatOneDomino = hands[1][index];
    const seatTwoDomino = hands[2][index];
    const seatThreeDomino = hands[3][index];
    const seatZeroDomino = hands[0][index];

    if (
      !seatOneDomino ||
      !seatTwoDomino ||
      !seatThreeDomino ||
      !seatZeroDomino
    ) {
      throw new Error("Made bid hand fixture is incomplete.");
    }

    plays.push(
      [1, seatOneDomino, "sixes"],
      [2, seatTwoDomino],
      [3, seatThreeDomino],
      [0, seatZeroDomino]
    );
  }

  return plays;
}

function createSetBidHands(): FortyTwoHands {
  return createHands({
    0: [
      createDomino(5, 3),
      createDomino(2, 2),
      createDomino(2, 1),
      createDomino(2, 0),
      createDomino(1, 1),
      createDomino(1, 0),
      createDomino(0, 0)
    ],
    1: [
      createDomino(5, 5),
      createDomino(5, 2),
      createDomino(5, 1),
      createDomino(5, 0),
      createDomino(4, 4),
      createDomino(4, 3),
      createDomino(4, 2)
    ],
    2: createSixes(),
    3: [
      createDomino(5, 4),
      createDomino(4, 1),
      createDomino(4, 0),
      createDomino(3, 3),
      createDomino(3, 2),
      createDomino(3, 1),
      createDomino(3, 0)
    ]
  });
}

function createSetBidPlays(): readonly PlaySpec[] {
  const hands = createSetBidHands();
  return [
    getPlay(hands, 1, 0, "fives"),
    getPlay(hands, 2, 0),
    getPlay(hands, 3, 0),
    getPlay(hands, 0, 0),
    getPlay(hands, 2, 1, "sixes"),
    getPlay(hands, 3, 1),
    getPlay(hands, 0, 1),
    getPlay(hands, 1, 1),
    getPlay(hands, 2, 2, "sixes"),
    getPlay(hands, 3, 2),
    getPlay(hands, 0, 2),
    getPlay(hands, 1, 2),
    getPlay(hands, 2, 3, "sixes"),
    getPlay(hands, 3, 3),
    getPlay(hands, 0, 3),
    getPlay(hands, 1, 3),
    getPlay(hands, 2, 4, "sixes"),
    getPlay(hands, 3, 4),
    getPlay(hands, 0, 4),
    getPlay(hands, 1, 4),
    getPlay(hands, 2, 5, "sixes"),
    getPlay(hands, 3, 5),
    getPlay(hands, 0, 5),
    getPlay(hands, 1, 5),
    getPlay(hands, 2, 6, "sixes"),
    getPlay(hands, 3, 6),
    getPlay(hands, 0, 6),
    getPlay(hands, 1, 6)
  ];
}

function createSixes(): readonly Domino[] {
  return [
    createDomino(6, 6),
    createDomino(6, 5),
    createDomino(6, 4),
    createDomino(6, 3),
    createDomino(6, 2),
    createDomino(6, 1),
    createDomino(6, 0)
  ];
}

function getPlay(
  hands: FortyTwoHands,
  seat: SeatIndex,
  index: number,
  ledSuit?: DominoSuit
): PlaySpec {
  const domino = hands[seat][index];

  if (!domino) {
    throw new Error("Play fixture is incomplete.");
  }

  return ledSuit ? [seat, domino, ledSuit] : [seat, domino];
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

function countEvents(
  events: readonly FortyTwoEventEnvelope[],
  type: FortyTwoEvent["type"]
): number {
  return events.filter((event) => event.event.type === type).length;
}

function getHandCompletedEvent(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>> {
  const event = events.find(isHandCompletedEvent);

  if (!event) {
    throw new Error("Expected hand completed event.");
  }

  return event;
}

function isHandCompletedEvent(
  event: FortyTwoEventEnvelope
): event is FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>> {
  return event.event.type === "fortyTwo.hand.completed";
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
