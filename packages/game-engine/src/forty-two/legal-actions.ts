import {
  createMarkBid,
  createNumericBid,
  createPassBid,
  formatBidLabel,
  getLegalMarkBidValues,
  MAX_NUMERIC_BID,
  MIN_NUMERIC_BID,
  type BidCall
} from "./bidding.ts";
import { type Domino } from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import { type FortyTwoSnapshotEnvelope } from "./state.ts";
import {
  assertSeatIndex,
  type SeatIndex
} from "./seats.ts";
import {
  getExpectedTrickSeat,
  getLegalLedSuitsForContract,
  playDominoToTrick,
  type DominoSuit
} from "./tricks.ts";
import {
  TRUMP_SUITS,
  type TrumpSelection,
  type TrumpSuit
} from "./trump.ts";

export interface LegalBidOption {
  readonly bid: BidCall;
  readonly label: string;
}

export interface LegalDominoPlay {
  readonly domino: Domino;
  readonly ledSuit?: DominoSuit;
  readonly seat: SeatIndex;
}

export interface LegalTrumpCall {
  readonly label: string;
  readonly selection: TrumpSelection;
}

export function getLegalBidOptions(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex
): readonly LegalBidOption[] {
  assertSeatIndex(seat);

  if (snapshot.snapshot.phase !== "dealt" && snapshot.snapshot.phase !== "bidding") {
    return [];
  }

  const bidding = snapshot.snapshot.phase === "bidding"
    ? snapshot.snapshot.bidding
    : null;
  const currentSeat = bidding?.currentSeat ?? getNextBidSeatFromDealt(snapshot);

  if (currentSeat !== seat) {
    return [];
  }

  const highestBid = bidding?.highestBid ?? null;
  const highestNumericBid = highestBid?.bid.kind === "numeric"
    ? highestBid.bid.amount
    : null;
  const minimumNumericBid = Math.max(
    MIN_NUMERIC_BID,
    highestNumericBid === null ? MIN_NUMERIC_BID : highestNumericBid + 1
  );
  const options: LegalBidOption[] = [
    {
      bid: createPassBid(),
      label: "Pass"
    }
  ];

  if (highestBid?.bid.kind !== "marks") {
    for (let amount = minimumNumericBid; amount <= MAX_NUMERIC_BID; amount += 1) {
      options.push({
        bid: createNumericBid(amount),
        label: String(amount)
      });
    }
  }

  for (const marks of getLegalMarkBidValues(highestBid, snapshot.snapshot.rules)) {
    const bid = createMarkBid(marks);

    options.push({
      bid,
      label: formatBidLabel(bid)
    });
  }

  return options;
}

export function getLegalTrumpSuits(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex
): readonly TrumpSuit[] {
  return getLegalTrumpCalls(snapshot, seat)
    .flatMap((call) => call.selection.kind === "pip" ? [call.selection.suit] : []);
}

export function getLegalTrumpCalls(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex
): readonly LegalTrumpCall[] {
  assertSeatIndex(seat);

  if (snapshot.snapshot.phase !== "trump") {
    return [];
  }

  if (snapshot.snapshot.trump.declarer !== seat) {
    return [];
  }

  const calls: LegalTrumpCall[] = TRUMP_SUITS.map((trumpSuit) => ({
    label: formatTrumpSuitLabel(trumpSuit),
    selection: {
      kind: "pip" as const,
      suit: trumpSuit
    }
  }));

  if (snapshot.snapshot.rules.enabledContracts.noTrump) {
    calls.push({
      label: "No Trump",
      selection: {
        kind: "none"
      }
    });
  }

  return calls;
}

export function getLegalDominoPlays(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex
): readonly LegalDominoPlay[] {
  assertSeatIndex(seat);

  if (snapshot.snapshot.phase !== "trickPlay") {
    return [];
  }

  if (getExpectedTrickSeat(snapshot.snapshot.currentTrick) !== seat) {
    return [];
  }

  const options: LegalDominoPlay[] = [];

  for (const domino of snapshot.snapshot.hands[seat]) {
    if (snapshot.snapshot.currentTrick.playedDominoes.length === 0) {
      for (const ledSuit of getLegalLedSuitsForContract(
        domino,
        snapshot.snapshot.contract
      )) {
        if (isLegalDominoPlay(snapshot, seat, domino, ledSuit)) {
          options.push({
            domino,
            ledSuit,
            seat
          });
        }
      }
    } else if (isLegalDominoPlay(snapshot, seat, domino)) {
      options.push({
        domino,
        seat
      });
    }
  }

  return options;
}

function getNextBidSeatFromDealt(snapshot: FortyTwoSnapshotEnvelope): SeatIndex | null {
  if (snapshot.snapshot.phase !== "dealt") {
    return null;
  }

  return ((snapshot.snapshot.dealer + 1) % 4) as SeatIndex;
}

function isLegalDominoPlay(
  snapshot: FortyTwoSnapshotEnvelope,
  seat: SeatIndex,
  domino: Domino,
  ledSuit?: DominoSuit
): boolean {
  if (snapshot.snapshot.phase !== "trickPlay") {
    return false;
  }

  try {
    playDominoToTrick({
      contract: snapshot.snapshot.contract,
      domino,
      hands: snapshot.snapshot.hands,
      ...(ledSuit ? { ledSuit } : {}),
      seat,
      trick: snapshot.snapshot.currentTrick
    });
    return true;
  } catch (error) {
    if (error instanceof EngineError) {
      return false;
    }

    throw error;
  }
}

function formatTrumpSuitLabel(trumpSuit: TrumpSuit): string {
  return trumpSuit[0]?.toUpperCase() + trumpSuit.slice(1);
}
