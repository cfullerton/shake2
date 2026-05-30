import { EngineError } from "../errors.ts";

export const PIPS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Pip = (typeof PIPS)[number];
export const MIN_PIP: Pip = 0;
export const MAX_PIP: Pip = 6;

export interface Domino {
  readonly high: Pip;
  readonly low: Pip;
}

export type DominoKey = `${Pip}-${Pip}`;

export function createDomino(first: number, second: number): Domino {
  assertPip(first);
  assertPip(second);

  return first >= second
    ? {
        high: first,
        low: second
      }
    : {
        high: second,
        low: first
      };
}

export function normalizeDomino(domino: Domino): Domino {
  return createDomino(domino.high, domino.low);
}

export function getDominoKey(domino: Domino): DominoKey {
  const normalized = normalizeDomino(domino);
  return `${normalized.high}-${normalized.low}` as DominoKey;
}

export function formatDomino(domino: Domino): string {
  return getDominoKey(domino);
}

export function dominoEquals(left: Domino, right: Domino): boolean {
  return getDominoKey(left) === getDominoKey(right);
}

export function isDouble(domino: Domino): boolean {
  return domino.high === domino.low;
}

export function dominoContainsPip(domino: Domino, pip: Pip): boolean {
  return domino.high === pip || domino.low === pip;
}

export function isPip(value: unknown): value is Pip {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PIP &&
    value <= MAX_PIP
  );
}

export function assertPip(value: unknown): asserts value is Pip {
  if (!isPip(value)) {
    throw new EngineError("INVALID_DOMINO", `Invalid domino pip: ${String(value)}`);
  }
}
