import {
  dominoContainsPip,
  getDominoKey,
  isDouble,
  type Domino,
  type Pip
} from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import {
  type FortyTwoHands
} from "./deal.ts";
import {
  getNextSeat,
  type SeatIndex,
  assertSeatIndex
} from "./seats.ts";
import {
  getTrumpDominoRank,
  getTrumpSuitPip,
  isDominoTrump,
  type TrumpSuit
} from "./trump.ts";

export type DominoSuit = TrumpSuit;
export const TRICK_PLAY_COUNT = 4;

export interface PlayedDomino {
  readonly domino: Domino;
  readonly seat: SeatIndex;
}

export interface Trick {
  readonly leader: SeatIndex;
  readonly ledDomino: Domino | null;
  readonly ledSuit: DominoSuit | null;
  readonly playedDominoes: readonly PlayedDomino[];
}

export interface PlayDominoInput {
  readonly domino: Domino;
  readonly hands: FortyTwoHands;
  readonly ledSuit?: DominoSuit;
  readonly seat: SeatIndex;
  readonly trick: Trick;
  readonly trumpSuit: TrumpSuit;
}

export interface PlayDominoResult {
  readonly hands: FortyTwoHands;
  readonly trick: Trick;
}

const DOMINO_SUIT_BY_PIP: Record<Pip, DominoSuit> = {
  0: "blanks",
  1: "ones",
  2: "twos",
  3: "threes",
  4: "fours",
  5: "fives",
  6: "sixes"
};

export function startTrick(leader: SeatIndex): Trick {
  assertSeatIndex(leader);

  return {
    leader,
    ledDomino: null,
    ledSuit: null,
    playedDominoes: []
  };
}

export function playDominoToTrick(input: PlayDominoInput): PlayDominoResult {
  const expectedSeat = getExpectedTrickSeat(input.trick);

  if (input.seat !== expectedSeat) {
    throw new EngineError(
      "NOT_PLAYERS_TURN",
      `Seat ${expectedSeat} must play before seat ${input.seat}.`
    );
  }

  const handsAfterPlay = removeDominoFromHand(
    input.hands,
    input.seat,
    input.domino
  );

  if (input.trick.playedDominoes.length === 0) {
    const ledSuit = input.ledSuit;

    if (!ledSuit) {
      throw new EngineError("INVALID_TRUMP", "Leader must choose a led suit.");
    }

    assertLedSuitForDomino(input.domino, ledSuit, input.trumpSuit);

    return {
      hands: handsAfterPlay,
      trick: {
        leader: input.trick.leader,
        ledDomino: input.domino,
        ledSuit,
        playedDominoes: [
          {
            domino: input.domino,
            seat: input.seat
          }
        ]
      }
    };
  }

  const ledSuit = input.trick.ledSuit;

  if (!ledSuit) {
    throw new EngineError("INVALID_PHASE", "Trick is missing a led suit.");
  }

  assertFollowSuit(input.hands[input.seat], input.domino, ledSuit, input.trumpSuit);

  return {
    hands: handsAfterPlay,
    trick: {
      ...input.trick,
      playedDominoes: [
        ...input.trick.playedDominoes,
        {
          domino: input.domino,
          seat: input.seat
        }
      ]
    }
  };
}

export function determineTrickWinner(
  trick: Trick,
  trumpSuit: TrumpSuit
): SeatIndex {
  if (trick.playedDominoes.length === 0) {
    throw new EngineError("INVALID_PHASE", "Cannot determine an empty trick winner.");
  }

  const trumpPlays = trick.playedDominoes.filter((play) =>
    isDominoTrump(play.domino, trumpSuit)
  );

  if (trumpPlays.length > 0) {
    return trumpPlays.reduce((winner, play) =>
      getTrumpDominoRank(play.domino, trumpSuit) >
      getTrumpDominoRank(winner.domino, trumpSuit)
        ? play
        : winner
    ).seat;
  }

  const ledSuit = trick.ledSuit;

  if (!ledSuit) {
    throw new EngineError("INVALID_PHASE", "Trick is missing a led suit.");
  }

  const ledSuitPlays = trick.playedDominoes.filter((play) =>
    doesDominoFollowSuit(play.domino, ledSuit, trumpSuit)
  );

  if (ledSuitPlays.length === 0) {
    throw new EngineError("INVALID_PHASE", "Trick has no led-suit dominoes.");
  }

  return ledSuitPlays.reduce((winner, play) =>
    getNonTrumpSuitRank(play.domino, ledSuit, trumpSuit) >
    getNonTrumpSuitRank(winner.domino, ledSuit, trumpSuit)
      ? play
      : winner
  ).seat;
}

