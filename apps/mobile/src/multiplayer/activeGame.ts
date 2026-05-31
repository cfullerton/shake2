import { multiplayerTrumpSuits } from "./types";
import type {
  AppSyncSeatIndex,
  MultiplayerDomino,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomSeat,
  MultiplayerRoomView,
  MultiplayerTrumpSuit
} from "./types";

type SeatNumber = 0 | 1 | 2 | 3;
type TeamId = "teamA" | "teamB";

export interface MultiplayerActiveDominoPlay {
  readonly domino: MultiplayerDomino;
  readonly ledSuit?: MultiplayerTrumpSuit;
}

export interface MultiplayerActiveSeatSummary {
  readonly displayName: string;
  readonly handCount: number | null;
  readonly isCurrentTurn: boolean;
  readonly isDealer: boolean;
  readonly isViewer: boolean;
  readonly occupied: boolean;
  readonly seatIndex: AppSyncSeatIndex;
}

export interface MultiplayerActiveTeamSummary {
  readonly id: TeamId;
  readonly marks: number;
  readonly name: string;
}

export interface MultiplayerActiveTrickPlay {
  readonly domino: MultiplayerDomino;
  readonly seatIndex: AppSyncSeatIndex;
  readonly seatLabel: string;
}

export interface MultiplayerActiveGameView {
  readonly canCallTrump: boolean;
  readonly canPass: boolean;
  readonly canPlayDomino: boolean;
  readonly canStartNextHand: boolean;
  readonly canSubmitBid: boolean;
  readonly currentBidLabel: string;
  readonly currentTrickLeadLabel: string;
  readonly currentTrickPlays: readonly MultiplayerActiveTrickPlay[];
  readonly currentTrumpLabel: string;
  readonly currentTurnLabel: string;
  readonly dealerLabel: string;
  readonly handNumber: number;
  readonly legalDominoPlays: readonly MultiplayerActiveDominoPlay[];
  readonly legalBidAmounts: readonly number[];
  readonly legalTrumpSuits: readonly MultiplayerTrumpSuit[];
  readonly phase: string;
  readonly phaseTitle: string;
  readonly privateHand: readonly MultiplayerDomino[];
  readonly roomCode: string;
  readonly seatSummaries: readonly MultiplayerActiveSeatSummary[];
  readonly snapshotVersionLabel: string;
  readonly teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary];
  readonly viewerSeat: AppSyncSeatIndex | null;
  readonly viewerSeatLabel: string;
  readonly waitingMessage: string;
}

export const multiplayerSeatLabels: Record<AppSyncSeatIndex, string> = {
  SEAT_0: "North",
  SEAT_1: "East",
  SEAT_2: "South",
  SEAT_3: "West"
};

export const multiplayerTrumpSuitLabels: Record<MultiplayerTrumpSuit, string> = {
  blanks: "Blanks",
  fives: "Fives",
  fours: "Fours",
  ones: "Ones",
  sixes: "Sixes",
  threes: "Threes",
  twos: "Twos"
};

