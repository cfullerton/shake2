import {
  TRICK_PLAY_COUNT,
  getTeamForSeat,
  scoreCompletedTricks,
  type CompletedTrick,
  type Domino,
  type PlayedDomino,
  type Trick
} from "@shake2/game-engine";

import { multiplayerTrumpSuits } from "./types";
import type { MultiplayerBid } from "./game";
import type {
  AppSyncSeatIndex,
  MultiplayerCompletedHandSummary,
  MultiplayerDomino,
  MultiplayerPrivateHand,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomSeat,
  MultiplayerRoomView,
  MultiplayerTrumpSelection,
  MultiplayerTrumpSuit
} from "./types";

type SeatNumber = 0 | 1 | 2 | 3;
type TeamId = "teamA" | "teamB";

interface MultiplayerActiveCompletedTrick {
  readonly trick: {
    readonly ledDomino: MultiplayerDomino;
    readonly ledSuit: MultiplayerTrumpSuit;
    readonly leader: AppSyncSeatIndex;
    readonly playedDominoes: readonly MultiplayerActiveTrickPlay[];
  };
  readonly winner: AppSyncSeatIndex;
}

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

export interface MultiplayerActiveBidOption {
  readonly bid: MultiplayerBid;
  readonly label: string;
}

export interface MultiplayerActiveTrumpCall {
  readonly label: string;
  readonly selection: MultiplayerTrumpSelection;
}

export interface MultiplayerActiveTrickPlay {
  readonly domino: MultiplayerDomino;
  readonly seatIndex: AppSyncSeatIndex;
  readonly seatLabel: string;
}

export interface MultiplayerActiveCompletedHandSummary {
  readonly biddingTeamLabel: string;
  readonly biddingTeamPointsLabel: string;
  readonly declarerLabel: string;
  readonly handNumber: number;
  readonly marksAwardLabel: string;
  readonly outcomeLabel: string;
  readonly teamPointsLabel: string;
  readonly tricksLabel: string;
}

export interface MultiplayerActiveWonDominoTrick {
  readonly dominoes: readonly MultiplayerDomino[];
  readonly id: string;
}

export interface MultiplayerActiveWonDominoTeam {
  readonly id: TeamId;
  readonly name: string;
  readonly trickCount: number;
  readonly tricks: readonly MultiplayerActiveWonDominoTrick[];
}

export interface MultiplayerActiveGameView {
  readonly canCallTrump: boolean;
  readonly canPass: boolean;
  readonly canPlayDomino: boolean;
  readonly canStartNextHand: boolean;
  readonly canSubmitBid: boolean;
  readonly currentBidLabel: string;
  readonly currentScoreLabel: string;
  readonly currentTrickLeadLabel: string;
  readonly currentTrickPlays: readonly MultiplayerActiveTrickPlay[];
  readonly currentTrumpLabel: string;
  readonly currentTurnLabel: string;
  readonly dealerLabel: string;
  readonly gameOverMessage: string | null;
  readonly handNumber: number;
  readonly lastCompletedHand: MultiplayerActiveCompletedHandSummary | null;
  readonly legalBidOptions: readonly MultiplayerActiveBidOption[];
  readonly legalDominoPlays: readonly MultiplayerActiveDominoPlay[];
  readonly legalBidAmounts: readonly number[];
  readonly legalTrumpCalls: readonly MultiplayerActiveTrumpCall[];
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
  readonly wonDominoes: readonly [
    MultiplayerActiveWonDominoTeam,
    MultiplayerActiveWonDominoTeam
  ];
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
  const currentBid = readHighestBid(bidding) ??
    readWinningBid(trump?.winningBid);
  const currentBidLabel = currentBid ? formatMultiplayerBid(currentBid) : "No bid yet";
  const currentTrick = readRecord(state.currentTrick);
  const currentTrickPlays = readCurrentTrickPlays(currentTrick, viewerSeat);
  const completedTricks = readCompletedTricks(state);
  const teams: [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary] = [
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
  ];
  const canCallTrump = viewerSeat !== null &&
    currentTurnSeat === toSeatNumber(viewerSeat) &&
    input.snapshot.phase === "trump";
  const legalBidOptions = viewerSeat !== null &&
    currentTurnSeat === toSeatNumber(viewerSeat) &&
    isBiddingPhase(input.snapshot.phase)
      ? createLegalBidOptions(state, currentBid)
      : [];
  const legalBidAmounts = legalBidOptions.flatMap((option) =>
    option.bid.kind === "numeric" ? [option.bid.amount] : []
  );
  const legalDominoPlays = createLegalDominoPlays({
    currentTrick,
    currentTurnSeat,
    phase: input.snapshot.phase,
    privateHand: input.privateHand?.dominoes ?? [],
    state,
    viewerSeat
  });
  const legalTrumpCalls = canCallTrump ? createLegalTrumpCalls(state) : [];

