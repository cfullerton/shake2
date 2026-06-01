import assert from "node:assert/strict";
import test from "node:test";

import {
  createDomino,
  determineTrickWinner,
  determineTrickWinnerForContract,
  getLegalLedSuitsForContract,
  getLegalLedSuits,
  isEngineError,
  isTrickComplete,
  playDominoToTrick,
  startTrick,
  type Domino,
  type DominoSuit,
  type FortyTwoHands,
  type SeatIndex,
  type Trick,
  type TrumpSuit
} from "../index.ts";

test("highest trump wins a trick", () => {
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 5)],
    1: [createDomino(5, 4)],
    2: [createDomino(6, 0)],
    3: [createDomino(4, 4)]
  });

  ({ trick, hands } = play(trick, hands, 0, createDomino(5, 5), "fives"));
  ({ trick, hands } = play(trick, hands, 1, createDomino(5, 4)));
  ({ trick, hands } = play(trick, hands, 2, createDomino(6, 0)));
  ({ trick, hands } = play(trick, hands, 3, createDomino(4, 4)));

  assert.equal(isTrickComplete(trick), true);
  assert.equal(determineTrickWinner(trick, "sixes"), 2);
});

test("highest led-suit domino wins when no trump is played", () => {
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(3, 3)],
    3: [createDomino(5, 4)]
  });

  ({ trick, hands } = play(trick, hands, 0, createDomino(5, 2), "fives"));
  ({ trick, hands } = play(trick, hands, 1, createDomino(5, 5)));
  ({ trick, hands } = play(trick, hands, 2, createDomino(3, 3)));
  ({ trick, hands } = play(trick, hands, 3, createDomino(5, 4)));

  assert.equal(determineTrickWinner(trick, "sixes"), 1);
});

test("requires a player to follow led suit when able", () => {
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5), createDomino(3, 3)]
  });

  ({ trick, hands } = play(trick, hands, 0, createDomino(5, 2), "fives"));

  assert.throws(
    () => play(trick, hands, 1, createDomino(3, 3)),
    (error) => isEngineError(error) && error.code === "MUST_FOLLOW_SUIT"
  );
});

test("allows sloughing only when player cannot follow led suit", () => {
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(3, 3), createDomino(6, 0)]
  });

  ({ trick, hands } = play(trick, hands, 0, createDomino(5, 2), "fives"));
  ({ trick, hands } = play(trick, hands, 1, createDomino(3, 3)));

  assert.equal(trick.playedDominoes.length, 2);
});

test("uses the high pip as the only led suit for non-trump dominoes", () => {
  assert.deepEqual(getLegalLedSuits(createDomino(6, 4), "fives"), ["sixes"]);
  assert.deepEqual(getLegalLedSuits(createDomino(4, 2), "sixes"), ["fours"]);
});

test("contract helpers preserve standard numeric led-suit and winner behavior", () => {
  const contract = createStandardNumericContract("sixes");
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5)],
    2: [createDomino(3, 3)],
    3: [createDomino(5, 4)]
  });

  assert.deepEqual(getLegalLedSuitsForContract(createDomino(6, 4), contract), ["sixes"]);

  ({ trick, hands } = play(trick, hands, 0, createDomino(5, 2), "fives"));
  ({ trick, hands } = play(trick, hands, 1, createDomino(5, 5)));
  ({ trick, hands } = play(trick, hands, 2, createDomino(3, 3)));
  ({ trick, hands } = play(trick, hands, 3, createDomino(5, 4)));

  assert.equal(determineTrickWinnerForContract(trick, contract), 1);
});

test("no-trump contracts have no trump override", () => {
  const contract = createNoTrumpContract();
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(6, 0)],
    2: [createDomino(5, 5)],
    3: [createDomino(4, 4)]
  });

  assert.deepEqual(getLegalLedSuitsForContract(createDomino(6, 4), contract), ["sixes"]);

  ({ trick, hands } = playForContract(trick, hands, 0, createDomino(5, 2), contract, "fives"));
  ({ trick, hands } = playForContract(trick, hands, 1, createDomino(6, 0), contract));
  ({ trick, hands } = playForContract(trick, hands, 2, createDomino(5, 5), contract));
  ({ trick, hands } = playForContract(trick, hands, 3, createDomino(4, 4), contract));

  assert.equal(determineTrickWinnerForContract(trick, contract), 2);
});

test("no-trump contracts require following the led pip when able", () => {
  const contract = createNoTrumpContract();
  let trick = startTrick(0);
  let hands = createHands({
    0: [createDomino(5, 2)],
    1: [createDomino(5, 5), createDomino(6, 0)]
  });

  ({ trick, hands } = playForContract(trick, hands, 0, createDomino(5, 2), contract, "fives"));

  assert.throws(
    () => playForContract(trick, hands, 1, createDomino(6, 0), contract),
    (error) => isEngineError(error) && error.code === "MUST_FOLLOW_SUIT"
  );
});

test("rejects play out of turn", () => {
  const trick = startTrick(0);
  const hands = createHands({
    1: [createDomino(5, 5)]
  });

  assert.throws(
    () => play(trick, hands, 1, createDomino(5, 5), "fives"),
    (error) => isEngineError(error) && error.code === "NOT_PLAYERS_TURN"
  );
});

test("rejects a domino not held by the player", () => {
  const trick = startTrick(0);
  const hands = createHands({
    0: [createDomino(5, 2)]
  });

  assert.throws(
    () => play(trick, hands, 0, createDomino(5, 3), "fives"),
    (error) => isEngineError(error) && error.code === "INVALID_DOMINO"
  );
});

test("rejects led suit that is illegal for the led domino", () => {
  const trick = startTrick(0);
  const hands = createHands({
    0: [createDomino(5, 4)]
  });

  assert.throws(
    () => play(trick, hands, 0, createDomino(5, 4), "fours"),
    (error) => isEngineError(error) && error.code === "INVALID_TRUMP"
  );
});

function play(
  trick: Trick,
  hands: FortyTwoHands,
  seat: SeatIndex,
  domino: Domino,
  ledSuit?: DominoSuit
) {
  return playDominoToTrick({
    domino,
    hands,
    ...(ledSuit ? { ledSuit } : {}),
    seat,
    trick,
    trumpSuit: "sixes"
  });
}

function playForContract(
  trick: Trick,
  hands: FortyTwoHands,
  seat: SeatIndex,
  domino: Domino,
  contract: ReturnType<typeof createNoTrumpContract>,
  ledSuit?: DominoSuit
) {
  return playDominoToTrick({
    contract,
    domino,
    hands,
    ...(ledSuit ? { ledSuit } : {}),
    seat,
    trick
  });
}

function createHands(
  cardsBySeat: Partial<Record<SeatIndex, readonly Domino[]>>
): FortyTwoHands {
  return {
    0: cardsBySeat[0] ?? [],
    1: cardsBySeat[1] ?? [],
    2: cardsBySeat[2] ?? [],
    3: cardsBySeat[3] ?? []
  };
}

function createStandardNumericContract(
  trumpSuit: TrumpSuit
) {
  return {
    bid: { amount: 30, kind: "numeric" as const },
    declarer: 0 as SeatIndex,
    kind: "standardNumeric" as const,
    trump: {
      kind: "pip" as const,
      suit: trumpSuit
    },
    trumpSuit
  };
}

function createNoTrumpContract() {
  return {
    bid: { amount: 30, kind: "numeric" as const },
    declarer: 0 as SeatIndex,
    kind: "noTrump" as const,
    trump: {
      kind: "none" as const
    }
  };
}
