import { createDomino, PIPS, type Domino } from "./domino.ts";

export const DOUBLE_SIX_DOMINO_COUNT = 28;

export function createDoubleSixSet(): readonly Domino[] {
  const dominoes: Domino[] = [];

  for (const high of PIPS) {
    for (const low of PIPS) {
      if (low > high) {
        continue;
      }

      dominoes.push(createDomino(high, low));
    }
  }

  return dominoes;
}
