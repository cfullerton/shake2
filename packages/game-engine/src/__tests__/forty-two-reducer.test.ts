import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_EVENT_SCHEMA_VERSION,
  SEAT_INDICES,
  applyFortyTwoEvent,
  callTrump,
  createBiddingState,
  createDoubleSixSet,
  createInitialFortyTwoSnapshot,
  createNumericBid,
  createPassBid,
  createTrumpCallState,
  dealDominoes,
  getContractTrumpSuit,
  getLegalLedSuits,
  isEngineError,
  playDominoToTrick,
  replayFortyTwoEvents,
  scoreCompletedHand,
  standardRules,
  startTrick,
  submitBid,
  type CompletedTrick,
  type EngineContext,
  type FortyTwoEvent,
  type FortyTwoEventEnvelope,
  type FortyTwoSnapshotEnvelope,
  type SeatIndex
} from "../index.ts";

test("replays forty-two events deterministically", () => {
  const { events, initialSnapshot } = createReplayFixture();

  const firstReplay = replayFortyTwoEvents(initialSnapshot, events);
  const secondReplay = replayFortyTwoEvents(initialSnapshot, events);
  const lastEvent = getLastEvent(events);

  assert.deepEqual(firstReplay, secondReplay);
  assert.deepEqual(JSON.parse(JSON.stringify(firstReplay)), firstReplay);
  assert.equal(firstReplay.snapshotVersion, initialSnapshot.snapshotVersion + events.length);
  assert.equal(firstReplay.lastEventSequence, lastEvent.sequence);
  assert.equal(firstReplay.generatedAt, lastEvent.serverCreatedAt);
  assert.equal(firstReplay.snapshot.phase, "gameComplete");

  if (firstReplay.snapshot.phase === "gameComplete") {
    assert.equal(firstReplay.snapshot.winningTeamId, "teamA");
    assert.equal(firstReplay.snapshot.completedAt, lastEvent.serverCreatedAt);
  }
});

test("applies events with monotonic sequence and snapshot version advancement", () => {
  const { events, initialSnapshot } = createReplayFixture();
  let snapshot = initialSnapshot;

  for (const event of events) {
    const previousSnapshotVersion = snapshot.snapshotVersion;
    snapshot = applyFortyTwoEvent(snapshot, event);

    assert.equal(snapshot.snapshotVersion, previousSnapshotVersion + 1);
    assert.equal(snapshot.lastEventSequence, event.sequence);
    assert.equal(snapshot.generatedAt, event.serverCreatedAt);
    assert.equal(event.actionId, `action-${event.sequence}`);
  }
});

test("rejects out-of-sequence forty-two events", () => {
  const { events, initialSnapshot } = createReplayFixture();
  const secondEvent = events[1];

  if (!secondEvent) {
    throw new Error("Replay fixture did not create a second event.");
  }

  assert.throws(
    () => applyFortyTwoEvent(initialSnapshot, secondEvent),
    (error) => isEngineError(error) && error.code === "STALE_ACTION"
  );
});

