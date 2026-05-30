import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_HAND_TOTAL_POINTS,
  createDomino,
  createDoubleSixSet,
  createNumericBid,
  getCompletedTrickCountPoints,
  isCountDomino,
  scoreCompletedHand,
  type CompletedTrick,
  type Domino,
  type DominoSuit,
  type SeatIndex,
  type Trick,
  type WinningBid
} from "../index.ts";

test("scores a made bid exactly", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 1, 0, 1]),
    createWinningBid(0, 30)
  );

  assert.equal(score.biddingTeamId, "teamA");
  assert.equal(score.biddingTeamPoints, 30);
  assert.equal(score.teamPoints.teamA, 30);
  assert.equal(score.teamPoints.teamB, 12);
  assert.equal(score.teamTrickCounts.teamA, 5);
  assert.equal(score.outcome, "made");
  assert.deepEqual(score.markAwards, {
    teamA: 1,
    teamB: 0
  });
});

test("scores a made bid over target", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 0, 1, 1]),
    createWinningBid(0, 30)
  );

  assert.equal(score.biddingTeamPoints, 40);
  assert.equal(score.outcome, "made");
  assert.deepEqual(score.markAwards, {
    teamA: 1,
    teamB: 0
  });
});

test("sets a bid missed by one point", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 1, 0, 1]),
    createWinningBid(0, 31)
  );

  assert.equal(score.biddingTeamPoints, 30);
  assert.equal(score.outcome, "set");
  assert.deepEqual(score.markAwards, {
    teamA: 0,
    teamB: 1
  });
});

test("scores all count dominoes captured by the bidding team", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 0, 1, 1]),
    createWinningBid(0, 30)
  );

  const biddingTeamCountPoints = score.tricksByTeam.teamA.reduce(
    (total, trickScore) => total + trickScore.countPoints,
    0
  );

  assert.equal(biddingTeamCountPoints, 35);
  assert.equal(score.biddingTeamPoints, 40);
  assert.equal(score.tricksByTeam.teamA.length, 5);
});

test("scores no count dominoes captured by the bidding team", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([1, 3, 1, 3, 1, 0, 2]),
    createWinningBid(0, 30)
  );

  const biddingTeamCountPoints = score.tricksByTeam.teamA.reduce(
    (total, trickScore) => total + trickScore.countPoints,
    0
  );

  assert.equal(biddingTeamCountPoints, 0);
  assert.equal(score.biddingTeamPoints, 2);
  assert.equal(score.outcome, "set");
});

test("proves total hand points equal 42", () => {
  const completedTricks = createCompletedTricks([0, 1, 2, 3, 0, 1, 2]);
  const score = scoreCompletedHand(completedTricks, createWinningBid(0, 30));

  const trickPointTotal = score.trickScores.reduce(
    (total, trickScore) => total + trickScore.trickPoints,
    0
  );
  const countPointTotal = score.trickScores.reduce(
    (total, trickScore) => total + getCompletedTrickCountPoints(trickScore),
    0
  );

  assert.equal(trickPointTotal, 7);
  assert.equal(countPointTotal, 35);
  assert.equal(score.totalPoints, FORTY_TWO_HAND_TOTAL_POINTS);
  assert.equal(score.teamPoints.teamA + score.teamPoints.teamB, 42);
});

type TestTrickDominoes = readonly [Domino, Domino, Domino, Domino];

function createCompletedTricks(
  winners: readonly [
    SeatIndex,
    SeatIndex,
    SeatIndex,
    SeatIndex,
    SeatIndex,
    SeatIndex,
    SeatIndex
  ]
): readonly CompletedTrick[] {
  const trickDominoes = createStandardTrickDominoes();

  return [
    createCompletedTrick(trickDominoes[0], winners[0]),
    createCompletedTrick(trickDominoes[1], winners[1]),
    createCompletedTrick(trickDominoes[2], winners[2]),
    createCompletedTrick(trickDominoes[3], winners[3]),
    createCompletedTrick(trickDominoes[4], winners[4]),
    createCompletedTrick(trickDominoes[5], winners[5]),
    createCompletedTrick(trickDominoes[6], winners[6])
  ];
}

function createCompletedTrick(
  dominoes: TestTrickDominoes,
  winner: SeatIndex
): CompletedTrick {
  const ledSuit: DominoSuit = "sixes";

  return {
    trick: {
      leader: 0,
      ledDomino: dominoes[0],
      ledSuit,
      playedDominoes: [
        {
          domino: dominoes[0],
          seat: 0
        },
        {
          domino: dominoes[1],
          seat: 1
        },
        {
          domino: dominoes[2],
          seat: 2
        },
        {
          domino: dominoes[3],
          seat: 3
        }
      ]
    } satisfies Trick,
    winner
  };
}

function createStandardTrickDominoes(): readonly [
  TestTrickDominoes,
  TestTrickDominoes,
  TestTrickDominoes,
  TestTrickDominoes,
  TestTrickDominoes,
  TestTrickDominoes,
  TestTrickDominoes
] {
  const countDominoes = [
    createDomino(5, 0),
    createDomino(4, 1),
    createDomino(3, 2),
    createDomino(5, 5),
    createDomino(6, 4)
  ] as const;
  const nonCountDominoes = createDoubleSixSet().filter(
    (domino) => !isCountDomino(domino)
  );
  let nonCountIndex = 0;
  const nextNonCountDomino = (): Domino => {
    const domino = nonCountDominoes[nonCountIndex];

    if (!domino) {
      throw new Error("Not enough non-count dominoes for test hand.");
    }

    nonCountIndex += 1;
    return domino;
  };

  return [
    [
      countDominoes[0],
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      countDominoes[1],
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      countDominoes[2],
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      countDominoes[3],
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      countDominoes[4],
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ],
    [
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino(),
      nextNonCountDomino()
    ]
  ];
}

function createWinningBid(seat: SeatIndex, amount: number): WinningBid {
  return {
    bid: createNumericBid(amount),
    forced: false,
    seat
  };
}