export function createMultiplayerActiveGameView(input: {
  readonly privateHand: MultiplayerPrivateHand | null;
  readonly room: MultiplayerRoomView;
  readonly snapshot: MultiplayerPublicGameSnapshot;
}): MultiplayerActiveGameView {
  const state = input.snapshot.redactedState;
  const viewerSeat = input.room.viewerSeat ?? null;
  const dealer = readSeatNumber(state.dealer);
  const currentTurnSeat = readCurrentTurnSeat(state, dealer);
  const handCounts = readHandCounts(input.snapshot, state);
  const bidding = readRecord(state.bidding);
  const trump = readRecord(state.trump);
  const currentBidAmount = readHighestBidAmount(bidding) ??
    readWinningBidAmount(trump?.winningBid);
  const currentTrick = readRecord(state.currentTrick);
  const currentTrickPlays = readCurrentTrickPlays(currentTrick, viewerSeat);
  const canCallTrump = viewerSeat !== null &&
    currentTurnSeat === toSeatNumber(viewerSeat) &&
    input.snapshot.phase === "trump";
  const legalBidAmounts = viewerSeat !== null &&
    currentTurnSeat === toSeatNumber(viewerSeat) &&
    isBiddingPhase(input.snapshot.phase)
      ? createLegalBidAmounts(state, currentBidAmount)
      : [];
  const legalDominoPlays = createLegalDominoPlays({
    currentTrick,
    currentTurnSeat,
    phase: input.snapshot.phase,
    privateHand: input.privateHand?.dominoes ?? [],
    state,
    viewerSeat
  });

  return {
    canCallTrump,
    canPass: viewerSeat !== null &&
      currentTurnSeat === toSeatNumber(viewerSeat) &&
      isBiddingPhase(input.snapshot.phase),
    canPlayDomino: legalDominoPlays.length > 0,
    canStartNextHand: input.room.isHost &&
      input.room.status === "inGame" &&
      input.snapshot.phase === "setup",
    canSubmitBid: legalBidAmounts.length > 0,
    currentBidLabel: currentBidAmount === null ? "No bid yet" : String(currentBidAmount),
    currentTrickLeadLabel: createCurrentTrickLeadLabel(
      currentTrick,
      currentTrickPlays,
      viewerSeat
    ),
    currentTrickPlays,
    currentTrumpLabel: readTrumpLabel(state),
    currentTurnLabel: currentTurnSeat === null
      ? "Waiting"
      : formatSeatLabel(toSeatIndex(currentTurnSeat), viewerSeat),
    dealerLabel: formatSeatLabel(toSeatIndex(dealer), viewerSeat),
    handNumber: readNumber(state.handNumber, 1),
    legalDominoPlays,
    legalBidAmounts,
    legalTrumpSuits: canCallTrump ? multiplayerTrumpSuits : [],
    phase: input.snapshot.phase,
    phaseTitle: formatPhaseTitle(input.snapshot.phase),
    privateHand: input.privateHand?.dominoes ?? [],
    roomCode: input.room.roomCode,
    seatSummaries: input.room.seats.map((seat) =>
      createSeatSummary(seat, viewerSeat, dealer, currentTurnSeat, handCounts)
    ),
    snapshotVersionLabel: `Snapshot ${input.snapshot.snapshotVersion} · Event ${input.snapshot.lastEventSequence}`,
    teams: [
      {
        id: "teamA",
        marks: readTeamMarks(state, "teamA"),
        name: readTeamName(state, "teamA", "North/South")
      },
      {
        id: "teamB",
        marks: readTeamMarks(state, "teamB"),
        name: readTeamName(state, "teamB", "East/West")
      }
    ],
    viewerSeat,
    viewerSeatLabel: viewerSeat ? multiplayerSeatLabels[viewerSeat] : "Spectator",
    waitingMessage: createWaitingMessage(input.snapshot.phase, currentTurnSeat, viewerSeat)
  };
}

function createLegalDominoPlays({
  currentTrick,
  currentTurnSeat,
  phase,
  privateHand,
  state,
  viewerSeat
}: {
  readonly currentTrick: Readonly<Record<string | number, unknown>> | undefined;
  readonly currentTurnSeat: SeatNumber | null;
  readonly phase: string;
  readonly privateHand: readonly MultiplayerDomino[];
  readonly state: Readonly<Record<string, unknown>>;
  readonly viewerSeat: AppSyncSeatIndex | null;
}): readonly MultiplayerActiveDominoPlay[] {
  if (
    phase !== "trickPlay" ||
    viewerSeat === null ||
    currentTurnSeat !== toSeatNumber(viewerSeat)
  ) {
    return [];
  }

  const trumpSuit = readContractTrumpSuit(state);

  if (!trumpSuit) {
    return [];
  }

  const playedDominoes = Array.isArray(currentTrick?.playedDominoes)
    ? currentTrick.playedDominoes
    : [];

  if (playedDominoes.length === 0) {
    return privateHand.map((domino) => ({
      domino,
      ledSuit: getLegalLedSuit(domino, trumpSuit)
    }));
  }

  const ledSuit = readTrumpSuit(currentTrick?.ledSuit);

  if (!ledSuit) {
    return [];
  }

  const canFollowLedSuit = privateHand.some((domino) =>
    doesDominoFollowSuit(domino, ledSuit, trumpSuit)
  );

  return privateHand
    .filter((domino) =>
      canFollowLedSuit
        ? doesDominoFollowSuit(domino, ledSuit, trumpSuit)
        : true
    )
    .map((domino) => ({
      domino
    }));
}

