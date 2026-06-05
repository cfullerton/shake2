import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  createDomino,
  createDoubleSixSet,
  createInitialFortyTwoSnapshot,
  createNumericBid,
  createPassBid,
  getDominoKey,
  handleCallFortyTwoTrumpCommand,
  handleCompleteFortyTwoBiddingCommand,
  handleCreateFortyTwoGameCommand,
  handleDealFortyTwoHandCommand,
  handlePlayFortyTwoDominoCommand,
  handleSubmitFortyTwoBidCommand,
  isDominoTrump,
  isEngineError,
  replayFortyTwoEvents,
  standardRules,
  type BidCall,
  type CallFortyTwoTrumpAction,
  type CompleteFortyTwoBiddingAction,
  type CreateFortyTwoGameAction,
  type DealFortyTwoHandAction,
  type Domino,
  type DominoSuit,
  type EngineContext,
  type FortyTwoAction,
  type FortyTwoActionEnvelope,
  type FortyTwoCommandResult,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope,
  type FortyTwoHands,
  type FortyTwoHandCompletionMode,
  type FortyTwoSnapshotEnvelope,
  type PlayFortyTwoDominoAction,
  type RuleConfig,
  type SeatIndex,
  type SubmitFortyTwoBidAction,
  type TrumpSuit
} from "../index.ts";

test("full command hand makes a normal trump-heavy bid and prepares the next hand", () => {
  const script = createTrumpSweepScript(1);
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const handCompleted = getLastHandCompletedEvent(events);

  assert.equal(countEvents(events, "fortyTwo.trick.completed"), 7);
  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 1);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 0);
  assert.equal(handCompleted.event.payload.handScore.outcome, "made");
  assert.equal(handCompleted.event.payload.handScore.bidAmount, 30);
  assert.equal(handCompleted.event.payload.handScore.biddingTeamPoints, 42);
  assert.deepEqual(result.snapshot.snapshot.marks, {
    teamA: 0,
    teamB: 1
  });
  assert.equal(result.snapshot.snapshot.phase, "setup");
  assert.equal(result.snapshot.snapshot.dealer, 1);
  assert.equal(result.snapshot.snapshot.handNumber, 2);
  assert.equal(
    handCompleted.event.payload.handScore.trickScores.filter((trickScore) =>
      trickScore.trick.playedDominoes.some((play) =>
        isDominoTrump(play.domino, script.trumpSuit)
      )
    ).length,
    7
  );
  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

