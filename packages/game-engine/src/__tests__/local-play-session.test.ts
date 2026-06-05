import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocalHumanAction,
  callLocalGameTrumpSelection,
  continueLocalGameSession,
  createDomino,
  createLocalGameSession,
  getLocalGameActivityLog,
  getLocalGameCurrentTurnSeat,
  getLocalGameView,
  replayFortyTwoEvents,
  restartLocalGameSession,
  sortDominoesForLocalPlay,
  type EngineContext,
  type LocalGameSession,
  type LocalHandSummary
} from "../index.ts";

test("local game session starts a playable game and waits for human input", () => {
  const context = createSimulationContext(1);
  const session = createLocalGameSession({ targetMarks: 7 }, context);
  const view = getLocalGameView(session);

  assert.notEqual(view.kind, "waiting");
  assert.equal(getLocalGameCurrentTurnSeat(session), session.humanSeat);
  assertReplayMatches(session);
});

test("local game activity log describes bot actions", () => {
  const context = createSimulationContext(1);
  const session = createLocalGameSession({ targetMarks: 7 }, context);
  const activity = getLocalGameActivityLog(session, 8).map((entry) => entry.text);

  assert.equal(activity.some((entry) => entry.includes("Hand 1 dealt")), true);
  assert.equal(
    activity.some((entry) => entry.includes("Bot East") && /passed|bid/.test(entry)),
    true
  );
});

test("local practice exposes and plays a no-trump contract when enabled", () => {
  const context = createAlwaysPassContext();
  let session = createLocalGameSession(
    {
      targetMarks: 7,
      variants: {
        noTrump: true
      }
    },
    context
  );

  session = applyLocalHumanAction(session, context);

  const view = getLocalGameView(session);

  assert.equal(view.kind, "trumpSelection");

  if (view.kind !== "trumpSelection") {
    throw new Error("Expected trump selection view.");
  }

  assert.equal(
    view.legalTrumpCalls.some((call) => call.selection.kind === "none"),
    true
  );

  session = callLocalGameTrumpSelection(
    session,
    {
      kind: "none"
    },
    context
  );

  assert.equal(session.snapshot.snapshot.phase, "trickPlay");

  if (session.snapshot.snapshot.phase === "trickPlay") {
    assert.equal(session.snapshot.snapshot.contract.kind, "noTrump");
  }

  assert.equal(
    getLocalGameActivityLog(session, 8).some((entry) =>
      entry.text.includes("called No Trump")
    ),
    true
  );
  assertReplayMatches(session);
});

test("local practice can enable auto hand completion when decided", () => {
  const context = createSimulationContext(9);
  const session = createLocalGameSession(
    {
      handCompletionMode: "autoEndWhenDecided",
      targetMarks: 7
    },
    context
  );

  assert.equal(session.snapshot.snapshot.rules.handCompletionMode, "autoEndWhenDecided");
});

test("sorts local domino hands with trump first and high dominoes descending", () => {
  const sorted = sortDominoesForLocalPlay(
    [
      createDomino(3, 2),
      createDomino(6, 0),
      createDomino(5, 5),
      createDomino(6, 6),
      createDomino(4, 1)
    ],
    "sixes"
  ).map((domino) => `${domino.high}-${domino.low}`);

  assert.deepEqual(sorted, ["6-6", "6-0", "5-5", "4-1", "3-2"]);
});

test("local game session supports restart/reset", () => {
  const context = createSimulationContext(2);
  const session = playUntilHandSummary(
    createLocalGameSession({ targetMarks: 7 }, context),
    context
  );
  const restarted = restartLocalGameSession(session, context);

  assert.notEqual(restarted.snapshot.gameId, session.snapshot.gameId);
  assert.deepEqual(restarted.snapshot.snapshot.marks, {
    teamA: 0,
    teamB: 0
  });
  assert.equal(restarted.snapshot.snapshot.handNumber, 1);
  assertReplayMatches(restarted);
});

