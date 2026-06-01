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
  type Contract,
  type TrumpSuit
} from "./trump.ts";
import { standardRules } from "./rules-config.ts";

export type DominoSuit = TrumpSuit;
export const TRICK_PLAY_COUNT = standardRules.table.playerCount;

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
  readonly contract?: Contract;
  readonly domino: Domino;
  readonly hands: FortyTwoHands;
  readonly ledSuit?: DominoSuit;
  readonly seat: SeatIndex;
  readonly trick: Trick;
  readonly trumpSuit?: TrumpSuit;
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
  const trickMode = getTrickMode(input);
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

    assertLedSuitForDomino(input.domino, ledSuit, trickMode);

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

  assertFollowSuit(input.hands[input.seat], input.domino, ledSuit, trickMode);

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
  return determineTrickWinnerWithMode(trick, {
    kind: "pip",
    trumpSuit
  });
}

function determineTrickWinnerWithMode(
  trick: Trick,
  trickMode: TrickMode
): SeatIndex {
  if (trick.playedDominoes.length === 0) {
    throw new EngineError("INVALID_PHASE", "Cannot determine an empty trick winner.");
  }

  if (trickMode.kind === "pip") {
    const trumpPlays = trick.playedDominoes.filter((play) =>
      isDominoTrump(play.domino, trickMode.trumpSuit)
    );

    if (trumpPlays.length > 0) {
      return trumpPlays.reduce((winner, play) =>
        getTrumpDominoRank(play.domino, trickMode.trumpSuit) >
        getTrumpDominoRank(winner.domino, trickMode.trumpSuit)
          ? play
          : winner
      ).seat;
    }
  }

  const ledSuit = trick.ledSuit;

  if (!ledSuit) {
    throw new EngineError("INVALID_PHASE", "Trick is missing a led suit.");
  }

  const ledSuitPlays = trick.playedDominoes.filter((play) =>
    doesDominoFollowSuit(play.domino, ledSuit, trickMode)
  );

  if (ledSuitPlays.length === 0) {
    throw new EngineError("INVALID_PHASE", "Trick has no led-suit dominoes.");
  }

  return ledSuitPlays.reduce((winner, play) =>
    getNonTrumpSuitRank(play.domino, ledSuit, trickMode) >
    getNonTrumpSuitRank(winner.domino, ledSuit, trickMode)
      ? play
      : winner
  ).seat;
}

export function determineTrickWinnerForContract(
  trick: Trick,
  contract: Contract
): SeatIndex {
  return determineTrickWinnerWithMode(trick, getTrickModeForContract(contract));
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
  return getLegalLedSuitsWithMode(domino, {
    kind: "pip",
    trumpSuit
  });
}

export function getLegalLedSuitsForContract(
  domino: Domino,
  contract: Contract
): readonly DominoSuit[] {
  return getLegalLedSuitsWithMode(domino, getTrickModeForContract(contract));
}

export function canFollowSuit(
  hand: readonly Domino[],
  ledSuit: DominoSuit,
  trumpSuit: TrumpSuit
): boolean {
  return hand.some((domino) =>
    doesDominoFollowSuit(domino, ledSuit, {
      kind: "pip",
      trumpSuit
    })
  );
}

type TrickMode =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "pip";
      readonly trumpSuit: TrumpSuit;
    };

function getTrickMode(input: PlayDominoInput): TrickMode {
  if (input.contract) {
    return getTrickModeForContract(input.contract);
  }

  if (input.trumpSuit !== undefined) {
    return {
      kind: "pip",
      trumpSuit: input.trumpSuit
    };
  }

  throw new EngineError(
    "INVALID_TRUMP",
    "Trick play requires a contract or trump suit."
  );
}

function getTrickModeForContract(contract: Contract): TrickMode {
  switch (contract.kind) {
    case "noTrump":
      return {
        kind: "none"
      };
    case "standardNumeric":
      return {
        kind: "pip",
        trumpSuit: contract.trump.suit
      };
  }
}

function getLegalLedSuitsWithMode(
  domino: Domino,
  trickMode: TrickMode
): readonly DominoSuit[] {
  if (trickMode.kind === "pip" && isDominoTrump(domino, trickMode.trumpSuit)) {
    return [trickMode.trumpSuit];
  }

  const highSuit = DOMINO_SUIT_BY_PIP[domino.high];

  return [highSuit];
}

function assertLedSuitForDomino(
  domino: Domino,
  ledSuit: DominoSuit,
  trickMode: TrickMode
): void {
  const legalSuits = getLegalLedSuitsWithMode(domino, trickMode);

  if (!legalSuits.includes(ledSuit)) {
    throw new EngineError("INVALID_TRUMP", "Led suit is not legal for led domino.");
  }
}

function assertFollowSuit(
  handBeforePlay: readonly Domino[],
  domino: Domino,
  ledSuit: DominoSuit,
  trickMode: TrickMode
): void {
  if (
    handBeforePlay.some((heldDomino) =>
      doesDominoFollowSuit(heldDomino, ledSuit, trickMode)
    ) &&
    !doesDominoFollowSuit(domino, ledSuit, trickMode)
  ) {
    throw new EngineError("MUST_FOLLOW_SUIT", "Player must follow the led suit.");
  }
}

function doesDominoFollowSuit(
  domino: Domino,
  ledSuit: DominoSuit,
  trickMode: TrickMode
): boolean {
  if (trickMode.kind === "pip") {
    if (ledSuit === trickMode.trumpSuit) {
      return isDominoTrump(domino, trickMode.trumpSuit);
    }

    return !isDominoTrump(domino, trickMode.trumpSuit) &&
      dominoContainsPip(domino, getTrumpSuitPip(ledSuit));
  }

  return dominoContainsPip(domino, getTrumpSuitPip(ledSuit));
}

function getNonTrumpSuitRank(
  domino: Domino,
  suit: DominoSuit,
  trickMode: TrickMode
): number {
  if (!doesDominoFollowSuit(domino, suit, trickMode)) {
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