test("full command hand makes an exact 42 bid", () => {
  const script = createTrumpSweepScript(1);
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 42),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const handScore = getLastHandCompletedEvent(events).event.payload.handScore;

  assert.equal(handScore.outcome, "made");
  assert.equal(handScore.bidAmount, 42);
  assert.equal(handScore.biddingTeamPoints, 42);
  assert.deepEqual(handScore.markAwards, {
    teamA: 0,
    teamB: 1
  });
  assert.deepEqual(result.snapshot.snapshot.marks, {
    teamA: 0,
    teamB: 1
  });
  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

test("full command hand sets the bidding team by one point", () => {
  const script = createSetByOneScript();
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const handScore = getLastHandCompletedEvent(events).event.payload.handScore;

  assert.equal(handScore.outcome, "set");
  assert.equal(handScore.bidAmount, 30);
  assert.equal(handScore.biddingTeamId, "teamB");
  assert.equal(handScore.biddingTeamPoints, 29);
  assert.deepEqual(handScore.teamPoints, {
    teamA: 13,
    teamB: 29
  });
  assert.deepEqual(result.snapshot.snapshot.marks, {
    teamA: 1,
    teamB: 0
  });
  assert.equal(result.snapshot.snapshot.dealer, 1);
  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

test("full command hand scores led-suit tricks where no trump is played", () => {
  const script = createSetByOneScript();
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const noTrumpTricks = getLastHandCompletedEvent(events)
    .event.payload.handScore.trickScores.filter((trickScore) =>
      trickScore.trick.playedDominoes.every((play) =>
        !isDominoTrump(play.domino, script.trumpSuit)
      )
    );

  assert.equal(noTrumpTricks.length, 5);
  assert.deepEqual(
    noTrumpTricks.map((trickScore) => trickScore.winner),
    [1, 1, 1, 0, 0]
  );
  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

test("full command hand supports all-pass dealer forced bid", () => {
  const script = createTrumpSweepScript(0);
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createAllPassBidPlan(0),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const biddingCompleted = getBiddingCompletedEvent(events);
  const handScore = getLastHandCompletedEvent(events).event.payload.handScore;

  assert.equal(biddingCompleted.event.payload.bidding.highestBid?.forced, true);
  assert.equal(biddingCompleted.event.payload.bidding.declarer, 0);
  assert.equal(handScore.outcome, "made");
  assert.equal(handScore.bidAmount, 30);
  assert.equal(handScore.biddingTeamId, "teamA");
  assert.deepEqual(result.snapshot.snapshot.marks, {
    teamA: 1,
    teamB: 0
  });
  assert.equal(result.snapshot.snapshot.dealer, 1);
  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

test("full command hand does not complete after only six tricks", () => {
  const script = createSetByOneScript();
  const partialScript = {
    ...script,
    plays: script.plays.slice(0, 24)
  };
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script: partialScript
  });
  const events = [
    ...session.events,
    ...result.events
  ];

  assert.equal(countEvents(events, "fortyTwo.trick.completed"), 6);
  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 0);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 0);
  assert.equal(result.snapshot.snapshot.phase, "trickPlay");

  if (result.snapshot.snapshot.phase === "trickPlay") {
    assert.equal(result.snapshot.snapshot.completedTricks.length, 6);
    assert.equal(countRemainingDominoes(result.snapshot.snapshot.hands), 4);
  }

  assertReplayMatches(session.initialSnapshot, events, result.snapshot);
  assertEventSequence(events);
});

test("full command hand rejects an invalid final trick play without scoring", () => {
  const script = createSetByOneScript();
  const partialScript = {
    ...script,
    plays: script.plays.slice(0, 27)
  };
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script: partialScript
  });
  const invalidPlay = handlePlayFortyTwoDominoCommand(
    result.snapshot,
    createPlayAction(result.snapshot, 3, createDomino(5, 5)),
    session.context
  );
  const events = [
    ...session.events,
    ...result.events
  ];

  assert.equal(invalidPlay.ok, false);

  if (!invalidPlay.ok) {
    assert.equal(invalidPlay.error.code, "INVALID_DOMINO");
  }

  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 0);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 0);
  assert.equal(result.snapshot.snapshot.phase, "trickPlay");
  assertReplayMatches(session.initialSnapshot, events, result.snapshot);
});

test("full command hand can auto-end once the bid is decided", () => {
  const script = createTrumpSweepScript(1);
  const session = createGameSession({
    deals: [script.hands],
    handCompletionMode: "autoEndWhenDecided",
    targetMarks: 7
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script: {
      ...script,
      plays: script.plays.slice(0, 20)
    }
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const handCompleted = getLastHandCompletedEvent(events);

  assert.equal(countEvents(events, "fortyTwo.trick.completed"), 5);
  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 1);
  assert.equal(handCompleted.event.payload.handScore.earlyCompletion?.mode, "autoEndWhenDecided");
  assert.equal(result.snapshot.snapshot.phase, "setup");
  assertReplayMatches(session.initialSnapshot, events, result.snapshot);
});

test("full command hands rotate dealers across multiple hands", () => {
  const scripts = [
    createTrumpSweepScript(1),
    createTrumpSweepScript(2),
    createTrumpSweepScript(3)
  ];
  const session = createGameSession({
    deals: scripts.map((script) => script.hands),
    targetMarks: 7
  });
  let snapshot = session.snapshot;
  const events: FortyTwoEventEnvelope[] = [...session.events];

  for (const script of scripts) {
    const result = runHandFromSetup(snapshot, session.context, {
      bids: createNormalBidPlan(script.declarer, 30),
      script
    });
    snapshot = result.snapshot;
    events.push(...result.events);
  }

  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 3);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 0);
  assert.equal(snapshot.snapshot.phase, "setup");
  assert.equal(snapshot.snapshot.dealer, 3);
  assert.equal(snapshot.snapshot.handNumber, 4);
  assert.deepEqual(snapshot.snapshot.marks, {
    teamA: 1,
    teamB: 2
  });
  assertReplayMatches(session.initialSnapshot, events, snapshot);
  assertEventSequence(events);
});