export function getExpectedTrickSeat(trick: Trick): SeatIndex {
  if (trick.playedDominoes.length >= TRICK_PLAY_COUNT) {
    throw new EngineError("INVALID_PHASE", "Trick is already complete.");
  }

  let seat = trick.leader;

  for (let index = 0; index < trick.playedDominoes.length; index += 1) {
    seat = getNextSeat(seat);
  }

  return seat;
}

export function isTrickComplete(trick: Trick): boolean {
  return trick.playedDominoes.length === TRICK_PLAY_COUNT;
}

export function getLegalLedSuits(
  domino: Domino,
  trumpSuit: TrumpSuit
): readonly DominoSuit[] {
  if (isDominoTrump(domino, trumpSuit)) {
    return [trumpSuit];
  }

  const highSuit = DOMINO_SUIT_BY_PIP[domino.high];

  if (isDouble(domino)) {
    return [highSuit];
  }

  return [highSuit, DOMINO_SUIT_BY_PIP[domino.low]];
}

export function canFollowSuit(
  hand: readonly Domino[],
  ledSuit: DominoSuit,
  trumpSuit: TrumpSuit
): boolean {
  return hand.some((domino) => doesDominoFollowSuit(domino, ledSuit, trumpSuit));
}

function assertLedSuitForDomino(
  domino: Domino,
  ledSuit: DominoSuit,
  trumpSuit: TrumpSuit
): void {
  const legalSuits = getLegalLedSuits(domino, trumpSuit);

  if (!legalSuits.includes(ledSuit)) {
    throw new EngineError("INVALID_TRUMP", "Led suit is not legal for led domino.");
  }
}

function assertFollowSuit(
  handBeforePlay: readonly Domino[],
  domino: Domino,
  ledSuit: DominoSuit,
  trumpSuit: TrumpSuit
): void {
  if (
    canFollowSuit(handBeforePlay, ledSuit, trumpSuit) &&
    !doesDominoFollowSuit(domino, ledSuit, trumpSuit)
  ) {
    throw new EngineError("MUST_FOLLOW_SUIT", "Player must follow the led suit.");
  }
}

function doesDominoFollowSuit(
  domino: Domino,
  ledSuit: DominoSuit,
  trumpSuit: TrumpSuit
): boolean {
  if (ledSuit === trumpSuit) {
    return isDominoTrump(domino, trumpSuit);
  }

  return !isDominoTrump(domino, trumpSuit) &&
    dominoContainsPip(domino, getTrumpSuitPip(ledSuit));
}

function getNonTrumpSuitRank(
  domino: Domino,
  suit: DominoSuit,
  trumpSuit: TrumpSuit
): number {
  if (!doesDominoFollowSuit(domino, suit, trumpSuit)) {
    throw new EngineError("INVALID_DOMINO", "Domino does not belong to led suit.");
  }

  const suitPip = getTrumpSuitPip(suit);

  if (isDouble(domino)) {
    return 7;
  }

  return domino.high === suitPip ? domino.low : domino.high;
}

function removeDominoFromHand(
  hands: FortyTwoHands,
  seat: SeatIndex,
  domino: Domino
): FortyTwoHands {
  const hand = hands[seat];
  const dominoKey = getDominoKey(domino);
  const dominoIndex = hand.findIndex(
    (heldDomino) => getDominoKey(heldDomino) === dominoKey
  );

  if (dominoIndex === -1) {
    throw new EngineError("INVALID_DOMINO", "Player cannot play a domino they do not hold.");
  }

  return {
    0: seat === 0 ? removeAt(hand, dominoIndex) : hands[0],
    1: seat === 1 ? removeAt(hand, dominoIndex) : hands[1],
    2: seat === 2 ? removeAt(hand, dominoIndex) : hands[2],
    3: seat === 3 ? removeAt(hand, dominoIndex) : hands[3]
  };
}

function removeAt<TValue>(
  values: readonly TValue[],
  index: number
): readonly TValue[] {
  return [...values.slice(0, index), ...values.slice(index + 1)];
}
