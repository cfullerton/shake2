import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocalHumanAction,
  createLocalGameSession,
  replayValidatedFortyTwoEvents,
  type EngineContext,
  type FortyTwoEventEnvelope,
  type LocalGameSession,
  type SeatIndex
} from "../index.ts";

test("validated replay accepts command-emitted forty-two events", () => {
  const context = createSimulationContext(21);
  const session = playUntilHandSummary(
    createLocalGameSession({ targetMarks: 100 }, context),
    context
  );

  assert.deepEqual(
    replayValidatedFortyTwoEvents(session.initialSnapshot, session.events),
    session.snapshot
  );
});

test("validated replay rejects a forged trick winner", () => {
  const context = createSimulationContext(22);
  const session = playUntilHandSummary(
    createLocalGameSession({ targetMarks: 100 }, context),
    context
  );
  const forgedEvents = replaceFirstEvent(
    session.events,
    "fortyTwo.trick.completed",
    (event) => {
      const forgedEvent = event as any;
      const winner = forgedEvent.event.payload.completedTrick.winner;

      return {
        ...forgedEvent,
        event: {
          ...forgedEvent.event,
          payload: {
            ...forgedEvent.event.payload,
            completedTrick: {
              ...forgedEvent.event.payload.completedTrick,
              winner: ((winner + 1) % 4) as SeatIndex
            }
          }
        }
      } as FortyTwoEventEnvelope;
    }
  );

  assert.throws(
    () => replayValidatedFortyTwoEvents(session.initialSnapshot, forgedEvents),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("validated replay rejects a forged hand score", () => {
  const context = createSimulationContext(23);
  const session = playUntilHandSummary(
    createLocalGameSession({ targetMarks: 100 }, context),
    context
  );
  const forgedEvents = replaceFirstEvent(
    session.events,
    "fortyTwo.hand.completed",
    (event) => {
      const forgedEvent = event as any;

      return {
        ...forgedEvent,
        event: {
          ...forgedEvent.event,
          payload: {
            ...forgedEvent.event.payload,
            handScore: {
              ...forgedEvent.event.payload.handScore,
              totalPoints: 41
            }
          }
        }
      } as FortyTwoEventEnvelope;
    }
  );

  assert.throws(
    () => replayValidatedFortyTwoEvents(session.initialSnapshot, forgedEvents),
    {
      code: "INVALID_ACTION"
    }
  );
});

test("validated replay rejects unsupported event schema versions", () => {
  const context = createSimulationContext(24);
  const session = createLocalGameSession({ targetMarks: 100 }, context);
  const firstEvent = session.events[0];

  if (!firstEvent) {
    throw new Error("Expected at least one event.");
  }

  const forgedEvents: readonly FortyTwoEventEnvelope[] = [
    {
      ...firstEvent,
      schemaVersion: 999 as FortyTwoEventEnvelope["schemaVersion"]
    },
    ...session.events.slice(1)
  ];

  assert.throws(
    () => replayValidatedFortyTwoEvents(session.initialSnapshot, forgedEvents),
    {
      code: "SCHEMA_VERSION_UNSUPPORTED"
    }
  );
});

test("validated replay rejects unsupported contract kinds", () => {
  const context = createSimulationContext(25);
  const session = playUntilHandSummary(
    createLocalGameSession({ targetMarks: 100 }, context),
    context
  );
  const forgedEvents = replaceFirstEvent(
    session.events,
    "fortyTwo.trump.called",
    (event) => {
      const forgedEvent = event as any;

      return {
        ...forgedEvent,
        event: {
          ...forgedEvent.event,
          payload: {
            ...forgedEvent.event.payload,
            contract: {
              ...forgedEvent.event.payload.contract,
              kind: "unsupportedContract"
            }
          }
        }
      } as FortyTwoEventEnvelope;
    }
  );

  assert.throws(
    () => replayValidatedFortyTwoEvents(session.initialSnapshot, forgedEvents),
    {
      code: "INVALID_ACTION"
    }
  );
});

function playUntilHandSummary(
  initialSession: LocalGameSession,
  context: EngineContext
): LocalGameSession {
  let session = initialSession;

  for (let step = 0; step < 500; step += 1) {
    if (session.lastHandSummary) {
      return session;
    }

    session = applyLocalHumanAction(session, context);
  }

  throw new Error("Local game did not reach hand summary.");
}

function replaceFirstEvent(
  events: readonly FortyTwoEventEnvelope[],
  eventType: FortyTwoEventEnvelope["event"]["type"],
  replace: (event: FortyTwoEventEnvelope) => FortyTwoEventEnvelope
): readonly FortyTwoEventEnvelope[] {
  let replaced = false;

  return events.map((event) => {
    if (!replaced && event.event.type === eventType) {
      replaced = true;
      return replace(event);
    }

    return event;
  });
}

function createSimulationContext(seed: number): EngineContext {
  let id = 0;
  let randomState = seed;
  let time = 0;

  return {
    newId: () => {
      id += 1;
      return `validation-${seed}-${id}`;
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