test("full command hand completes the game at target marks", () => {
  const script = createTrumpSweepScript(1);
  const session = createGameSession({
    deals: [script.hands],
    targetMarks: 1
  });
  const result = runHandFromSetup(session.snapshot, session.context, {
    bids: createNormalBidPlan(1, 30),
    script
  });
  const events = [
    ...session.events,
    ...result.events
  ];
  const handCompletedIndex = events.findIndex(
    (event) => event.event.type === "fortyTwo.hand.completed"
  );
  const gameCompletedIndex = events.findIndex(
    (event) => event.event.type === "fortyTwo.game.completed"
  );

  assert.equal(countEvents(events, "fortyTwo.hand.completed"), 1);
  assert.equal(countEvents(events, "fortyTwo.game.completed"), 1);
  assert.equal(handCompletedIndex >= 0, true);
  assert.equal(gameCompletedIndex > handCompletedIndex, true);
  assert.equal(result.snapshot.snapshot.phase, "gameComplete");

  if (result.snapshot.snapshot.phase === "gameComplete") {
    assert.equal(result.snapshot.snapshot.winningTeamId, "teamB");
    assert.equal(Number.isNaN(Date.parse(result.snapshot.snapshot.completedAt)), false);
    assert.deepEqual(result.snapshot.snapshot.marks, {
      teamA: 0,
      teamB: 1
    });
  }

  assertCompletedHandEvents(events, session.initialSnapshot, result.snapshot);
});

type PlaySpec = readonly [
  SeatIndex,
  Domino,
  DominoSuit?
];

interface HandScript {
  readonly declarer: SeatIndex;
  readonly hands: FortyTwoHands;
  readonly plays: readonly PlaySpec[];
  readonly trumpSuit: TrumpSuit;
}

interface BidInstruction {
  readonly bid: BidCall;
  readonly seat: SeatIndex;
}

function createGameSession(options: {
  readonly deals: readonly FortyTwoHands[];
  readonly handCompletionMode?: FortyTwoHandCompletionMode;
  readonly targetMarks: number;
}): {
  readonly context: EngineContext;
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  const rules = {
    ...standardRules,
    ...(options.handCompletionMode
      ? { handCompletionMode: options.handCompletionMode }
      : {}),
    targetMarks: options.targetMarks
  } satisfies RuleConfig;
  const context = createScriptedEngineContext(options.deals);
  const initialSnapshot = createInitialReplaySnapshot(rules);
  const created = unwrapSuccess(
    handleCreateFortyTwoGameCommand(createGameAction(rules), context)
  );

  return {
    context,
    events: created.events,
    initialSnapshot,
    snapshot: created.snapshot
  };
}

function runHandFromSetup(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  context: EngineContext,
  input: {
    readonly bids: readonly BidInstruction[];
    readonly script: HandScript;
  }
): {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  const events: FortyTwoEventEnvelope[] = [];
  let snapshot = initialSnapshot;

  const dealt = unwrapSuccess(
    handleDealFortyTwoHandCommand(snapshot, createDealAction(snapshot), context)
  );
  snapshot = dealt.snapshot;
  events.push(...dealt.events);
  assertDealtHands(snapshot, input.script.hands);

  for (const bid of input.bids) {
    const bidSubmitted = unwrapSuccess(
      handleSubmitFortyTwoBidCommand(
        snapshot,
        createSubmitBidAction(snapshot, bid.seat, bid.bid),
        context
      )
    );
    snapshot = bidSubmitted.snapshot;
    events.push(...bidSubmitted.events);
  }

  const biddingCompleted = unwrapSuccess(
    handleCompleteFortyTwoBiddingCommand(
      snapshot,
      createCompleteBiddingAction(snapshot),
      context
    )
  );
  snapshot = biddingCompleted.snapshot;
  events.push(...biddingCompleted.events);

  if (snapshot.snapshot.phase !== "trump" || snapshot.snapshot.bidding.declarer === null) {
    throw new Error("Expected trump phase with a declarer.");
  }

  const trumpCalled = unwrapSuccess(
    handleCallFortyTwoTrumpCommand(
      snapshot,
      createCallTrumpAction(
        snapshot,
        input.script.trumpSuit,
        snapshot.snapshot.bidding.declarer
      ),
      context
    )
  );
  snapshot = trumpCalled.snapshot;
  events.push(...trumpCalled.events);

  for (const [seat, domino, ledSuit] of input.script.plays) {
    const played = unwrapSuccess(
      handlePlayFortyTwoDominoCommand(
        snapshot,
        createPlayAction(snapshot, seat, domino, ledSuit),
        context
      )
    );
    snapshot = played.snapshot;
    events.push(...played.events);
  }

  return {
    events,
    snapshot
  };
}