test("local game session rotates dealers across hands", () => {
  const context = createSimulationContext(3);
  let session = createLocalGameSession({ targetMarks: 100 }, context);

  for (let completedHands = 1; completedHands <= 4; completedHands += 1) {
    session = playUntilHandSummary(session, context);
    assert.equal(session.snapshot.snapshot.dealer, completedHands % 4);
    assert.equal(session.snapshot.snapshot.handNumber, completedHands + 1);
    assertReplayMatches(session);
    session = continueLocalGameSession(session, context);
  }
});

test("legal random bots complete 100 hands without illegal states", () => {
  const context = createSimulationContext(42);
  let session = createLocalGameSession({ targetMarks: 1000 }, context);
  let completedHands = 0;

  while (completedHands < 100) {
    session = playUntilHandSummary(session, context);

    if (!session.lastHandSummary) {
      throw new Error("Expected completed hand summary.");
    }

    assertHandSummaryIsPossible(session.lastHandSummary);
    assertReplayMatches(session);
    completedHands += 1;
    session = continueLocalGameSession(session, context);
  }

  assert.equal(completedHands, 100);
  assert.equal(session.snapshot.snapshot.phase === "gameComplete", false);
});

test("legal random bots complete 25 games without replay mismatch or impossible scores", () => {
  for (let gameIndex = 0; gameIndex < 25; gameIndex += 1) {
    const context = createSimulationContext(1000 + gameIndex);
    const session = playUntilGameComplete(
      createLocalGameSession({ targetMarks: 1 }, context),
      context
    );

    assert.equal(session.snapshot.snapshot.phase, "gameComplete");
    assert.equal(session.lastHandSummary?.handScore.totalPoints, 42);
    assertReplayMatches(session);

    if (session.snapshot.snapshot.phase === "gameComplete") {
      assert.equal(
        session.snapshot.snapshot.marks[session.snapshot.snapshot.winningTeamId],
        1
      );
    }
  }
});

function playUntilHandSummary(
  initialSession: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  let session = initialSession;

  for (let step = 0; step < 500; step += 1) {
    const view = getLocalGameView(session);

    if (view.kind === "handSummary" || view.kind === "gameSummary") {
      return session;
    }

    session = applyLocalHumanAction(session, context);
  }

  throw new Error("Local game did not reach hand summary.");
}

function playUntilGameComplete(
  initialSession: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  let session = initialSession;

  for (let step = 0; step < 2000; step += 1) {
    const view = getLocalGameView(session);

    if (view.kind === "gameSummary") {
      return session;
    }

    session = view.kind === "handSummary"
      ? continueLocalGameSession(session, context)
      : applyLocalHumanAction(session, context);
  }

  throw new Error("Local game did not complete.");
}

function assertHandSummaryIsPossible(summary: LocalHandSummary): void {
  const teamPoints = summary.handScore.teamPoints;
  const markAwards = summary.handScore.markAwards;

  assert.equal(summary.completedTricks.length, 7);
  assert.equal(summary.handScore.totalPoints, 42);
  assert.equal(teamPoints.teamA + teamPoints.teamB, 42);
  assert.equal(markAwards.teamA + markAwards.teamB, 1);
  assert.equal(summary.handScore.biddingTeamPoints >= 0, true);
  assert.equal(summary.handScore.biddingTeamPoints <= 42, true);
}

function assertReplayMatches(session: LocalGameSession): void {
  assert.deepEqual(
    replayFortyTwoEvents(session.initialSnapshot, session.events),
    session.snapshot
  );
}

function createSimulationContext(seed: number): EngineContext {
  let id = 0;
  let randomState = seed;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `sim-${seed}-${id}`;
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

function createAlwaysPassContext(): EngineContext {
  let id = 0;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `no-trump-${id}`;
    },
    now: () => {
      time += 1;
      return new Date(Date.UTC(2026, 4, 30, 12, 0, 0) + time * 1000)
        .toISOString();
    },
    random: () => 0.99
  };
}
