import { EngineError } from "../errors.ts";

export const SEAT_INDICES = [0, 1, 2, 3] as const;
export type SeatIndex = (typeof SEAT_INDICES)[number];

export const FORTY_TWO_TEAM_IDS = ["teamA", "teamB"] as const;
export type FortyTwoTeamId = (typeof FORTY_TWO_TEAM_IDS)[number];

export interface FortyTwoTeam {
  readonly id: FortyTwoTeamId;
  readonly name: string;
  readonly seats: readonly [SeatIndex, SeatIndex];
}

export const FORTY_TWO_TEAM_SEATS: Record<
  FortyTwoTeamId,
  readonly [SeatIndex, SeatIndex]
> = {
  teamA: [0, 2],
  teamB: [1, 3]
};

export const FORTY_TWO_TEAMS: Record<FortyTwoTeamId, FortyTwoTeam> = {
  teamA: {
    id: "teamA",
    name: "Team A",
    seats: FORTY_TWO_TEAM_SEATS.teamA
  },
  teamB: {
    id: "teamB",
    name: "Team B",
    seats: FORTY_TWO_TEAM_SEATS.teamB
  }
};

export function getNextSeat(seat: SeatIndex): SeatIndex {
  assertSeatIndex(seat);
  return toSeatIndex((seat + 1) % SEAT_INDICES.length);
}

export function getPreviousSeat(seat: SeatIndex): SeatIndex {
  assertSeatIndex(seat);
  return toSeatIndex((seat + SEAT_INDICES.length - 1) % SEAT_INDICES.length);
}

export function getNextDealerSeat(dealer: SeatIndex): SeatIndex {
  return getNextSeat(dealer);
}

export function getBidOrder(dealer: SeatIndex): readonly [
  SeatIndex,
  SeatIndex,
  SeatIndex,
  SeatIndex
] {
  const first = getNextSeat(dealer);
  const second = getNextSeat(first);
  const third = getNextSeat(second);
  const fourth = getNextSeat(third);
  return [first, second, third, fourth];
}

export function getTeamForSeat(seat: SeatIndex): FortyTwoTeamId {
  assertSeatIndex(seat);
  return seat % 2 === 0 ? "teamA" : "teamB";
}

export function getPartnerSeat(seat: SeatIndex): SeatIndex {
  assertSeatIndex(seat);
  return toSeatIndex((seat + 2) % SEAT_INDICES.length);
}

export function arePartnerSeats(left: SeatIndex, right: SeatIndex): boolean {
  return getPartnerSeat(left) === right;
}

export function isSeatIndex(value: unknown): value is SeatIndex {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;
}

export function assertSeatIndex(value: unknown): asserts value is SeatIndex {
  if (!isSeatIndex(value)) {
    throw new EngineError("INVALID_SEAT", `Invalid seat index: ${String(value)}`);
  }
}

function toSeatIndex(value: number): SeatIndex {
  assertSeatIndex(value);
  return value;
}