function createTrumpSweepScript(declarer: SeatIndex): HandScript {
  const hands = createTrumpSweepHands(declarer);
  const playOrder = createPlayOrder(declarer);
  const plays: PlaySpec[] = [];

  for (let trickIndex = 0; trickIndex < 7; trickIndex += 1) {
    for (const seat of playOrder) {
      plays.push(
        seat === declarer
          ? getPlay(hands, seat, trickIndex, "sixes")
          : getPlay(hands, seat, trickIndex)
      );
    }
  }

  return {
    declarer,
    hands,
    plays,
    trumpSuit: "sixes"
  };
}

function createTrumpSweepHands(declarer: SeatIndex): FortyTwoHands {
  const hands: Record<SeatIndex, Domino[]> = {
    0: [],
    1: [],
    2: [],
    3: []
  };
  const nonTrumpDominoes = createNonSixes();
  const nonDeclarers = createPlayOrder(getNextSeat(declarer)).filter(
    (seat) => seat !== declarer
  );

  hands[declarer] = createSixes();

  for (const [index, domino] of nonTrumpDominoes.entries()) {
    const seat = nonDeclarers[Math.floor(index / 7)];

    if (seat === undefined) {
      throw new Error("Trump sweep fixture could not assign domino.");
    }

    hands[seat].push(domino);
  }

  return hands;
}

function createSetByOneScript(): HandScript {
  const hands = createHands({
    0: [
      createDomino(5, 0),
      createDomino(6, 2),
      createDomino(4, 0),
      createDomino(5, 1),
      createDomino(1, 1),
      createDomino(2, 2),
      createDomino(6, 5)
    ],
    1: [
      createDomino(5, 5),
      createDomino(6, 6),
      createDomino(4, 4),
      createDomino(3, 3),
      createDomino(1, 0),
      createDomino(2, 1),
      createDomino(6, 1)
    ],
    2: [
      createDomino(5, 4),
      createDomino(6, 4),
      createDomino(4, 3),
      createDomino(3, 1),
      createDomino(4, 1),
      createDomino(3, 2),
      createDomino(6, 0)
    ],
    3: [
      createDomino(5, 3),
      createDomino(6, 3),
      createDomino(4, 2),
      createDomino(3, 0),
      createDomino(5, 2),
      createDomino(2, 0),
      createDomino(0, 0)
    ]
  });

  return {
    declarer: 1,
    hands,
    plays: [
      getPlay(hands, 1, 0, "fives"),
      getPlay(hands, 2, 0),
      getPlay(hands, 3, 0),
      getPlay(hands, 0, 0),
      getPlay(hands, 1, 1, "sixes"),
      getPlay(hands, 2, 1),
      getPlay(hands, 3, 1),
      getPlay(hands, 0, 1),
      getPlay(hands, 1, 2, "fours"),
      getPlay(hands, 2, 2),
      getPlay(hands, 3, 2),
      getPlay(hands, 0, 2),
      getPlay(hands, 1, 3, "threes"),
      getPlay(hands, 2, 3),
      getPlay(hands, 3, 3),
      getPlay(hands, 0, 3),
      getPlay(hands, 1, 4, "ones"),
      getPlay(hands, 2, 4),
      getPlay(hands, 3, 4),
      getPlay(hands, 0, 4),
      getPlay(hands, 0, 5, "twos"),
      getPlay(hands, 1, 5),
      getPlay(hands, 2, 5),
      getPlay(hands, 3, 5),
      getPlay(hands, 0, 6, "sixes"),
      getPlay(hands, 1, 6),
      getPlay(hands, 2, 6),
      getPlay(hands, 3, 6)
    ],
    trumpSuit: "sixes"
  };
}