  return {
    canCallTrump,
    canPass: viewerSeat !== null &&
      currentTurnSeat === toSeatNumber(viewerSeat) &&
      isBiddingPhase(input.snapshot.phase),
    canPlayDomino: legalDominoPlays.length > 0,
    canStartNextHand: input.room.isHost &&
      input.room.status === "inGame" &&
      input.snapshot.phase === "setup",
    canSubmitBid: legalBidOptions.some((option) => option.bid.kind !== "pass"),
    currentBidLabel,
    currentScoreLabel: createCurrentScoreLabel(completedTricks, teams),
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
    gameOverMessage: createGameOverMessage(input.snapshot.phase, state, teams),
    handNumber: readNumber(state.handNumber, 1),
    lastCompletedHand: createCompletedHandSummary(
      input.snapshot.lastCompletedHand ?? null,
      viewerSeat,
      teams
    ),
    legalBidOptions,
    legalDominoPlays,
    legalBidAmounts,
    legalTrumpCalls,
    legalTrumpSuits: legalTrumpCalls.flatMap((call) =>
      call.selection.kind === "pip" ? [call.selection.suit] : []
    ),
    phase: input.snapshot.phase,
    phaseTitle: formatPhaseTitle(input.snapshot.phase),
    privateHand: input.privateHand?.dominoes ?? [],
    roomCode: input.room.roomCode,
    seatSummaries: input.room.seats.map((seat) =>
      createSeatSummary(seat, viewerSeat, dealer, currentTurnSeat, handCounts)
    ),
    snapshotVersionLabel: `Snapshot ${input.snapshot.snapshotVersion} · Event ${input.snapshot.lastEventSequence}`,
    teams,
    viewerSeat,
    viewerSeatLabel: viewerSeat ? multiplayerSeatLabels[viewerSeat] : "Spectator",
    waitingMessage: createWaitingMessage(input.snapshot.phase, currentTurnSeat, viewerSeat),
    wonDominoes: createWonDominoTeams(
      completedTricks,
      readNumber(state.handNumber, 1),
      teams
    )
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

  const trickMode = readContractTrickMode(state);

  if (!trickMode) {
    return [];
  }

  const playedDominoes = Array.isArray(currentTrick?.playedDominoes)
    ? currentTrick.playedDominoes
    : [];

  if (playedDominoes.length === 0) {
    return privateHand.map((domino) => ({
      domino,
      ledSuit: getLegalLedSuit(domino, trickMode)
    }));
  }

  const ledSuit = readTrumpSuit(currentTrick?.ledSuit);

  if (!ledSuit) {
    return [];
  }

  const canFollowLedSuit = privateHand.some((domino) =>
    doesDominoFollowSuit(domino, ledSuit, trickMode)
  );

  return privateHand
    .filter((domino) =>
      canFollowLedSuit
        ? doesDominoFollowSuit(domino, ledSuit, trickMode)
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

function createLegalBidOptions(
  state: Readonly<Record<string, unknown>>,
  currentBid: MultiplayerBid | null
): readonly MultiplayerActiveBidOption[] {
  const rules = readRecord(state.rules);
  const bidding = readRecord(rules?.bidding);
  const minimumBid = readNumber(bidding?.minimumBid, 30);
  const maximumBid = readNumber(bidding?.maximumNumericBid, 42);
  const options: MultiplayerActiveBidOption[] = [
    {
      bid: {
        kind: "pass"
      },
      label: "Pass"
    }
  ];

  if (currentBid?.kind !== "marks") {
    const currentNumericAmount = currentBid?.kind === "numeric"
      ? currentBid.amount
      : null;
    const start = Math.max(
      minimumBid,
      (currentNumericAmount ?? minimumBid - 1) + 1
    );

    for (let amount = start; amount <= maximumBid; amount += 1) {
      options.push({
        bid: {
          amount,
          kind: "numeric"
        },
        label: String(amount)
      });
    }
  }

  for (const marks of createLegalMarkBidValues(state, currentBid)) {
    options.push({
      bid: {
        kind: "marks",
        marks
      },
      label: formatMarkBidLabel(marks)
    });
  }

  return options;
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

function readHighestBid(
  bidding: Readonly<Record<string, unknown>> | undefined
): MultiplayerBid | null {
  return readWinningBid(bidding?.highestBid);
}

function readWinningBid(value: unknown): MultiplayerBid | null {
  const highestBid = readRecord(value);
  const bid = readRecord(highestBid?.bid);

  return readBid(bid);
}

function readBid(
  bid: Readonly<Record<string | number, unknown>> | undefined
): MultiplayerBid | null {
  if (bid?.kind === "numeric") {
    const amount = bid.amount;

    return typeof amount === "number" && Number.isFinite(amount)
      ? {
          amount,
          kind: "numeric"
        }
      : null;
  }

  if (bid?.kind === "marks") {
    const marks = bid.marks;

    return typeof marks === "number" && Number.isFinite(marks)
      ? {
          kind: "marks",
          marks
        }
      : null;
  }

  return null;
}

function createLegalMarkBidValues(
  state: Readonly<Record<string, unknown>>,
  currentBid: MultiplayerBid | null
): readonly number[] {
  if (!readMarkBidsEnabled(state)) {
    return [];
  }

  const maxMarks = Math.max(1, readNumber(readRecord(state.rules)?.targetMarks, 7));

  if (currentBid?.kind === "marks") {
    const nextMarks = currentBid.marks + 1;

    return nextMarks <= maxMarks ? [nextMarks] : [];
  }

  const openingMax = Math.min(2, maxMarks);

  return Array.from(
    {
      length: openingMax
    },
    (_value, index) => index + 1
  );
}

function formatMultiplayerBid(bid: MultiplayerBid): string {
  switch (bid.kind) {
    case "marks":
      return formatMarkBidLabel(bid.marks);
    case "numeric":
      return String(bid.amount);
    case "pass":
      return "Pass";
  }
}

function formatMarkBidLabel(marks: number): string {
  return `${marks} ${marks === 1 ? "mark" : "marks"}`;
}

function readTrumpLabel(state: Readonly<Record<string, unknown>>): string {
  const trickMode = readContractTrickMode(state);

  if (!trickMode) {
    return "Not called";
  }

  return trickMode.kind === "none"
    ? "No Trump"
    : multiplayerTrumpSuitLabels[trickMode.trumpSuit];
}

type MultiplayerActiveTrickMode =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "pip";
      readonly trumpSuit: MultiplayerTrumpSuit;
    };

function readContractTrickMode(
  state: Readonly<Record<string, unknown>>
): MultiplayerActiveTrickMode | null {
  const contract = readRecord(state.contract) ??
    readRecord(readRecord(state.trump)?.contract);
  const selection = readRecord(contract?.trump);
  const contractKind = contract?.kind;

  if (selection?.kind === "none" || contractKind === "noTrump") {
    return {
      kind: "none"
    };
  }

  const trumpSuit = readTrumpSuit(selection?.suit) ??
    readTrumpSuit(contract?.trumpSuit);

  return trumpSuit
    ? {
        kind: "pip",
        trumpSuit
      }
    : null;
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

function readCompletedTricks(
  state: Readonly<Record<string, unknown>>
): readonly MultiplayerActiveCompletedTrick[] {
  const completedTricks = Array.isArray(state.completedTricks)
    ? state.completedTricks
    : [];

  return completedTricks.flatMap((value) => {
    const completedTrick = readRecord(value);
    const trick = readRecord(completedTrick?.trick);
    const winner = readNullableSeatNumber(completedTrick?.winner);
    const leader = readNullableSeatNumber(trick?.leader);
    const ledDomino = readDomino(trick?.ledDomino);
    const ledSuit = readTrumpSuit(trick?.ledSuit);
    const playedDominoes = readPlayedDominoes(trick?.playedDominoes);

    if (
      winner === null ||
      leader === null ||
      !ledDomino ||
      !ledSuit ||
      playedDominoes.length !== TRICK_PLAY_COUNT
    ) {
      return [];
    }

    return [
      {
        trick: {
          leader: toSeatIndex(leader),
          ledDomino,
          ledSuit,
          playedDominoes
        },
        winner: toSeatIndex(winner)
      }
    ];
  });
}

function readPlayedDominoes(value: unknown): readonly MultiplayerActiveTrickPlay[] {
  const playedDominoes = Array.isArray(value) ? value : [];

  return playedDominoes.flatMap((playValue) => {
    const play = readRecord(playValue);
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
        seatLabel: multiplayerSeatLabels[seatIndex]
      }
    ];
  });
}

function createCurrentScoreLabel(
  completedTricks: readonly MultiplayerActiveCompletedTrick[],
  teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary]
): string {
  const score = scoreCompletedTricks(completedTricks.map(toEngineCompletedTrick));

  return `${teams[0].name} ${score.teamPoints.teamA} · ${teams[1].name} ${score.teamPoints.teamB}`;
}

function createWonDominoTeams(
  completedTricks: readonly MultiplayerActiveCompletedTrick[],
  handNumber: number,
  teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary]
): readonly [
  MultiplayerActiveWonDominoTeam,
  MultiplayerActiveWonDominoTeam
] {
  return [
    createWonDominoTeam(completedTricks, handNumber, teams[0]),
    createWonDominoTeam(completedTricks, handNumber, teams[1])
  ];
}