export function toSeatNumber(seat: AppSyncSeatIndex): SeatNumber {
  switch (seat) {
    case "SEAT_0":
      return 0;
    case "SEAT_1":
      return 1;
    case "SEAT_2":
      return 2;
    case "SEAT_3":
      return 3;
  }
}

export function toSeatIndex(seat: SeatNumber): AppSyncSeatIndex {
  switch (seat) {
    case 0:
      return "SEAT_0";
    case 1:
      return "SEAT_1";
    case 2:
      return "SEAT_2";
    case 3:
      return "SEAT_3";
  }
}

function createSeatSummary(
  seat: MultiplayerRoomSeat,
  viewerSeat: AppSyncSeatIndex | null,
  dealer: SeatNumber,
  currentTurnSeat: SeatNumber | null,
  handCounts: Readonly<Record<SeatNumber, number | null>>
): MultiplayerActiveSeatSummary {
  const seatNumber = toSeatNumber(seat.seatIndex);

  return {
    displayName: seat.displayName ?? multiplayerSeatLabels[seat.seatIndex],
    handCount: handCounts[seatNumber],
    isCurrentTurn: currentTurnSeat === seatNumber,
    isDealer: dealer === seatNumber,
    isViewer: viewerSeat === seat.seatIndex,
    occupied: seat.occupied,
    seatIndex: seat.seatIndex
  };
}

function readCurrentTurnSeat(
  state: Readonly<Record<string, unknown>>,
  dealer: SeatNumber
): SeatNumber | null {
  const phase = readString(state.phase, "unknown");

  if (phase === "dealt") {
    return getNextSeat(dealer);
  }

  if (phase === "bidding") {
    const bidding = readRecord(state.bidding);

    return readNullableSeatNumber(bidding?.currentSeat);
  }

  if (phase === "trump") {
    const trump = readRecord(state.trump);

    return readNullableSeatNumber(trump?.declarer);
  }

  if (phase === "trickPlay") {
    const currentTrick = readRecord(state.currentTrick);
    const leader = readSeatNumber(currentTrick?.leader);
    const playedDominoes = Array.isArray(currentTrick?.playedDominoes)
      ? currentTrick.playedDominoes
      : [];

    return advanceSeat(leader, playedDominoes.length);
  }

  return null;
}

function createLegalBidAmounts(
  state: Readonly<Record<string, unknown>>,
  currentBidAmount: number | null
): readonly number[] {
  const rules = readRecord(state.rules);
  const bidding = readRecord(rules?.bidding);
  const minimumBid = readNumber(bidding?.minimumBid, 30);
  const maximumBid = readNumber(bidding?.maximumNumericBid, 42);
  const start = Math.max(minimumBid, (currentBidAmount ?? minimumBid - 1) + 1);

  if (start > maximumBid) {
    return [];
  }

  return Array.from(
    {
      length: maximumBid - start + 1
    },
    (_value, index) => start + index
  );
}

function readHandCounts(
  snapshot: MultiplayerPublicGameSnapshot,
  state: Readonly<Record<string, unknown>>
): Readonly<Record<SeatNumber, number | null>> {
  const handCounts = snapshot.handCounts;

  if (handCounts) {
    return {
      0: handCounts.seat0,
      1: handCounts.seat1,
      2: handCounts.seat2,
      3: handCounts.seat3
    };
  }

  const stateHandCounts = readRecord(state.handCounts);

  return {
    0: readNullableNumber(stateHandCounts?.[0]),
    1: readNullableNumber(stateHandCounts?.[1]),
    2: readNullableNumber(stateHandCounts?.[2]),
    3: readNullableNumber(stateHandCounts?.[3])
  };
}