function createNormalBidPlan(
  bidder: SeatIndex,
  amount: number
): readonly BidInstruction[] {
  return createPlayOrder(bidder).map((seat, index) => ({
    bid: index === 0 ? createNumericBid(amount) : createPassBid(),
    seat
  }));
}

function createAllPassBidPlan(dealer: SeatIndex): readonly BidInstruction[] {
  return createPlayOrder(getNextSeat(dealer)).map((seat) => ({
    bid: createPassBid(),
    seat
  }));
}

function createGameAction(
  rules: RuleConfig
): FortyTwoActionEnvelope<CreateFortyTwoGameAction> {
  return createActionEnvelope(
    {
      payload: {
        dealer: 0,
        playerNames: {
          0: "North",
          1: "East",
          2: "South",
          3: "West"
        },
        rules,
        teamNames: {
          teamA: "North/South",
          teamB: "East/West"
        }
      },
      type: "fortyTwo.game.create"
    },
    {
      gameId: "game-1"
    }
  );
}

function createDealAction(
  snapshot: FortyTwoSnapshotEnvelope
): FortyTwoActionEnvelope<DealFortyTwoHandAction> {
  return createActionEnvelope(
    {
      payload: {
        dealer: snapshot.snapshot.dealer,
        handNumber: snapshot.snapshot.handNumber
      },
      type: "fortyTwo.hand.deal"
    },
    {
      snapshot
    }
  );
}

function createSubmitBidAction(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex,
  bid: BidCall
): FortyTwoActionEnvelope<SubmitFortyTwoBidAction> {
  return createActionEnvelope(
    {
      payload: {
        bid,
        seat
      },
      type: "fortyTwo.bid.submit"
    },
    {
      actorSeat: seat,
      snapshot
    }
  );
}

function createCompleteBiddingAction(
  snapshot: FortyTwoSnapshotEnvelope
): FortyTwoActionEnvelope<CompleteFortyTwoBiddingAction> {
  return createActionEnvelope(
    {
      payload: {},
      type: "fortyTwo.bidding.complete"
    },
    {
      snapshot
    }
  );
}

function createCallTrumpAction(
  snapshot: FortyTwoSnapshotEnvelope,
  trumpSuit: TrumpSuit,
  actorSeat: SeatIndex
): FortyTwoActionEnvelope<CallFortyTwoTrumpAction> {
  return createActionEnvelope(
    {
      payload: {
        trumpSuit
      },
      type: "fortyTwo.trump.call"
    },
    {
      actorSeat,
      snapshot
    }
  );
}

function createPlayAction(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex,
  domino: Domino,
  ledSuit?: DominoSuit
): FortyTwoActionEnvelope<PlayFortyTwoDominoAction> {
  return createActionEnvelope(
    {
      payload: {
        domino,
        ...(ledSuit ? { ledSuit } : {}),
        seat
      },
      type: "fortyTwo.domino.play"
    },
    {
      actorSeat: seat,
      snapshot
    }
  );
}

function createActionEnvelope<TAction extends FortyTwoAction>(
  action: TAction,
  options: {
    readonly actorSeat?: SeatIndex;
    readonly gameId?: string;
    readonly snapshot?: FortyTwoSnapshotEnvelope;
  } = {}
): FortyTwoActionEnvelope<TAction> {
  const snapshot = options.snapshot;
  const actionSequence = snapshot
    ? snapshot.lastEventSequence + 1
    : 1;

  return {
    action,
    actionId: `action-${actionSequence}`,
    actorId: "actor-1",
    ...(options.actorSeat !== undefined ? { actorSeat: options.actorSeat } : {}),
    clientCreatedAt: createTimestamp(30, actionSequence),
    gameId: options.gameId ?? snapshot?.gameId ?? "game-1",
    ...(snapshot
      ? {
          knownLastEventSequence: snapshot.lastEventSequence,
          knownSnapshotVersion: snapshot.snapshotVersion
        }
      : {}),
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  };
}

