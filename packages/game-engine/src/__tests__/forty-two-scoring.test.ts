import assert from "node:assert/strict";
import test from "node:test";

import {
  FORTY_TWO_HAND_TOTAL_POINTS,
  FORTY_TWO_TEAMS,
  createDomino,
  createDoubleSixSet,
  createNumericBid,
  getCompletedTrickCountPoints,
  getTeamForSeat,
  isCountDomino,
  scoreCompletedHand,
  scoreCompletedTricks,
  standardRules,
  type Contract,
  type CompletedTrick,
  type Domino,
  type DominoSuit,
  type SeatIndex,
  type Trick
} from "../index.ts";

test("scores a made bid exactly", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 1, 0, 1]),
    createContract(0, 30),
    standardRules
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
    createContract(0, 30),
    standardRules
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
    createContract(0, 31),
    standardRules
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
    createContract(0, 30),
    standardRules
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
    createContract(0, 30),
    standardRules
  );

  const biddingTeamCountPoints = score.tricksByTeam.teamA.reduce(
    (total, trickScore) => total + trickScore.countPoints,
    0
  );

  assert.equal(biddingTeamCountPoints, 0);
  assert.equal(score.biddingTeamPoints, 2);
  assert.equal(score.outcome, "set");
});

test("scores completed tricks for in-hand progress", () => {
  const score = scoreCompletedTricks(
    createCompletedTricks([0, 1, 2, 3, 0, 1, 2]).slice(0, 2)
  );

  assert.equal(score.teamPoints.teamA, 6);
  assert.equal(score.teamPoints.teamB, 6);
  assert.equal(score.teamTrickCounts.teamA, 1);
  assert.equal(score.teamTrickCounts.teamB, 1);
  assert.equal(score.totalPoints, 12);
  assert.equal(score.trickScores.length, 2);
});

test("proves total hand points equal 42", () => {
  const completedTricks = createCompletedTricks([0, 1, 2, 3, 0, 1, 2]);
  const score = scoreCompletedHand(completedTricks, createContract(0, 30), standardRules);

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

test("seats 0 and 2 map to teamA (North/South)", () => {
  assert.equal(getTeamForSeat(0), "teamA");
  assert.equal(getTeamForSeat(2), "teamA");
  assert.equal(FORTY_TWO_TEAMS.teamA.name, "North/South");
});

test("seats 1 and 3 map to teamB (East/West)", () => {
  assert.equal(getTeamForSeat(1), "teamB");
  assert.equal(getTeamForSeat(3), "teamB");
  assert.equal(FORTY_TWO_TEAMS.teamB.name, "East/West");
});

test("a bid won by seat 1 (East) reports teamB (East/West) as bidding team", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([1, 3, 1, 3, 1, 1, 1]),
    createContract(1, 30),
    standardRules
  );

  assert.equal(score.declarer, 1);
  assert.equal(score.biddingTeamId, "teamB");
});

test("a bid won by seat 2 (South) reports teamA (North/South) as bidding team", () => {
  const score = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 0, 0, 0]),
    createContract(2, 30),
    standardRules
  );

  assert.equal(score.declarer, 2);
  assert.equal(score.biddingTeamId, "teamA");
});

test("hand summaries do not relabel teams based on bid winner", () => {
  const scoreTeamADeclares = scoreCompletedHand(
    createCompletedTricks([0, 2, 0, 2, 1, 0, 1]),
    createContract(0, 30),
    standardRules
  );
  const scoreTeamBDeclares = scoreCompletedHand(
    createCompletedTricks([1, 3, 1, 3, 1, 0, 2]),
    createContract(1, 30),
    standardRules
  );

  assert.equal(scoreTeamADeclares.biddingTeamId, "teamA");
  assert.equal(scoreTeamBDeclares.biddingTeamId, "teamB");
  // Both scores must reference the same stable team IDs regardless of who bid
  assert.notEqual(scoreTeamADeclares.biddingTeamId, scoreTeamBDeclares.biddingTeamId);
  assert.equal(scoreTeamADeclares.teamPoints.teamA + scoreTeamADeclares.teamPoints.teamB, 42);
  assert.equal(scoreTeamBDeclares.teamPoints.teamA + scoreTeamBDeclares.teamPoints.teamB, 42);
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

function createContract(seat: SeatIndex, amount: number): Contract {
  return {
    bid: createNumericBid(amount),
    declarer: seat,
    kind: "standardNumeric",
    trump: {
      kind: "pip",
      suit: "sixes"
    },
    trumpSuit: "sixes"
  };
}