function readHighestBidAmount(
  bidding: Readonly<Record<string, unknown>> | undefined
): number | null {
  return readWinningBidAmount(bidding?.highestBid);
}

function readWinningBidAmount(value: unknown): number | null {
  const highestBid = readRecord(value);
  const bid = readRecord(highestBid?.bid);
  const amount = bid?.amount;

  return typeof amount === "number" && Number.isFinite(amount) ? amount : null;
}

function readTrumpLabel(state: Readonly<Record<string, unknown>>): string {
  const suit = readContractTrumpSuit(state);

  return suit ? multiplayerTrumpSuitLabels[suit] : "Not called";
}

function readContractTrumpSuit(
  state: Readonly<Record<string, unknown>>
): MultiplayerTrumpSuit | null {
  const contract = readRecord(state.contract) ??
    readRecord(readRecord(state.trump)?.contract);
  const selection = readRecord(contract?.trump);

  return readTrumpSuit(selection?.suit) ??
    readTrumpSuit(contract?.trumpSuit);
}

function readCurrentTrickPlays(
  currentTrick: Readonly<Record<string | number, unknown>> | undefined,
  viewerSeat: AppSyncSeatIndex | null
): readonly MultiplayerActiveTrickPlay[] {
  const playedDominoes = Array.isArray(currentTrick?.playedDominoes)
    ? currentTrick.playedDominoes
    : [];

  return playedDominoes.flatMap((value) => {
    const play = readRecord(value);
    const seat = readNullableSeatNumber(play?.seat);
    const domino = readDomino(play?.domino);

    if (seat === null || !domino) {
      return [];
    }

    const seatIndex = toSeatIndex(seat);

    return [
      {
        domino,
        seatIndex,
        seatLabel: formatSeatLabel(seatIndex, viewerSeat)
      }
    ];
  });
}

function createCurrentTrickLeadLabel(
  currentTrick: Readonly<Record<string | number, unknown>> | undefined,
  plays: readonly MultiplayerActiveTrickPlay[],
  viewerSeat: AppSyncSeatIndex | null
): string {
  if (plays.length === 0) {
    const leader = readNullableSeatNumber(currentTrick?.leader);

    return leader === null
      ? "No domino led"
      : `${formatSeatLabel(toSeatIndex(leader), viewerSeat)} leads`;
  }

  const ledSuit = readTrumpSuit(currentTrick?.ledSuit);

  return ledSuit
    ? `${multiplayerTrumpSuitLabels[ledSuit]} led`
    : "Suit not set";
}

function readTeamMarks(
  state: Readonly<Record<string, unknown>>,
  teamId: TeamId
): number {
  const marks = readRecord(state.marks);

  return readNumber(marks?.[teamId], 0);
}

function readTeamName(
  state: Readonly<Record<string, unknown>>,
  teamId: TeamId,
  fallback: string
): string {
  const teams = readRecord(state.teams);
  const team = readRecord(teams?.[teamId]);

  return readString(team?.name, fallback);
}

function createWaitingMessage(
  phase: string,
  currentTurnSeat: SeatNumber | null,
  viewerSeat: AppSyncSeatIndex | null
): string {
  if (phase === "setup") {
    return "Waiting for host to deal the next hand.";
  }

  if (currentTurnSeat === null) {
    return "Waiting for the next server update.";
  }

  const currentTurn = toSeatIndex(currentTurnSeat);

  if (viewerSeat === currentTurn) {
    if (phase === "dealt" || phase === "bidding") {
      return "Your bid.";
    }

    if (phase === "trump") {
      return "Call trump.";
    }

    return "Your turn.";
  }

  return `Waiting for ${multiplayerSeatLabels[currentTurn]}.`;
}