function createInitialReplaySnapshot(rules: RuleConfig): FortyTwoSnapshotEnvelope {
  return createInitialFortyTwoSnapshot(
    {
      dealer: 0,
      gameId: "game-1",
      playerNames: {
        0: "North",
        1: "East",
        2: "South",
        3: "West"
      },
      rules,
      teamNames: {
        teamA: "North/South",
        teamB: "East/West"
      }
    },
    {
      newId: () => "unused-game-id",
      now: () => createTimestamp(0, 1)
    }
  );
}

function createScriptedEngineContext(
  deals: readonly FortyTwoHands[]
): EngineContext {
  const randomValues = deals.flatMap(createShuffleRandomsForHands);
  let id = 0;
  let randomIndex = 0;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `event-${id}`;
    },
    now: () => {
      time += 1;
      return createTimestamp(0, time);
    },
    random: () => {
      const value = randomValues[randomIndex];

      if (value === undefined) {
        throw new Error("Test fixture did not provide enough random values.");
      }

      randomIndex += 1;
      return value;
    }
  };
}

function createShuffleRandomsForHands(hands: FortyTwoHands): readonly number[] {
  const desired = flattenHands(hands);
  const shuffled = [...createDoubleSixSet()];
  const randomValues: number[] = [];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const desiredDomino = desired[index];

    if (!desiredDomino) {
      throw new Error("Desired deal is missing a domino.");
    }

    const desiredKey = getDominoKey(desiredDomino);
    const swapIndex = shuffled.findIndex(
      (domino, candidateIndex) =>
        candidateIndex <= index && getDominoKey(domino) === desiredKey
    );

    if (swapIndex === -1) {
      throw new Error(`Desired domino ${desiredKey} is unavailable during shuffle.`);
    }

    randomValues.push((swapIndex + 0.5) / (index + 1));

    const current = shuffled[index];
    const target = shuffled[swapIndex];

    if (!current || !target) {
      throw new Error("Shuffle fixture encountered an invalid swap.");
    }

    shuffled[index] = target;
    shuffled[swapIndex] = current;
  }

  assert.deepEqual(toDominoKeys(shuffled), toDominoKeys(desired));
  return randomValues;
}

function assertDealtHands(
  snapshot: FortyTwoSnapshotEnvelope,
  expectedHands: FortyTwoHands
): void {
  assert.equal(snapshot.snapshot.phase, "dealt");

  if (snapshot.snapshot.phase === "dealt") {
    assert.deepEqual(toHandKeys(snapshot.snapshot.hands), toHandKeys(expectedHands));
  }
}

function assertCompletedHandEvents(
  events: readonly FortyTwoEventEnvelope[],
  initialSnapshot: FortyTwoSnapshotEnvelope,
  finalSnapshot: FortyTwoSnapshotEnvelope
): void {
  const handCompleted = getLastHandCompletedEvent(events);

  assert.equal(handCompleted.event.payload.handScore.totalPoints, 42);
  assert.equal(handCompleted.event.payload.completedTricks.length, 7);
  assert.equal(getCapturedDominoKeys(handCompleted).length, 28);
  assert.equal(new Set(getCapturedDominoKeys(handCompleted)).size, 28);
  assertLastDominoPlayedEmptiedHands(events);
  assertReplayMatches(initialSnapshot, events, finalSnapshot);
  assertEventSequence(events);
  assert.deepEqual(JSON.parse(JSON.stringify(finalSnapshot)), finalSnapshot);
}

function assertReplayMatches(
  initialSnapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[],
  finalSnapshot: FortyTwoSnapshotEnvelope
): void {
  const replayed = replayFortyTwoEvents(initialSnapshot, events);
  const lastEvent = events[events.length - 1];

  if (!lastEvent) {
    throw new Error("Expected events to replay.");
  }

  assert.deepEqual(replayed, finalSnapshot);
  assert.equal(
    finalSnapshot.snapshotVersion,
    initialSnapshot.snapshotVersion + events.length
  );
  assert.equal(finalSnapshot.lastEventSequence, lastEvent.sequence);
}

function assertEventSequence(events: readonly FortyTwoEventEnvelope[]): void {
  events.forEach((event, index) => {
    assert.equal(event.sequence, index + 1);
  });
}