function createReplayFixture(): {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
} {
  const initialSnapshot = createInitialFortyTwoSnapshot(
    {
      dealer: 0
    },
    createContext()
  );
  const hands = dealDominoes(createDoubleSixSet());
  let firstBidState = createBiddingState(0);
  firstBidState = submitBid(firstBidState, 1, createNumericBid(30));

  let completedBidding = firstBidState;
  completedBidding = submitBid(completedBidding, 2, createPassBid());
  completedBidding = submitBid(completedBidding, 3, createPassBid());
  completedBidding = submitBid(completedBidding, 0, createPassBid());

  const trumpWaiting = createTrumpCallState(completedBidding);
  const trumpCalled = callTrump(trumpWaiting, 1, "sixes");
  const contract = trumpCalled.contract;

  if (!contract) {
    throw new Error("Trump call fixture did not create a contract.");
  }

  const firstTrick = startTrick(contract.declarer);
  const leadDomino = hands[contract.declarer][0];

  if (!leadDomino) {
    throw new Error("Declarer fixture hand is empty.");
  }

  const ledSuit = getLegalLedSuits(leadDomino, getContractTrumpSuit(contract))[0];

  if (!ledSuit) {
    throw new Error("Lead domino fixture has no legal suit.");
  }

  const played = playDominoToTrick({
    domino: leadDomino,
    hands,
    ledSuit,
    seat: contract.declarer,
    trick: firstTrick,
    trumpSuit: getContractTrumpSuit(contract)
  });
  const completedTricks = createCompletedTricks();
  const firstCompletedTrick = completedTricks[0];

  if (!firstCompletedTrick) {
    throw new Error("Completed trick fixture did not create a first trick.");
  }

  const handScore = scoreCompletedHand(completedTricks, contract, standardRules);

  return {
    events: [
      createEvent(1, {
        payload: {
          createdAt: initialSnapshot.snapshot.createdAt,
          dealer: initialSnapshot.snapshot.dealer,
          handNumber: initialSnapshot.snapshot.handNumber,
          marks: initialSnapshot.snapshot.marks,
          mode: initialSnapshot.snapshot.mode,
          players: initialSnapshot.snapshot.players,
          rules: initialSnapshot.snapshot.rules,
          teams: initialSnapshot.snapshot.teams
        },
        type: "fortyTwo.game.created"
      }),
      createEvent(2, {
        payload: {
          dealer: 0,
          handNumber: 1,
          hands
        },
        type: "fortyTwo.hand.dealt"
      }),
      createEvent(3, {
        payload: {
          bid: createNumericBid(30),
          bidding: firstBidState,
          seat: 1
        },
        type: "fortyTwo.bid.submitted"
      }, 1),
      createEvent(4, {
        payload: {
          bidding: completedBidding,
          trump: trumpWaiting
        },
        type: "fortyTwo.bidding.completed"
      }),
      createEvent(5, {
        payload: {
          contract,
          currentTrick: firstTrick,
          trump: trumpCalled
        },
        type: "fortyTwo.trump.called"
      }, 1),
      createEvent(6, {
        payload: {
          currentTrick: played.trick,
          hands: played.hands
        },
        type: "fortyTwo.domino.played"
      }, 1),
      createEvent(7, {
        payload: {
          completedTrick: firstCompletedTrick,
          currentTrick: startTrick(0)
        },
        type: "fortyTwo.trick.completed"
      }),
      createEvent(8, {
        payload: {
          completedTricks,
          handScore
        },
        type: "fortyTwo.hand.completed"
      }),
      createEvent(9, {
        payload: {
          completedAt: "2026-05-30T12:00:09.000Z",
          winningTeamId: "teamA"
        },
        type: "fortyTwo.game.completed"
      })
    ],
    initialSnapshot
  };
}

function createCompletedTricks(): readonly CompletedTrick[] {
  const dominoes = createDoubleSixSet();
  const completedTricks: CompletedTrick[] = [];

  for (let trickIndex = 0; trickIndex < 7; trickIndex += 1) {
    const playedDominoes = SEAT_INDICES.map((seat, playIndex) => {
      const domino = dominoes[trickIndex * SEAT_INDICES.length + playIndex];

      if (!domino) {
        throw new Error("Not enough dominoes for completed trick fixture.");
      }

      return {
        domino,
        seat
      };
    });
    const ledDomino = playedDominoes[0]?.domino;

    if (!ledDomino) {
      throw new Error("Completed trick fixture is missing a led domino.");
    }

    completedTricks.push({
      trick: {
        leader: 0,
        ledDomino,
        ledSuit: "blanks",
        playedDominoes
      },
      winner: trickIndex % 2 === 0 ? 0 : 1
    });
  }

  return completedTricks;
}

function createEvent<TEvent extends FortyTwoEvent>(
  sequence: number,
  event: TEvent,
  actorSeat?: SeatIndex
): FortyTwoEventEnvelope<TEvent> {
  return {
    actionId: `action-${sequence}`,
    actorId: "actor-1",
    ...(actorSeat !== undefined ? { actorSeat } : {}),
    event,
    eventId: `event-${sequence}`,
    gameId: "game-1",
    schemaVersion: FORTY_TWO_EVENT_SCHEMA_VERSION,
    sequence,
    serverCreatedAt: `2026-05-30T12:00:0${sequence}.000Z`
  };
}

function createContext(): Pick<EngineContext, "newId" | "now"> {
  return {
    newId: () => "game-1",
    now: () => "2026-05-30T12:00:00.000Z"
  };
}

function getLastEvent(
  events: readonly FortyTwoEventEnvelope[]
): FortyTwoEventEnvelope {
  const lastEvent = events[events.length - 1];

  if (!lastEvent) {
    throw new Error("Replay fixture did not create events.");
  }

  return lastEvent;
}