function formatSeatLabel(
  seat: AppSyncSeatIndex,
  viewerSeat: AppSyncSeatIndex | null
): string {
  return viewerSeat === seat
    ? `${multiplayerSeatLabels[seat]} (You)`
    : multiplayerSeatLabels[seat];
}

function formatPhaseTitle(phase: string): string {
  switch (phase) {
    case "dealt":
    case "bidding":
      return "Bidding";
    case "trump":
      return "Call Trump";
    case "trickPlay":
      return "Trick Play";
    case "handComplete":
      return "Hand Complete";
    case "gameComplete":
      return "Game Complete";
    default:
      return phase.length > 0
        ? `${phase[0]?.toUpperCase() ?? ""}${phase.slice(1)}`
        : "Unknown";
  }
}

function isBiddingPhase(phase: string): boolean {
  return phase === "dealt" || phase === "bidding";
}

function getNextSeat(seat: SeatNumber): SeatNumber {
  return advanceSeat(seat, 1);
}

function advanceSeat(seat: SeatNumber, offset: number): SeatNumber {
  return ((seat + offset) % 4) as SeatNumber;
}

function readSeatNumber(value: unknown): SeatNumber {
  const seat = readNullableSeatNumber(value);

  return seat ?? 0;
}

function readNullableSeatNumber(value: unknown): SeatNumber | null {
  return value === 0 || value === 1 || value === 2 || value === 3
    ? value
    : null;
}

function readTrumpSuit(value: unknown): MultiplayerTrumpSuit | null {
  return multiplayerTrumpSuits.includes(value as MultiplayerTrumpSuit)
    ? value as MultiplayerTrumpSuit
    : null;
}

function readDomino(value: unknown): MultiplayerDomino | null {
  const domino = readRecord(value);
  const high = domino?.high;
  const low = domino?.low;

  if (!isPip(high) || !isPip(low)) {
    return null;
  }

  const normalizedHigh = Math.max(high, low);
  const normalizedLow = Math.min(high, low);

  return {
    high: normalizedHigh,
    key: `${normalizedHigh}-${normalizedLow}`,
    low: normalizedLow
  };
}

function getLegalLedSuit(
  domino: MultiplayerDomino,
  trumpSuit: MultiplayerTrumpSuit
): MultiplayerTrumpSuit {
  if (isDominoTrump(domino, trumpSuit)) {
    return trumpSuit;
  }

  return dominoSuitByPip[domino.high] ?? "blanks";
}

function doesDominoFollowSuit(
  domino: MultiplayerDomino,
  ledSuit: MultiplayerTrumpSuit,
  trumpSuit: MultiplayerTrumpSuit
): boolean {
  if (ledSuit === trumpSuit) {
    return isDominoTrump(domino, trumpSuit);
  }

  return !isDominoTrump(domino, trumpSuit) &&
    dominoContainsPip(domino, trumpSuitPipBySuit[ledSuit]);
}

function isDominoTrump(
  domino: MultiplayerDomino,
  trumpSuit: MultiplayerTrumpSuit
): boolean {
  return dominoContainsPip(domino, trumpSuitPipBySuit[trumpSuit]);
}

function dominoContainsPip(domino: MultiplayerDomino, pip: number): boolean {
  return domino.high === pip || domino.low === pip;
}

function isPip(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6;
}

function readRecord(value: unknown): Readonly<Record<string | number, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string | number, unknown>>
    : undefined;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const dominoSuitByPip: Readonly<Record<number, MultiplayerTrumpSuit>> = {
  0: "blanks",
  1: "ones",
  2: "twos",
  3: "threes",
  4: "fours",
  5: "fives",
  6: "sixes"
};

const trumpSuitPipBySuit: Readonly<Record<MultiplayerTrumpSuit, number>> = {
  blanks: 0,
  fives: 5,
  fours: 4,
  ones: 1,
  sixes: 6,
  threes: 3,
  twos: 2
};