function assertLastDominoPlayedEmptiedHands(
  events: readonly FortyTwoEventEnvelope[]
): void {
  const dominoPlayedEvents = events.filter(isDominoPlayedEvent);
  const finalDominoPlayed = dominoPlayedEvents[dominoPlayedEvents.length - 1];

  if (!finalDominoPlayed) {
    throw new Error("Expected at least one domino played event.");
  }

  assert.deepEqual(toHandKeys(finalDominoPlayed.event.payload.hands), {
    0: [],
    1: [],
    2: [],
    3: []
  });
}

function getBiddingCompletedEvent(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.bidding.completed" }
>> {
  const event = events.find(
    (candidate): candidate is FortyTwoEventEnvelope<Extract<
      FortyTwoEvent,
      { readonly type: "fortyTwo.bidding.completed" }
    >> => candidate.event.type === "fortyTwo.bidding.completed"
  );

  if (!event) {
    throw new Error("Expected bidding completed event.");
  }

  return event;
}

function getLastHandCompletedEvent(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>> {
  const handCompletedEvents = events.filter(isHandCompletedEvent);
  const event = handCompletedEvents[handCompletedEvents.length - 1];

  if (!event) {
    throw new Error("Expected hand completed event.");
  }

  return event;
}

function getCapturedDominoKeys(
  event: FortyTwoEventEnvelope<Extract<
    FortyTwoEvent,
    { readonly type: "fortyTwo.hand.completed" }
  >>
): readonly string[] {
  return event.event.payload.completedTricks.flatMap((completedTrick) =>
    completedTrick.trick.playedDominoes.map((play) => getDominoKey(play.domino))
  );
}

function isHandCompletedEvent(
  event: FortyTwoEventEnvelope
): event is FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.hand.completed" }
>> {
  return event.event.type === "fortyTwo.hand.completed";
}

function isDominoPlayedEvent(
  event: FortyTwoEventEnvelope
): event is FortyTwoEventEnvelope<Extract<
  FortyTwoEvent,
  { readonly type: "fortyTwo.domino.played" }
>> {
  return event.event.type === "fortyTwo.domino.played";
}

function countEvents(
  events: readonly FortyTwoEventEnvelope[],
  type: FortyTwoEvent["type"]
): number {
  return events.filter((event) => event.event.type === type).length;
}

function countRemainingDominoes(hands: FortyTwoHands): number {
  return Object.values(hands).reduce((total, hand) => total + hand.length, 0);
}

function createHands(
  hands: Record<SeatIndex, readonly Domino[]>
): FortyTwoHands {
  return hands;
}

function createSixes(): Domino[] {
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

function createNonSixes(): readonly Domino[] {
  return createDoubleSixSet().filter((domino) => domino.high !== 6);
}

function createPlayOrder(firstSeat: SeatIndex): readonly [
  SeatIndex,
  SeatIndex,
  SeatIndex,
  SeatIndex
] {
  const secondSeat = getNextSeat(firstSeat);
  const thirdSeat = getNextSeat(secondSeat);
  const fourthSeat = getNextSeat(thirdSeat);
  return [firstSeat, secondSeat, thirdSeat, fourthSeat];
}

function getNextSeat(seat: SeatIndex): SeatIndex {
  return ((seat + 1) % 4) as SeatIndex;
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

function flattenHands(hands: FortyTwoHands): readonly Domino[] {
  return [
    ...hands[0],
    ...hands[1],
    ...hands[2],
    ...hands[3]
  ];
}

function toHandKeys(
  hands: FortyTwoHands
): Readonly<Record<SeatIndex, readonly string[]>> {
  return {
    0: toDominoKeys(hands[0]),
    1: toDominoKeys(hands[1]),
    2: toDominoKeys(hands[2]),
    3: toDominoKeys(hands[3])
  };
}

function toDominoKeys(dominoes: readonly Domino[]): readonly string[] {
  return dominoes.map(getDominoKey);
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

function createTimestamp(baseMinute: number, offsetSeconds: number): string {
  return new Date(
    Date.UTC(2026, 4, 30, 12, baseMinute, 0) + offsetSeconds * 1000
  ).toISOString();
}