function createWonDominoTeam(
  completedTricks: readonly MultiplayerActiveCompletedTrick[],
  handNumber: number,
  team: MultiplayerActiveTeamSummary
): MultiplayerActiveWonDominoTeam {
  const teamTricks = completedTricks
    .map((trick, index) => ({
      index,
      trick
    }))
    .filter(({ trick }) => getTeamForSeat(toSeatNumber(trick.winner)) === team.id);

  return {
    id: team.id,
    name: team.name,
    trickCount: teamTricks.length,
    tricks: teamTricks.map(({ index, trick }) => ({
      dominoes: trick.trick.playedDominoes.map((play) => play.domino),
      id: `${handNumber}-${index}`
    }))
  };
}

function toEngineCompletedTrick(
  completedTrick: MultiplayerActiveCompletedTrick
): CompletedTrick {
  return {
    trick: {
      leader: toSeatNumber(completedTrick.trick.leader),
      ledDomino: toEngineDomino(completedTrick.trick.ledDomino),
      ledSuit: completedTrick.trick.ledSuit,
      playedDominoes: completedTrick.trick.playedDominoes.map(
        (play): PlayedDomino => ({
          domino: toEngineDomino(play.domino),
          seat: toSeatNumber(play.seatIndex)
        })
      )
    } satisfies Trick,
    winner: toSeatNumber(completedTrick.winner)
  };
}

