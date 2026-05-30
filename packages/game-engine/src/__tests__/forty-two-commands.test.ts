import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  createNumericBid,
  createPassBid,
  createInitialFortyTwoSnapshot,
  handleCallFortyTwoTrumpCommand,
  handleCompleteFortyTwoBiddingCommand,
  handleCreateFortyTwoGameCommand,
  handleDealFortyTwoHandCommand,
  handleSubmitFortyTwoBidCommand,
  isEngineError,
  replayFortyTwoEvents,
  type CallFortyTwoTrumpAction,
  type CompleteFortyTwoBiddingAction,
  type CreateFortyTwoGameAction,
  type DealFortyTwoHandAction,
  type EngineContext,
  type FortyTwoAction,
  type FortyTwoActionEnvelope,
  type FortyTwoCommandResult,
  type FortyTwoEventEnvelope,
  type FortyTwoSnapshotEnvelope,
  type SeatIndex,
  type SubmitFortyTwoBidAction
} from "../index.ts";

test("command happy path runs deal through bidding complete and trump called", () => {
  const journey = runCommandHappyPath();

  assert.equal(journey.finalSnapshot.snapshot.phase, "trickPlay");
  assert.deepEqual(
    journey.events.map((event) => event.event.type),
    [
      "fortyTwo.game.created",
      "fortyTwo.hand.dealt",
      "fortyTwo.bid.submitted",
      "fortyTwo.bid.submitted",
      "fortyTwo.bid.submitted",
      "fortyTwo.bid.submitted",
      "fortyTwo.bidding.completed",
      "fortyTwo.trump.called"
    ]
  );

  if (journey.finalSnapshot.snapshot.phase === "trickPlay") {
    assert.equal(journey.finalSnapshot.snapshot.contract.declarer, 1);
    assert.equal(journey.finalSnapshot.snapshot.contract.trumpSuit, "sixes");
    assert.equal(journey.finalSnapshot.snapshot.currentTrick.leader, 1);
  }
});

test("command rejects invalid phase", () => {
  const context = createCommandContext();
  const created = unwrapSuccess(
    handleCreateFortyTwoGameCommand(createGameAction(), context)
  );
  const firstDeal = unwrapSuccess(
    handleDealFortyTwoHandCommand(
      created.snapshot,
      createDealAction(created.snapshot),
      context
    )
  );
  const secondDeal = handleDealFortyTwoHandCommand(
    firstDeal.snapshot,
    createDealAction(firstDeal.snapshot),
    context
  );

  assert.equal(secondDeal.ok, false);

  if (!secondDeal.ok) {
    assert.equal(secondDeal.error.code, "INVALID_PHASE");
  }
});

test("command rejects invalid trump actor", () => {
  const journey = runCommandHappyPathBeforeTrump();
  const result = handleCallFortyTwoTrumpCommand(
    journey.snapshot,
    createCallTrumpAction(journey.snapshot, "sixes", 2),
    journey.context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_ACTOR");
  }
});

