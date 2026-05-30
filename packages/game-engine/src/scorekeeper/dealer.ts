import { PLAYER_SEATS, type PlayerSeat } from "./types.ts";
import { assertPlayerSeat } from "./validation.ts";

export function getNextDealer(dealer: PlayerSeat): PlayerSeat {
  assertPlayerSeat(dealer);
  const currentIndex = PLAYER_SEATS.indexOf(dealer);
  return PLAYER_SEATS[(currentIndex + 1) % PLAYER_SEATS.length] ?? "north";
}

export function getPreviousDealer(dealer: PlayerSeat): PlayerSeat {
  assertPlayerSeat(dealer);
  const currentIndex = PLAYER_SEATS.indexOf(dealer);
  return (
    PLAYER_SEATS[(currentIndex - 1 + PLAYER_SEATS.length) % PLAYER_SEATS.length] ??
    "north"
  );
}