function toEngineDomino(domino: MultiplayerDomino): Domino {
  return {
    high: domino.high as Domino["high"],
    low: domino.low as Domino["low"]
  };
}

function createCompletedHandSummary(
  summary: MultiplayerCompletedHandSummary | null,
  viewerSeat: AppSyncSeatIndex | null,
  teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary]
): MultiplayerActiveCompletedHandSummary | null {
  if (!summary) {
    return null;
  }

  const biddingTeam = findTeamSummary(teams, summary.biddingTeamId);
  const awardedTeam = summary.awardedTeamId
    ? findTeamSummary(teams, summary.awardedTeamId)
    : null;
  const awardedMarks = summary.awardedTeamId === "teamA" ||
    summary.awardedTeamId === "teamB"
      ? summary.markAwards[summary.awardedTeamId]
      : 0;

  return {
    biddingTeamLabel: biddingTeam?.name ?? summary.biddingTeamId,
    biddingTeamPointsLabel:
      `${summary.biddingTeamPoints} / ${summary.bidAmount} points`,
    declarerLabel: formatSeatLabel(summary.declarer, viewerSeat),
    handNumber: summary.handNumber,
    marksAwardLabel: awardedTeam && awardedMarks > 0
      ? `${awardedTeam.name} +${awardedMarks} ${formatMarkNoun(awardedMarks)}`
      : "No marks awarded",
    outcomeLabel: summary.outcome === "made"
      ? `Made ${summary.bidLabel}`
      : `Set on ${summary.bidLabel}`,
    teamPointsLabel:
      `${teams[0].name} ${summary.teamPoints.teamA} · ${teams[1].name} ${summary.teamPoints.teamB}`,
    tricksLabel:
      `${teams[0].name} ${summary.teamTrickCounts.teamA} · ${teams[1].name} ${summary.teamTrickCounts.teamB} tricks`
  };
}