test("command rejects mismatched bid actor seat", () => {
  const context = createCommandContext();
  const created = unwrapSuccess(
    handleCreateFortyTwoGameCommand(createGameAction(), context)
  );
  const dealt = unwrapSuccess(
    handleDealFortyTwoHandCommand(
      created.snapshot,
      createDealAction(created.snapshot),
      context
    )
  );
  const result = handleSubmitFortyTwoBidCommand(
    dealt.snapshot,
    createActionEnvelope(
      {
        payload: {
          bid: createNumericBid(30),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      {
        actorSeat: 2,
        snapshot: dealt.snapshot
      }
    ),
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_ACTOR");
  }
});

test("command rejects invalid bid", () => {
  const context = createCommandContext();
  const created = unwrapSuccess(
    handleCreateFortyTwoGameCommand(createGameAction(), context)
  );
  const dealt = unwrapSuccess(
    handleDealFortyTwoHandCommand(
      created.snapshot,
      createDealAction(created.snapshot),
      context
    )
  );
  const result = handleSubmitFortyTwoBidCommand(
    dealt.snapshot,
    createSubmitBidAction(dealt.snapshot, 1, createNumericBid(29)),
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_BID");
  }
});

test("replay produces same state as command application", () => {
  const journey = runCommandHappyPath();
  const replayed = replayFortyTwoEvents(journey.initialSnapshot, journey.events);

  assert.deepEqual(replayed, journey.finalSnapshot);
});

function runCommandHappyPath(): {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly finalSnapshot: FortyTwoSnapshotEnvelope;
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
} {
  const journey = runCommandHappyPathBeforeTrump();
  const trumpCalled = unwrapSuccess(
    handleCallFortyTwoTrumpCommand(
      journey.snapshot,
      createCallTrumpAction(journey.snapshot, "sixes", 1),
      journey.context
    )
  );

  return {
    events: [
      ...journey.events,
      ...trumpCalled.events
    ],
    finalSnapshot: trumpCalled.snapshot,
    initialSnapshot: journey.initialSnapshot
  };
}

function runCommandHappyPathBeforeTrump(): {
  readonly context: EngineContext;
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  const context = createCommandContext();
  const created = unwrapSuccess(
    handleCreateFortyTwoGameCommand(createGameAction(), context)
  );
  const dealt = unwrapSuccess(
    handleDealFortyTwoHandCommand(
      created.snapshot,
      createDealAction(created.snapshot),
      context
    )
  );
  const firstBid = unwrapSuccess(
    handleSubmitFortyTwoBidCommand(
      dealt.snapshot,
      createSubmitBidAction(dealt.snapshot, 1, createNumericBid(30)),
      context
    )
  );
  const secondBid = unwrapSuccess(
    handleSubmitFortyTwoBidCommand(
      firstBid.snapshot,
      createSubmitBidAction(firstBid.snapshot, 2, createPassBid()),
      context
    )
  );
  const thirdBid = unwrapSuccess(
    handleSubmitFortyTwoBidCommand(
      secondBid.snapshot,
      createSubmitBidAction(secondBid.snapshot, 3, createPassBid()),
      context
    )
  );
  const fourthBid = unwrapSuccess(
    handleSubmitFortyTwoBidCommand(
      thirdBid.snapshot,
      createSubmitBidAction(thirdBid.snapshot, 0, createPassBid()),
      context
    )
  );
  const biddingCompleted = unwrapSuccess(
    handleCompleteFortyTwoBiddingCommand(
      fourthBid.snapshot,
      createCompleteBiddingAction(fourthBid.snapshot),
      context
    )
  );

  return {
    context,
    events: [
      ...created.events,
      ...dealt.events,
      ...firstBid.events,
      ...secondBid.events,
      ...thirdBid.events,
      ...fourthBid.events,
      ...biddingCompleted.events
    ],
    initialSnapshot: createInitialReplaySnapshot(),
    snapshot: biddingCompleted.snapshot
  };
}

function createGameAction(): FortyTwoActionEnvelope<CreateFortyTwoGameAction> {
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
  bid: SubmitFortyTwoBidAction["payload"]["bid"]
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
  trumpSuit: CallFortyTwoTrumpAction["payload"]["trumpSuit"],
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
    clientCreatedAt: `2026-05-30T12:30:${padSeconds(actionSequence)}.000Z`,
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

function createCommandContext(): EngineContext {
  let id = 0;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `event-${id}`;
    },
    now: () => {
      time += 1;
      return `2026-05-30T12:00:${padSeconds(time)}.000Z`;
    },
    random: () => 0
  };
}

function createInitialReplaySnapshot(): FortyTwoSnapshotEnvelope {
  return createInitialFortyTwoSnapshot({
    dealer: 0,
    gameId: "game-1",
    playerNames: {
      0: "North",
      1: "East",
      2: "South",
      3: "West"
    },
    teamNames: {
      teamA: "North/South",
      teamB: "East/West"
    }
  }, {
    newId: () => "unused-game-id",
    now: () => "2026-05-30T12:00:01.000Z"
  });
}

function unwrapSuccess<TEvent extends FortyTwoEventEnvelope>(
  result: FortyTwoCommandResult<TEvent["event"]>
): Extract<FortyTwoCommandResult<TEvent["event"]>, { readonly ok: true }> {
  if (!result.ok) {
    assert.equal(isEngineError(result.error), true);
    throw result.error;
  }

  return result;
}

function padSeconds(value: number): string {
  return String(value).padStart(2, "0");
}
