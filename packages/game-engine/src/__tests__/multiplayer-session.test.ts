import assert from "node:assert/strict";
import test from "node:test";

import {
  addMultiplayerBot,
  advanceMultiplayerBots,
  createMultiplayerActionEnvelope,
  createMultiplayerRoom,
  createNumericBid,
  createPassBid,
  chooseLegalRandomBotDecision,
  getMultiplayerPlayerView,
  joinMultiplayerRoom,
  replayFortyTwoEvents,
  startMultiplayerGame,
  startNextMultiplayerHand,
  submitMultiplayerGameAction,
  submitMultiplayerGameActionWithBots,
  takeMultiplayerSeat,
  type EngineContext,
  type LegalRandomBotDecision,
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

test("multiplayer game start can enable variant rules", () => {
  const context = createTestContext();
  const room = createReadyRoom(context);
  const session = unwrapResult(
    startMultiplayerGame(
      room,
      {
        actorId: "player-0",
        gameId: "game-1",
        targetMarks: 5,
        variants: {
          markBids: true,
          noTrump: true
        }
      },
      context
    )
  );

  assert.equal(session.snapshot.snapshot.rules.enabledContracts.markBids, true);
  assert.equal(session.snapshot.snapshot.rules.enabledContracts.noTrump, true);
  assert.equal(session.snapshot.snapshot.rules.targetMarks, 5);
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

test("multiplayer host can fill open seats with bots", () => {
  const context = createTestContext();
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
    },
    context
  );

  room = unwrapResult(
    takeMultiplayerSeat(
      room,
      {
        playerId: "player-0",
        seat: 0
      },
      context
    )
  );

  for (const seat of [1, 2, 3] as const) {
    room = unwrapResult(
      addMultiplayerBot(
        room,
        {
          actorId: "player-0",
          seat
        },
        context
      )
    );
  }

  assert.equal(room.status, "ready");
  assert.equal(room.participants["bot-seat-1"]?.kind, "bot");
  assert.equal(room.seats[1]?.displayName, "Bot East");
});

test("multiplayer bot seats advance to the next human turn after game start", () => {
  const context = createTestContext();
  const room = createHumanAndBotsRoom(context);
  const started = unwrapResult(
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
  const advanced = unwrapResult(
    advanceMultiplayerBots(started, context)
  );

  assert.deepEqual(
    advanced.events.map((event) => event.actorSeat),
    [1, 2, 3]
  );
  assert.deepEqual(
    advanced.events.map((event) => event.event.type),
    [
      "fortyTwo.bid.submitted",
      "fortyTwo.bid.submitted",
      "fortyTwo.bid.submitted"
    ]
  );
  assert.equal(advanced.snapshot.snapshot.phase, "bidding");

  if (advanced.snapshot.snapshot.phase === "bidding") {
    assert.equal(advanced.snapshot.snapshot.bidding.currentSeat, 0);
  }

  assert.deepEqual(
    replayFortyTwoEvents(advanced.session.initialSnapshot, advanced.session.events),
    advanced.session.snapshot
  );
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

test("multiplayer accepted human actions can include consequential bot actions", () => {
  const context = createTestContext();
  let session = unwrapResult(
    advanceMultiplayerBots(
      unwrapResult(
        startMultiplayerGame(
          createHumanAndBotsRoom(context),
          {
            actorId: "player-0",
            dealer: 0,
            gameId: "game-1"
          },
          context
        )
      ),
      context
    )
  ).session;
  let playResult: Extract<MultiplayerSubmitActionResult, { readonly ok: true }> | null = null;
  let playActionId = "";
  let previousActionResultCount = 0;

  for (let index = 0; index < 4 && playResult === null; index += 1) {
    previousActionResultCount = Object.keys(session.actionResults).length;
    const actionId = `human-action-${index}`;
    const result = unwrapSubmit(
      submitMultiplayerGameActionWithBots(
        session,
        createMultiplayerActionEnvelope(
          session,
          {
            action: createBotAction(
              chooseLegalRandomBotDecision({
                context,
                seat: 0,
                snapshot: session.snapshot
              })
            ),
            actionId,
            actorId: "player-0"
          },
          context
        ),
        context
      )
    );

    session = result.session;

    if (result.events.some((event) => event.actorId.startsWith("bot-seat-"))) {
      playResult = result;
      playActionId = actionId;
    }
  }

  if (!playResult) {
    throw new Error("Expected a human action to trigger bot actions.");
  }

  assert.equal(
    Object.keys(playResult.session.actionResults).length,
    previousActionResultCount + 1
  );
  const storedResult = playResult.session.actionResults[playActionId];

  assert.equal(storedResult?.ok, true);

  if (storedResult?.ok) {
    assert.equal(storedResult.events.length, playResult.events.length);
  }
  assert.equal(
    playResult.events.some((event) => event.actorId.startsWith("bot-seat-")),
    true
  );
  assert.deepEqual(
    replayFortyTwoEvents(playResult.session.initialSnapshot, playResult.session.events),
    playResult.session.snapshot
  );
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

test("multiplayer host deals the next hand after a completed hand", () => {
  const context = createTestContext();
  let session = createStartedSession(context, {
    targetMarks: 250
  });

  session = playOneHandToSetup(session, context);
  assert.equal(session.snapshot.snapshot.phase, "setup");
  assert.equal(session.snapshot.snapshot.dealer, 1);
  assert.equal(session.snapshot.snapshot.handNumber, 2);

  const result = startNextMultiplayerHand(
    session,
    {
      actorId: "player-0"
    },
    context
  );

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(
      result.value.events.map((event) => event.event.type),
      ["fortyTwo.hand.dealt"]
    );
    assert.equal(result.value.snapshot.snapshot.phase, "dealt");
    assert.equal(result.value.snapshot.snapshot.dealer, 1);
    assert.equal(result.value.snapshot.snapshot.handNumber, 2);
    assert.deepEqual(
      replayFortyTwoEvents(
        result.value.session.initialSnapshot,
        result.value.session.events
      ),
      result.value.session.snapshot
    );
  }
});

test("multiplayer next-hand deal requires the host and post-hand setup", () => {
  const context = createTestContext();
  const session = createStartedSession(context);
  const nonHost = startNextMultiplayerHand(
    session,
    {
      actorId: "player-1"
    },
    context
  );
  const tooEarly = startNextMultiplayerHand(
    session,
    {
      actorId: "player-0"
    },
    context
  );

  assert.equal(nonHost.ok, false);
  assert.equal(tooEarly.ok, false);

  if (!nonHost.ok) {
    assert.equal(nonHost.error.code, "INVALID_ACTOR");
  }

  if (!tooEarly.ok) {
    assert.equal(tooEarly.error.code, "INVALID_PHASE");
  }
});

function createStartedSession(context: EngineContext): MultiplayerGameSession;
function createStartedSession(
  context: EngineContext,
  options: {
    readonly targetMarks?: number;
  }
): MultiplayerGameSession;
function createStartedSession(
  context: EngineContext,
  options: {
    readonly targetMarks?: number;
  } = {}
): MultiplayerGameSession {
  return unwrapResult(
    startMultiplayerGame(
      createReadyRoom(context),
      {
        actorId: "player-0",
        dealer: 0,
        gameId: "game-1",
        ...(options.targetMarks !== undefined
          ? { targetMarks: options.targetMarks }
          : {})
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

function createHumanAndBotsRoom(context: EngineContext): MultiplayerRoom {
  let room = createMultiplayerRoom(
    {
      hostDisplayName: "Alice",
      hostPlayerId: "player-0",
      roomCode: "ROOM42",
      roomId: "room-1"
    },
    context
  );

  room = unwrapResult(
    takeMultiplayerSeat(
      room,
      {
        playerId: "player-0",
        seat: 0
      },
      context
    )
  );

  for (const seat of [1, 2, 3] as const) {
    room = unwrapResult(
      addMultiplayerBot(
        room,
        {
          actorId: "player-0",
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

function playOneHandToSetup(
  session: MultiplayerGameSession,
  context: EngineContext
): MultiplayerGameSession {
  let nextSession = session;
  let remainingActions = 80;

  while (nextSession.snapshot.snapshot.phase !== "setup" && remainingActions > 0) {
    const seat = getCurrentTurnSeat(nextSession);
    const decision = chooseLegalRandomBotDecision({
      context,
      seat,
      snapshot: nextSession.snapshot
    });

    nextSession = submitBotDecision(nextSession, decision, context);
    remainingActions -= 1;

    if (nextSession.snapshot.snapshot.phase === "gameComplete") {
      throw new Error("Expected test hand not to complete the game.");
    }
  }

  if (nextSession.snapshot.snapshot.phase !== "setup") {
    throw new Error("Expected test session to reach next-hand setup.");
  }

  return nextSession;
}

function getCurrentTurnSeat(session: MultiplayerGameSession): SeatIndex {
  const state = session.snapshot.snapshot;

  if (state.phase === "dealt") {
    return ((state.dealer + 1) % 4) as SeatIndex;
  }

  if (state.phase === "bidding" && state.bidding.currentSeat !== null) {
    return state.bidding.currentSeat;
  }

  if (state.phase === "trump" && state.trump.declarer !== null) {
    return state.trump.declarer;
  }

  if (state.phase === "trickPlay") {
    return ((state.currentTrick.leader +
      state.currentTrick.playedDominoes.length) % 4) as SeatIndex;
  }

  throw new Error(`No current turn seat for phase ${state.phase}.`);
}

function submitBotDecision(
  session: MultiplayerGameSession,
  decision: LegalRandomBotDecision,
  context: EngineContext
): MultiplayerGameSession {
  const action = createMultiplayerActionEnvelope(
    session,
    {
      action: createBotAction(decision),
      actorId: playerIdForSeat(decision.seat)
    },
    context
  );

  return unwrapSubmit(
    submitMultiplayerGameAction(session, action, context)
  ).session;
}

function createBotAction(decision: LegalRandomBotDecision) {
  switch (decision.kind) {
    case "bid":
      return {
        payload: {
          bid: decision.bid,
          seat: decision.seat
        },
        type: "fortyTwo.bid.submit" as const
      };
    case "callTrump":
      return {
        payload: {
          trump: decision.trump
        },
        type: "fortyTwo.trump.call" as const
      };
    case "playDomino":
      return {
        payload: {
          domino: decision.play.domino,
          ...(decision.play.ledSuit ? { ledSuit: decision.play.ledSuit } : {}),
          seat: decision.seat
        },
        type: "fortyTwo.domino.play" as const
      };
  }
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