function createGameOverMessage(
  phase: string,
  state: Readonly<Record<string, unknown>>,
  teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary]
): string | null {
  if (phase !== "gameComplete") {
    return null;
  }

  const winningTeamId = readTeamId(state.winningTeamId);
  const winningTeam = winningTeamId ? findTeamSummary(teams, winningTeamId) : null;

  return winningTeam
    ? `${winningTeam.name} wins the game.`
    : "Game complete.";
}

function findTeamSummary(
  teams: readonly [MultiplayerActiveTeamSummary, MultiplayerActiveTeamSummary],
  teamId: string
): MultiplayerActiveTeamSummary | null {
  return teams.find((team) => team.id === teamId) ?? null;
}

function formatMarkNoun(value: number): string {
  return value === 1 ? "mark" : "marks";
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
  if (phase === "gameComplete") {
    return "Game complete.";
  }

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

function createLegalTrumpCalls(
  state: Readonly<Record<string, unknown>>
): readonly MultiplayerActiveTrumpCall[] {
  const calls: MultiplayerActiveTrumpCall[] = multiplayerTrumpSuits.map((suit) => ({
    label: multiplayerTrumpSuitLabels[suit],
    selection: {
      kind: "pip",
      suit
    }
  }));

  if (readNoTrumpEnabled(state)) {
    calls.push({
      label: "No Trump",
      selection: {
        kind: "none"
      }
    });
  }

  return calls;
}

function readNoTrumpEnabled(state: Readonly<Record<string, unknown>>): boolean {
  const rules = readRecord(state.rules);
  const enabledContracts = readRecord(rules?.enabledContracts);

  return enabledContracts?.noTrump === true;
}

function readMarkBidsEnabled(state: Readonly<Record<string, unknown>>): boolean {
  const rules = readRecord(state.rules);
  const enabledContracts = readRecord(rules?.enabledContracts);

  return enabledContracts?.markBids === true;
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

function readTeamId(value: unknown): TeamId | null {
  return value === "teamA" || value === "teamB" ? value : null;
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
  trickMode: MultiplayerActiveTrickMode
): MultiplayerTrumpSuit {
  if (trickMode.kind === "pip" && isDominoTrump(domino, trickMode.trumpSuit)) {
    return trickMode.trumpSuit;
  }

  return dominoSuitByPip[domino.high] ?? "blanks";
}

function doesDominoFollowSuit(
  domino: MultiplayerDomino,
  ledSuit: MultiplayerTrumpSuit,
  trickMode: MultiplayerActiveTrickMode
): boolean {
  if (trickMode.kind === "none") {
    return dominoContainsPip(domino, trumpSuitPipBySuit[ledSuit]);
  }

  if (ledSuit === trickMode.trumpSuit) {
    return isDominoTrump(domino, trickMode.trumpSuit);
  }

  return !isDominoTrump(domino, trickMode.trumpSuit) &&
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
