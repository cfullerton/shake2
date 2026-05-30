import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiplayerActionEnvelope,
  createMultiplayerRoom,
  createNumericBid,
  createPassBid,
  getMultiplayerPlayerView,
  joinMultiplayerRoom,
  replayFortyTwoEvents,
  startMultiplayerGame,
  submitMultiplayerGameAction,
  takeMultiplayerSeat,
  type EngineContext,
  type MultiplayerGameSession,
  type MultiplayerResult,
  type MultiplayerRoom,
  type MultiplayerSubmitActionResult,
  type SeatIndex
} from "../index.ts";

test("multiplayer room seats four players and starts a dealt authoritative game", () => {
  const context = createTestContext();
  const room = createReadyRoom(context);
  const session = unwrapResult(
    startMultiplayerGame(
      room,
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1"
      },
      context
    )
  );

  assert.equal(session.room.status, "inGame");
  assert.equal(session.room.gameId, "game-1");
  assert.equal(session.snapshot.snapshot.phase, "dealt");
  assert.equal(session.snapshot.snapshot.mode, "multiplayer");
  assert.deepEqual(
    session.events.map((event) => event.event.type),
    [
      "fortyTwo.game.created",
      "fortyTwo.hand.dealt"
    ]
  );
  assert.deepEqual(
    replayFortyTwoEvents(session.initialSnapshot, session.events),
    session.snapshot
  );
});

test("multiplayer game start requires the room host", () => {
  const context = createTestContext();
  const room = createReadyRoom(context);
  const result = startMultiplayerGame(
    room,
    {
      actorId: "player-1"
    },
    context
  );

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_ACTOR");
  }
});

test("multiplayer action submission rejects actors claiming another seat", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createNumericBid(30),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actorId: "player-0",
      actorSeat: 1
    },
    context
  );
  const result = submitMultiplayerGameAction(session, action, context);

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_ACTOR");
  }
});

test("multiplayer bidding auto-completes after the fourth bid", () => {
  const context = createTestContext();
  let session = createStartedSession(context);

  session = submitSeatBid(session, 1, createNumericBid(30), context);
  session = submitSeatBid(session, 2, createPassBid(), context);
  session = submitSeatBid(session, 3, createPassBid(), context);

  const finalAction = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createPassBid(),
          seat: 0
        },
        type: "fortyTwo.bid.submit"
      },
      actorId: "player-0"
    },
    context
  );
  const result = submitMultiplayerGameAction(session, finalAction, context);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(
      result.events.map((event) => event.event.type),
      [
        "fortyTwo.bid.submitted",
        "fortyTwo.bidding.completed"
      ]
    );
    assert.equal(result.snapshot.snapshot.phase, "trump");

    if (result.snapshot.snapshot.phase === "trump") {
      assert.equal(result.snapshot.snapshot.trump.declarer, 1);
    }

    assert.deepEqual(
      replayFortyTwoEvents(result.session.initialSnapshot, result.session.events),
      result.session.snapshot
    );
  }
});

test("multiplayer action IDs are idempotent", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid: createPassBid(),
          seat: 1
        },
        type: "fortyTwo.bid.submit"
      },
      actionId: "duplicate-action",
      actorId: "player-1"
    },
    context
  );
  const first = submitMultiplayerGameAction(session, action, context);
  const firstSession = unwrapSubmit(first).session;
  const duplicate = submitMultiplayerGameAction(firstSession, action, context);

  assert.equal(duplicate.ok, true);

  if (duplicate.ok && first.ok) {
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.events, first.events);
    assert.equal(duplicate.session.events.length, firstSession.events.length);
  }
});

test("multiplayer player views redact other players' hands", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const view = unwrapResult(getMultiplayerPlayerView(session, "player-0"));

  assert.equal(view.viewerSeat, 0);
  assert.equal(view.snapshot.snapshot.phase, "dealt");

  if (
    session.snapshot.snapshot.phase !== "dealt" ||
    view.snapshot.snapshot.phase !== "dealt"
  ) {
    throw new Error("Expected dealt snapshots.");
  }

  assert.equal("hands" in view.snapshot.snapshot, false);
  assert.deepEqual(view.snapshot.snapshot.handCounts, {
    0: 7,
    1: 7,
    2: 7,
    3: 7
  });
  assert.deepEqual(
    view.snapshot.snapshot.viewerHand,
    session.snapshot.snapshot.hands[0]
  );
});

function createStartedSession(context: EngineContext): MultiplayerGameSession {
  return unwrapResult(
    startMultiplayerGame(
      createReadyRoom(context),
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1"
      },
      context
    )
  );
}

function createReadyRoom(context: EngineContext): MultiplayerRoom {
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
    },
    context
  );

  for (const playerId of ["player-1", "player-2", "player-3"]) {
    room = unwrapResult(
      joinMultiplayerRoom(
        room,
        {
          displayName: `Player ${playerId.at(-1)}`,
          playerId
        },
        context
      )
    );
  }

  for (const seat of [0, 1, 2, 3] as const) {
    room = unwrapResult(
      takeMultiplayerSeat(
        room,
        {
          playerId: playerIdForSeat(seat),
          seat
        },
        context
      )
    );
  }

  assert.equal(room.status, "ready");
  return room;
}

function submitSeatBid(
  session: MultiplayerGameSession,
  seat: SeatIndex,
  bid: ReturnType<typeof createNumericBid> | ReturnType<typeof createPassBid>,
  context: EngineContext
): MultiplayerGameSession {
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: {
        payload: {
          bid,
          seat
        },
        type: "fortyTwo.bid.submit"
      },
      actorId: playerIdForSeat(seat)
    },
    context
  );

  return unwrapSubmit(
    submitMultiplayerGameAction(session, action, context)
  ).session;
}

function playerIdForSeat(seat: SeatIndex): string {
  return `player-${seat}`;
}

function unwrapResult<TValue>(result: MultiplayerResult<TValue>): TValue {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function unwrapSubmit(
  result: MultiplayerSubmitActionResult
): Extract<MultiplayerSubmitActionResult, { readonly ok: true }> {
  if (!result.ok) {
    throw result.error;
  }

  return result;
}

function createTestContext(): EngineContext {
  let id = 0;
  let randomState = 42;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `test-id-${id}`;
    },
    now: () => {
      time += 1;
      return new Date(Date.UTC(2026, 4, 30, 12, 0, 0) + time * 1000)
        .toISOString();
    },
    random: () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 0x100000000;
    }
  };
}
