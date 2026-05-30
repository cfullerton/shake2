import { createDomino, getDominoKey, type Domino, type DominoKey } from "./domino.ts";

export const TOTAL_COUNT_DOMINO_POINTS = 35;

const COUNT_DOMINO_POINT_ENTRIES = [
  [getDominoKey(createDomino(0, 5)), 5],
  [getDominoKey(createDomino(1, 4)), 5],
  [getDominoKey(createDomino(2, 3)), 5],
  [getDominoKey(createDomino(5, 5)), 10],
  [getDominoKey(createDomino(4, 6)), 10]
] as const satisfies readonly (readonly [DominoKey, number])[];

const COUNT_DOMINO_POINTS = new Map<DominoKey, number>(COUNT_DOMINO_POINT_ENTRIES);

export const COUNT_DOMINO_KEYS = COUNT_DOMINO_POINT_ENTRIES.map(
  ([key]) => key
) as readonly DominoKey[];

export function isCountDomino(domino: Domino): boolean {
  return COUNT_DOMINO_POINTS.has(getDominoKey(domino));
}

export function getDominoCountPoints(domino: Domino): number {
  return COUNT_DOMINO_POINTS.get(getDominoKey(domino)) ?? 0;
}

export function getTotalCountPoints(dominoes: readonly Domino[]): number {
  return dominoes.reduce((total, domino) => total + getDominoCountPoints(domino), 0);
}
