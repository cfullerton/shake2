import {
  getEngineRandom,
  type EngineContext
} from "../context.ts";
import { getDominoKey, type Domino, type DominoKey } from "../dominoes/domino.ts";
import {
  createDoubleSixSet,
  DOUBLE_SIX_DOMINO_COUNT
} from "../dominoes/set.ts";
import { EngineError } from "../errors.ts";
import {
  SEAT_INDICES,
  assertSeatIndex,
  type SeatIndex
} from "./seats.ts";

export const DOMINOES_PER_HAND = 7;
export const PLAYER_COUNT = 4;

export type FortyTwoHands = Readonly<Record<SeatIndex, readonly Domino[]>>;

export function shuffleDominoes(
  dominoes: readonly Domino[],
  context: Pick<EngineContext, "random">
): readonly Domino[] {
  const shuffled = [...dominoes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(getEngineRandom(context) * (index + 1));
    const current = shuffled[index];
    const target = shuffled[swapIndex];

    if (!current || !target) {
      throw new EngineError("INVALID_DOMINO", "Cannot shuffle an invalid domino set.");
    }

    shuffled[index] = target;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function dealDoubleSixDominoes(
  context: Pick<EngineContext, "random">
): FortyTwoHands {
  return dealDominoes(shuffleDominoes(createDoubleSixSet(), context));
}

export function dealDominoes(dominoes: readonly Domino[]): FortyTwoHands {
  if (dominoes.length !== DOUBLE_SIX_DOMINO_COUNT) {
    throw new EngineError(
      "INVALID_DOMINO",
      `A Texas 42 deal requires ${DOUBLE_SIX_DOMINO_COUNT} dominoes.`
    );
  }

  const hands: Record<SeatIndex, Domino[]> = {
    0: [],
    1: [],
    2: [],
    3: []
  };

  dominoes.forEach((domino, index) => {
    const seat = SEAT_INDICES[Math.floor(index / DOMINOES_PER_HAND)];

    if (seat === undefined) {
      throw new EngineError("INVALID_SEAT", "Cannot deal domino to unknown seat.");
    }

    hands[seat].push(domino);
  });

  for (const seat of SEAT_INDICES) {
    if (hands[seat].length !== DOMINOES_PER_HAND) {
      throw new EngineError(
        "INVALID_DOMINO",
        `Seat ${seat} must receive ${DOMINOES_PER_HAND} dominoes.`
      );
    }
  }

  return {
    0: hands[0],
    1: hands[1],
    2: hands[2],
    3: hands[3]
  };
}

export function getHandForSeat(
  hands: FortyTwoHands,
  seat: SeatIndex
): readonly Domino[] {
  assertSeatIndex(seat);
  return hands[seat];
}

export function getDealtDominoKeys(hands: FortyTwoHands): readonly DominoKey[] {
  return SEAT_INDICES.flatMap((seat) => hands[seat].map(getDominoKey));
}
