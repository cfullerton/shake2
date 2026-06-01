import {
  getEngineId,
  getEngineTimestamp,
  type EngineContext
} from "../context.ts";
import {
  chooseLegalRandomBotDecision,
  type LegalRandomBotDecision
} from "../bots/legal-random.ts";
import { type Domino } from "../dominoes/domino.ts";
import { EngineError } from "../errors.ts";
import {
  FORTY_TWO_ACTION_SCHEMA_VERSION,
  type CallFortyTwoTrumpAction,
  type CompleteFortyTwoBiddingAction,
  type CreateFortyTwoGameAction,
  type DealFortyTwoHandAction,
  type FortyTwoAction,
  type FortyTwoActionEnvelope,
  type PlayFortyTwoDominoAction,
  type SubmitFortyTwoBidAction
} from "../forty-two/actions.ts";
import {
  type FortyTwoCommandResult,
  handleCallFortyTwoTrumpCommand,
  handleCompleteFortyTwoBiddingCommand,
  handleCreateFortyTwoGameCommand,
  handleDealFortyTwoHandCommand,
  handlePlayFortyTwoDominoCommand,
  handleSubmitFortyTwoBidCommand
} from "../forty-two/commands.ts";
import {
  type FortyTwoEvent,
  type FortyTwoEventEnvelope
} from "../forty-two/events.ts";
import {
  standardRules,
  type RuleConfig
} from "../forty-two/rules-config.ts";
import {
  SEAT_INDICES,
  assertSeatIndex,
  type FortyTwoTeamId,
  type SeatIndex
} from "../forty-two/seats.ts";
import {
  createInitialFortyTwoSnapshot,
  type FortyTwoBiddingPhaseState,
  type FortyTwoDealtState,
  type FortyTwoSnapshotEnvelope,
  type FortyTwoState,
  type FortyTwoTrickPlayState,
  type FortyTwoTrumpPhaseState
} from "../forty-two/state.ts";
import {
  parseFortyTwoActionEnvelope
} from "./schema.ts";

export type MultiplayerRoomStatus =
  | "waiting"
  | "ready"
  | "inGame"
  | "completed";

export type MultiplayerRoomVisibility =
  | "private"
  | "public";

export type MultiplayerConnectionStatus =
  | "online"
  | "backgrounded"
  | "disconnected";

export type MultiplayerParticipantKind =
  | "human"
  | "bot";

export interface MultiplayerParticipant {
  readonly connectionStatus: MultiplayerConnectionStatus;
  readonly displayName: string;
  readonly joinedAt: string;
  readonly kind: MultiplayerParticipantKind;
  readonly playerId: string;
}

export interface MultiplayerSeatAssignment {
  readonly displayName: string;
  readonly playerId: string;
  readonly seat: SeatIndex;
}

export type MultiplayerSeats = Readonly<Record<
  SeatIndex,
  MultiplayerSeatAssignment | null
>>;

export type MultiplayerParticipants = Readonly<Record<
  string,
  MultiplayerParticipant | undefined
>>;

export interface MultiplayerRoom {
  readonly createdAt: string;
  readonly gameId?: string;
  readonly hostPlayerId: string;
  readonly participants: MultiplayerParticipants;
  readonly roomCode: string;
  readonly roomId: string;
  readonly seats: MultiplayerSeats;
  readonly status: MultiplayerRoomStatus;
  readonly updatedAt: string;
  readonly visibility: MultiplayerRoomVisibility;
}

export interface CreateMultiplayerRoomInput {
  readonly hostDisplayName: string;
  readonly hostPlayerId: string;
  readonly roomCode?: string;
  readonly roomId?: string;
  readonly visibility?: MultiplayerRoomVisibility;
}

export interface JoinMultiplayerRoomInput {
  readonly displayName: string;
  readonly playerId: string;
}

export interface TakeMultiplayerSeatInput {
  readonly playerId: string;
  readonly seat: SeatIndex;
}

export interface AddMultiplayerBotInput {
  readonly actorId: string;
  readonly botPlayerId?: string;
  readonly displayName?: string;
  readonly seat: SeatIndex;
}

export interface StartMultiplayerGameInput {
  readonly actorId: string;
  readonly dealer?: SeatIndex;
  readonly gameId?: string;
  readonly rules?: RuleConfig;
  readonly targetMarks?: number;
  readonly teamNames?: Partial<Record<FortyTwoTeamId, string>>;
}

export interface StartNextMultiplayerHandInput {
  readonly actorId: string;
}

export interface MultiplayerGameSession {
  readonly actionResults: MultiplayerActionResultIndex;
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly initialSnapshot: FortyTwoSnapshotEnvelope;
  readonly room: MultiplayerRoom;
  readonly snapshot: FortyTwoSnapshotEnvelope;
}

export type MultiplayerActionResultIndex = Readonly<Record<
  string,
  MultiplayerStoredActionResult | undefined
>>;

export type MultiplayerStoredActionResult =
  | {
      readonly actorId: string;
      readonly events: readonly FortyTwoEventEnvelope[];
      readonly ok: true;
    }
  | {
      readonly actorId: string;
      readonly error: EngineError;
      readonly ok: false;
    };

export type MultiplayerResult<TValue> =
  | {
      readonly ok: true;
      readonly value: TValue;
    }
  | {
      readonly error: EngineError;
      readonly ok: false;
    };

export type MultiplayerSubmitActionResult =
  | {
      readonly duplicate: boolean;
      readonly events: readonly FortyTwoEventEnvelope[];
      readonly ok: true;
      readonly session: MultiplayerGameSession;
      readonly snapshot: FortyTwoSnapshotEnvelope;
    }
  | {
      readonly duplicate: boolean;
      readonly error: EngineError;
      readonly ok: false;
      readonly session: MultiplayerGameSession;
    };

export interface MultiplayerStartNextHandResult {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly session: MultiplayerGameSession;
  readonly snapshot: FortyTwoSnapshotEnvelope;
}

export interface MultiplayerBotAdvanceOptions {
  readonly maxActions?: number;
}

export interface MultiplayerBotAdvanceResult {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly session: MultiplayerGameSession;
  readonly snapshot: FortyTwoSnapshotEnvelope;
}

export interface CreateMultiplayerActionEnvelopeInput<
  TAction extends FortyTwoAction
> {
  readonly action: TAction;
  readonly actionId?: string;
  readonly actorId: string;
  readonly actorSeat?: SeatIndex;
}

export interface MultiplayerRedactedHands {
  readonly handCounts: Readonly<Record<SeatIndex, number>>;
  readonly viewerHand?: readonly Domino[];
}

export type MultiplayerVisibleFortyTwoState =
  | Exclude<
      FortyTwoState,
      FortyTwoDealtState | FortyTwoBiddingPhaseState | FortyTwoTrumpPhaseState | FortyTwoTrickPlayState
    >
  | (Omit<FortyTwoDealtState, "hands"> & MultiplayerRedactedHands)
  | (Omit<FortyTwoBiddingPhaseState, "hands"> & MultiplayerRedactedHands)
  | (Omit<FortyTwoTrumpPhaseState, "hands"> & MultiplayerRedactedHands)
  | (Omit<FortyTwoTrickPlayState, "hands"> & MultiplayerRedactedHands);

export interface MultiplayerVisibleSnapshotEnvelope {
  readonly gameId: string;
  readonly generatedAt: string;
  readonly lastEventSequence: number;
  readonly schemaVersion: FortyTwoSnapshotEnvelope["schemaVersion"];
  readonly snapshot: MultiplayerVisibleFortyTwoState;
  readonly snapshotVersion: number;
}

export interface MultiplayerPlayerView {
  readonly room: MultiplayerRoom;
  readonly snapshot: MultiplayerVisibleSnapshotEnvelope;
  readonly viewerSeat: SeatIndex | null;
}

export function createMultiplayerRoom(
  input: CreateMultiplayerRoomInput,
  context: Pick<EngineContext, "newId" | "now">
): MultiplayerRoom {
  const createdAt = getEngineTimestamp(context);
  const host = createParticipant(
    input.hostPlayerId,
    input.hostDisplayName,
    createdAt
  );

  return {
    createdAt,
    hostPlayerId: host.playerId,
    participants: {
      [host.playerId]: host
    },
    roomCode: input.roomCode ?? getEngineId(context),
    roomId: input.roomId ?? getEngineId(context),
    seats: createEmptySeats(),
    status: "waiting",
    updatedAt: createdAt,
    visibility: input.visibility ?? "private"
  };
}

export function joinMultiplayerRoom(
  room: MultiplayerRoom,
  input: JoinMultiplayerRoomInput,
  context: Pick<EngineContext, "now">
): MultiplayerResult<MultiplayerRoom> {
  return runMultiplayerResult(() => {
    assertRoomCanChange(room);

    const existing = room.participants[input.playerId];

    if (existing) {
      return room;
    }

    const updatedAt = getEngineTimestamp(context);

    return {
      ...room,
      participants: {
        ...room.participants,
        [input.playerId]: createParticipant(
          input.playerId,
          input.displayName,
          updatedAt
        )
      },
      updatedAt
    };
  });
}

export function takeMultiplayerSeat(
  room: MultiplayerRoom,
  input: TakeMultiplayerSeatInput,
  context: Pick<EngineContext, "now">
): MultiplayerResult<MultiplayerRoom> {
  return runMultiplayerResult(() => {
    assertRoomCanChange(room);
    assertSeatIndex(input.seat);

    const participant = room.participants[input.playerId];

    if (!participant) {
      throw new EngineError("INVALID_ACTOR", "Player must join the room before taking a seat.");
    }

    const currentSeat = getSeatForPlayer(room, input.playerId);

    if (currentSeat !== null && currentSeat !== input.seat) {
      throw new EngineError("INVALID_SEAT", "Player already has a different seat.");
    }

    const seatAssignment = room.seats[input.seat];

    if (seatAssignment && seatAssignment.playerId !== input.playerId) {
      throw new EngineError("INVALID_SEAT", "Seat is already occupied.");
    }

    const updatedAt = getEngineTimestamp(context);
    const seats = {
      ...room.seats,
      [input.seat]: {
        displayName: participant.displayName,
        playerId: participant.playerId,
        seat: input.seat
      }
    };

    return {
      ...room,
      seats,
      status: areAllSeatsFilled(seats) ? "ready" : "waiting",
      updatedAt
    };
  });
}

export function addMultiplayerBot(
  room: MultiplayerRoom,
  input: AddMultiplayerBotInput,
  context: Pick<EngineContext, "now">
): MultiplayerResult<MultiplayerRoom> {
  return runMultiplayerResult(() => {
    assertRoomCanChange(room);
    assertSeatIndex(input.seat);

    if (input.actorId !== room.hostPlayerId) {
      throw new EngineError("INVALID_ACTOR", "Only the room host can add bots.");
    }

    const seatAssignment = room.seats[input.seat];
    const botPlayerId = input.botPlayerId ?? createBotPlayerId(input.seat);

    if (seatAssignment) {
      if (seatAssignment.playerId === botPlayerId) {
        return room;
      }

      throw new EngineError("INVALID_SEAT", "Seat is already occupied.");
    }

    const existing = room.participants[botPlayerId];

    if (existing && existing.kind !== "bot") {
      throw new EngineError("INVALID_ACTOR", "Bot player ID is already used by a player.");
    }

    const existingBotSeat = getSeatForPlayer(room, botPlayerId);

    if (existingBotSeat !== null && existingBotSeat !== input.seat) {
      throw new EngineError("INVALID_SEAT", "Bot already has a different seat.");
    }

    const updatedAt = getEngineTimestamp(context);
    const bot = existing ?? createParticipant(
      botPlayerId,
      input.displayName ?? createBotDisplayName(input.seat),
      updatedAt,
      "bot"
    );
    const seats = {
      ...room.seats,
      [input.seat]: {
        displayName: bot.displayName,
        playerId: bot.playerId,
        seat: input.seat
      }
    };

    return {
      ...room,
      participants: {
        ...room.participants,
        [bot.playerId]: bot
      },
      seats,
      status: areAllSeatsFilled(seats) ? "ready" : "waiting",
      updatedAt
    };
  });
}

export function startMultiplayerGame(
  room: MultiplayerRoom,
  input: StartMultiplayerGameInput,
  context: Pick<EngineContext, "newId" | "now" | "random">
): MultiplayerResult<MultiplayerGameSession> {
  return runMultiplayerResult(() => {
    if (input.actorId !== room.hostPlayerId) {
      throw new EngineError("INVALID_ACTOR", "Only the room host can start the game.");
    }

    if (room.status !== "ready") {
      throw new EngineError("INVALID_PHASE", "A multiplayer game requires four occupied seats.");
    }

    const gameId = input.gameId ?? getEngineId(context);
    const dealer = input.dealer ?? 0;
    const playerNames = createPlayerNamesFromSeats(room);
    const rules = input.rules
      ? input.rules
      : input.targetMarks !== undefined
        ? { ...standardRules, targetMarks: input.targetMarks }
        : undefined;
    const initialSnapshot = createInitialFortyTwoSnapshot(
      {
        dealer,
        gameId,
        mode: "multiplayer",
        playerNames,
        ...(rules ? { rules } : {}),
        ...(input.teamNames ? { teamNames: input.teamNames } : {})
      },
      context
    );
    const created = unwrapFortyTwoResult(
      handleCreateFortyTwoGameCommand(
        createFortyTwoActionEnvelope<CreateFortyTwoGameAction>(
          gameId,
          {
            payload: {
              dealer,
              mode: "multiplayer",
              playerNames,
              ...(rules ? { rules } : {}),
              ...(input.teamNames ? { teamNames: input.teamNames } : {})
            },
            type: "fortyTwo.game.create"
          },
          {
            actorId: input.actorId,
            context
          }
        ),
        context
      )
    );
    const dealt = unwrapFortyTwoResult(
      handleDealFortyTwoHandCommand(
        created.snapshot,
        createFortyTwoActionEnvelope<DealFortyTwoHandAction>(
          gameId,
          {
            payload: {
              dealer: created.snapshot.snapshot.dealer,
              handNumber: created.snapshot.snapshot.handNumber
            },
            type: "fortyTwo.hand.deal"
          },
          {
            actorId: "server",
            context,
            snapshot: created.snapshot
          }
        ),
        context
      )
    );
    const events: readonly FortyTwoEventEnvelope[] = [
      ...created.events,
      ...dealt.events
    ];
    const updatedAt = getEngineTimestamp(context);

    return {
      actionResults: {},
      events,
      initialSnapshot,
      room: {
        ...room,
        gameId,
        status: "inGame",
        updatedAt
      },
      snapshot: dealt.snapshot
    };
  });
}

export function startNextMultiplayerHand(
  session: MultiplayerGameSession,
  input: StartNextMultiplayerHandInput,
  context: Pick<EngineContext, "newId" | "now" | "random">
): MultiplayerResult<MultiplayerStartNextHandResult> {
  return runMultiplayerResult(() => {
    if (input.actorId !== session.room.hostPlayerId) {
      throw new EngineError("INVALID_ACTOR", "Only the room host can deal the next hand.");
    }

    if (session.room.status !== "inGame") {
      throw new EngineError("INVALID_PHASE", "Room is not in an active game.");
    }

    if (session.snapshot.snapshot.phase !== "setup") {
      throw new EngineError(
        "INVALID_PHASE",
        "The next hand can only be dealt after a completed hand."
      );
    }

    const dealt = unwrapFortyTwoResult(
      handleDealFortyTwoHandCommand(
        session.snapshot,
        createFortyTwoActionEnvelope<DealFortyTwoHandAction>(
          session.snapshot.gameId,
          {
            payload: {
              dealer: session.snapshot.snapshot.dealer,
              handNumber: session.snapshot.snapshot.handNumber
            },
            type: "fortyTwo.hand.deal"
          },
          {
            actorId: "server",
            context,
            snapshot: session.snapshot
          }
        ),
        context
      )
    );
    const nextSession: MultiplayerGameSession = {
      ...session,
      events: [
        ...session.events,
        ...dealt.events
      ],
      snapshot: dealt.snapshot
    };

    return {
      events: dealt.events,
      session: nextSession,
      snapshot: dealt.snapshot
    };
  });
}

export function createMultiplayerActionEnvelope<
  TAction extends FortyTwoAction
>(
  session: MultiplayerGameSession,
  input: CreateMultiplayerActionEnvelopeInput<TAction>,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoActionEnvelope<TAction> {
  const actorSeat = input.actorSeat ?? getSeatForPlayer(session.room, input.actorId);

  return createFortyTwoActionEnvelope<TAction>(
    session.snapshot.gameId,
    input.action,
    {
      actorId: input.actorId,
      ...(input.actionId !== undefined ? { actionId: input.actionId } : {}),
      ...(actorSeat !== null ? { actorSeat } : {}),
      context,
      snapshot: session.snapshot
    }
  );
}

export function submitMultiplayerGameAction(
  session: MultiplayerGameSession,
  action: unknown,
  context: Pick<EngineContext, "newId" | "now">
): MultiplayerSubmitActionResult {
  let parsedAction: FortyTwoActionEnvelope | null = null;

  try {
    parsedAction = parseFortyTwoActionEnvelope(action);
    const stored = parsedAction.actionId.trim().length > 0
      ? session.actionResults[parsedAction.actionId]
      : undefined;

    if (stored) {
      if (stored.ok) {
        return {
          duplicate: true,
          events: stored.events,
          ok: true,
          session,
          snapshot: session.snapshot
        };
      }

      return {
        duplicate: true,
        error: stored.error,
        ok: false,
        session
      };
    }

    const applied = applyAuthorizedMultiplayerAction(
      session,
      parsedAction,
      context
    );

    if (!applied.ok) {
      return storeActionFailure(
        session,
        parsedAction.actionId,
        parsedAction.actorId,
        applied.error
      );
    }

    const nextSession = storeActionSuccess(
      applied.session,
      parsedAction.actionId,
      parsedAction.actorId,
      applied.events
    );

    return {
      duplicate: false,
      events: applied.events,
      ok: true,
      session: nextSession,
      snapshot: applied.snapshot
    };
  } catch (error) {
    if (error instanceof EngineError) {
      if (parsedAction) {
        return storeActionFailure(
          session,
          parsedAction.actionId,
          parsedAction.actorId,
          error
        );
      }

      return {
        duplicate: false,
        error,
        ok: false,
        session
      };
    }

    throw error;
  }
}

export function submitMultiplayerGameActionWithBots(
  session: MultiplayerGameSession,
  action: unknown,
  context: Pick<EngineContext, "newId" | "now" | "random">,
  options: MultiplayerBotAdvanceOptions = {}
): MultiplayerSubmitActionResult {
  const result = submitMultiplayerGameAction(session, action, context);

  if (!result.ok || result.duplicate) {
    return result;
  }

  const botAdvance = advanceMultiplayerBots(
    result.session,
    context,
    options
  );

  if (!botAdvance.ok) {
    throw botAdvance.error;
  }

  const parsedAction = parseFortyTwoActionEnvelope(action);
  const events = [
    ...result.events,
    ...botAdvance.value.events
  ];
  const sessionWithUpdatedActionResult = storeActionSuccess(
    botAdvance.value.session,
    parsedAction.actionId,
    parsedAction.actorId,
    events
  );

  return {
    duplicate: false,
    events,
    ok: true,
    session: sessionWithUpdatedActionResult,
    snapshot: botAdvance.value.snapshot
  };
}

export function advanceMultiplayerBots(
  session: MultiplayerGameSession,
  context: Pick<EngineContext, "newId" | "now" | "random">,
  options: MultiplayerBotAdvanceOptions = {}
): MultiplayerResult<MultiplayerBotAdvanceResult> {
  return runMultiplayerResult(() => {
    const maxActions = options.maxActions ?? 120;
    const events: FortyTwoEventEnvelope[] = [];
    let nextSession = session;
    let actionCount = 0;

    while (actionCount < maxActions) {
      const seat = getCurrentMultiplayerTurnSeat(nextSession.snapshot);

      if (seat === null || !isBotSeat(nextSession.room, seat)) {
        break;
      }

      const assignment = nextSession.room.seats[seat];

      if (!assignment) {
        break;
      }

      const decision = chooseLegalRandomBotDecision({
        context,
        seat,
        snapshot: nextSession.snapshot
      });
      const action = createMultiplayerActionEnvelope(
        nextSession,
        {
          action: createBotFortyTwoAction(decision),
          actorId: assignment.playerId,
          actorSeat: seat
        },
        context
      );
      const applied = applyAuthorizedMultiplayerAction(
        nextSession,
        action,
        context
      );

      if (!applied.ok) {
        throw applied.error;
      }

      events.push(...applied.events);
      nextSession = applied.session;
      actionCount += 1;
    }

    if (actionCount >= maxActions) {
      const seat = getCurrentMultiplayerTurnSeat(nextSession.snapshot);

      if (seat !== null && isBotSeat(nextSession.room, seat)) {
        throw new EngineError("INVALID_ACTION", "Bot automation exceeded its action limit.");
      }
    }

    return {
      events,
      session: nextSession,
      snapshot: nextSession.snapshot
    };
  });
}

export function getMultiplayerPlayerView(
  session: MultiplayerGameSession,
  playerId: string
): MultiplayerResult<MultiplayerPlayerView> {
  return runMultiplayerResult(() => {
    if (!session.room.participants[playerId]) {
      throw new EngineError("INVALID_ACTOR", "Player is not a member of this room.");
    }

    const viewerSeat = getSeatForPlayer(session.room, playerId);

    return {
      room: session.room,
      snapshot: createMultiplayerVisibleSnapshot(session.snapshot, viewerSeat),
      viewerSeat
    };
  });
}

export function createMultiplayerVisibleSnapshot(
  snapshot: FortyTwoSnapshotEnvelope,
  viewerSeat: SeatIndex | null
): MultiplayerVisibleSnapshotEnvelope {
  return {
    ...snapshot,
    snapshot: redactFortyTwoState(snapshot.snapshot, viewerSeat)
  };
}

export function getMultiplayerSeatForPlayer(
  room: MultiplayerRoom,
  playerId: string
): SeatIndex | null {
  return getSeatForPlayer(room, playerId);
}

function createParticipant(
  playerId: string,
  displayName: string,
  joinedAt: string,
  kind: MultiplayerParticipantKind = "human"
): MultiplayerParticipant {
  if (playerId.trim().length === 0) {
    throw new EngineError("INVALID_ACTOR", "Player ID is required.");
  }

  const normalizedDisplayName = displayName.trim();

  if (normalizedDisplayName.length === 0) {
    throw new EngineError("INVALID_ACTION", "Player display name is required.");
  }

  return {
    connectionStatus: "online",
    displayName: normalizedDisplayName,
    joinedAt,
    kind,
    playerId
  };
}

function createBotPlayerId(seat: SeatIndex): string {
  return `bot-seat-${seat}`;
}

function createBotDisplayName(seat: SeatIndex): string {
  switch (seat) {
    case 0:
      return "Bot North";
    case 1:
      return "Bot East";
    case 2:
      return "Bot South";
    case 3:
      return "Bot West";
  }
}

function createEmptySeats(): MultiplayerSeats {
  return {
    0: null,
    1: null,
    2: null,
    3: null
  };
}

function assertRoomCanChange(room: MultiplayerRoom): void {
  if (room.status === "inGame" || room.status === "completed") {
    throw new EngineError("INVALID_PHASE", "Room seating cannot change after the game starts.");
  }
}

function areAllSeatsFilled(seats: MultiplayerSeats): boolean {
  return SEAT_INDICES.every((seat) => seats[seat] !== null);
}

function getSeatForPlayer(
  room: MultiplayerRoom,
  playerId: string
): SeatIndex | null {
  const seat = SEAT_INDICES.find(
    (seatIndex) => room.seats[seatIndex]?.playerId === playerId
  );

  return seat ?? null;
}

function createPlayerNamesFromSeats(
  room: MultiplayerRoom
): Partial<Record<SeatIndex, string>> {
  return SEAT_INDICES.reduce<Partial<Record<SeatIndex, string>>>(
    (playerNames, seat) => {
      const assignment = room.seats[seat];

      if (assignment) {
        playerNames[seat] = assignment.displayName;
      }

      return playerNames;
    },
    {}
  );
}

function createFortyTwoActionEnvelope<TAction extends FortyTwoAction>(
  gameId: string,
  action: TAction,
  input: {
    readonly actionId?: string;
    readonly actorId: string;
    readonly actorSeat?: SeatIndex;
    readonly context: Pick<EngineContext, "newId" | "now">;
    readonly snapshot?: FortyTwoSnapshotEnvelope;
  }
): FortyTwoActionEnvelope<TAction> {
  return {
    action,
    actionId: input.actionId ?? getEngineId(input.context),
    actorId: input.actorId,
    ...(input.actorSeat !== undefined ? { actorSeat: input.actorSeat } : {}),
    clientCreatedAt: getEngineTimestamp(input.context),
    gameId,
    ...(input.snapshot
      ? {
          knownLastEventSequence: input.snapshot.lastEventSequence,
          knownSnapshotVersion: input.snapshot.snapshotVersion
        }
      : {}),
    schemaVersion: FORTY_TWO_ACTION_SCHEMA_VERSION
  };
}

function assertMultiplayerActionAuthorized(
  session: MultiplayerGameSession,
  action: FortyTwoActionEnvelope
): void {
  if (session.room.status !== "inGame") {
    throw new EngineError("INVALID_PHASE", "Room is not in a playable game.");
  }

  if (!session.room.participants[action.actorId]) {
    throw new EngineError("INVALID_ACTOR", "Actor is not a room member.");
  }

  if (action.gameId !== session.snapshot.gameId) {
    throw new EngineError("GAME_NOT_FOUND", "Action belongs to a different game.");
  }

  switch (action.action.type) {
    case "fortyTwo.bid.submit":
    case "fortyTwo.trump.call":
    case "fortyTwo.domino.play":
      assertActorOwnsSeat(session.room, action.actorId, action.actorSeat);
      return;
    case "fortyTwo.game.create":
    case "fortyTwo.hand.deal":
    case "fortyTwo.bidding.complete":
    case "fortyTwo.trick.complete":
    case "fortyTwo.hand.complete":
    case "fortyTwo.game.complete":
      throw new EngineError(
        "INVALID_ACTION",
        "Clients cannot submit server-managed game actions."
      );
  }
}

function assertActorOwnsSeat(
  room: MultiplayerRoom,
  actorId: string,
  actorSeat: SeatIndex | undefined
): void {
  if (actorSeat === undefined) {
    throw new EngineError("INVALID_ACTOR", "Multiplayer action requires an actor seat.");
  }

  assertSeatIndex(actorSeat);

  if (room.seats[actorSeat]?.playerId !== actorId) {
    throw new EngineError("INVALID_ACTOR", "Actor does not own the claimed seat.");
  }
}

function runFortyTwoAction(
  snapshot: FortyTwoSnapshotEnvelope,
  action: FortyTwoActionEnvelope,
  context: Pick<EngineContext, "newId" | "now">
): FortyTwoCommandResult {
  switch (action.action.type) {
    case "fortyTwo.bid.submit":
      return handleSubmitFortyTwoBidCommand(
        snapshot,
        action as FortyTwoActionEnvelope<SubmitFortyTwoBidAction>,
        context
      );
    case "fortyTwo.trump.call":
      return handleCallFortyTwoTrumpCommand(
        snapshot,
        action as FortyTwoActionEnvelope<CallFortyTwoTrumpAction>,
        context
      );
    case "fortyTwo.domino.play":
      return handlePlayFortyTwoDominoCommand(
        snapshot,
        action as FortyTwoActionEnvelope<PlayFortyTwoDominoAction>,
        context
      );
    case "fortyTwo.game.create":
    case "fortyTwo.hand.deal":
    case "fortyTwo.bidding.complete":
    case "fortyTwo.trick.complete":
    case "fortyTwo.hand.complete":
    case "fortyTwo.game.complete":
      return {
        error: new EngineError(
          "INVALID_ACTION",
          "Unsupported multiplayer action."
        ),
        ok: false
      };
  }
}

function applyAuthorizedMultiplayerAction(
  session: MultiplayerGameSession,
  action: FortyTwoActionEnvelope,
  context: Pick<EngineContext, "newId" | "now">
): {
  readonly error: EngineError;
  readonly ok: false;
} | {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly ok: true;
  readonly session: MultiplayerGameSession;
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  assertMultiplayerActionAuthorized(session, action);

  const commandResult = runFortyTwoAction(session.snapshot, action, context);

  if (!commandResult.ok) {
    return commandResult;
  }

  const advanced = applyMultiplayerAutomation(
    commandResult.snapshot,
    commandResult.events,
    context
  );
  const events: readonly FortyTwoEventEnvelope[] = [
    ...commandResult.events,
    ...advanced.events
  ];
  const snapshot = advanced.snapshot;

  return {
    events,
    ok: true,
    session: appendMultiplayerEvents(session, events, snapshot),
    snapshot
  };
}

function applyMultiplayerAutomation(
  snapshot: FortyTwoSnapshotEnvelope,
  events: readonly FortyTwoEventEnvelope[],
  context: Pick<EngineContext, "newId" | "now">
): {
  readonly events: readonly FortyTwoEventEnvelope[];
  readonly snapshot: FortyTwoSnapshotEnvelope;
} {
  const lastEvent = events[events.length - 1];

  if (
    lastEvent?.event.type === "fortyTwo.bid.submitted" &&
    snapshot.snapshot.phase === "bidding" &&
    snapshot.snapshot.bidding.status === "complete"
  ) {
    const completed = unwrapFortyTwoResult(
      handleCompleteFortyTwoBiddingCommand(
        snapshot,
        createFortyTwoActionEnvelope<CompleteFortyTwoBiddingAction>(
          snapshot.gameId,
          {
            payload: {},
            type: "fortyTwo.bidding.complete"
          },
          {
            actorId: "server",
            context,
            snapshot
          }
        ),
        context
      )
    );

    return {
      events: completed.events,
      snapshot: completed.snapshot
    };
  }

  return {
    events: [],
    snapshot
  };
}

function appendMultiplayerEvents(
  session: MultiplayerGameSession,
  events: readonly FortyTwoEventEnvelope[],
  snapshot: FortyTwoSnapshotEnvelope
): MultiplayerGameSession {
  return {
    ...session,
    events: [
      ...session.events,
      ...events
    ],
    room: snapshot.snapshot.phase === "gameComplete"
      ? {
          ...session.room,
          status: "completed",
          updatedAt: snapshot.snapshot.completedAt
        }
      : session.room,
    snapshot
  };
}

function getCurrentMultiplayerTurnSeat(
  snapshot: FortyTwoSnapshotEnvelope
): SeatIndex | null {
  const state = snapshot.snapshot;

  if (state.phase === "dealt") {
    return ((state.dealer + 1) % 4) as SeatIndex;
  }

  if (state.phase === "bidding") {
    return state.bidding.currentSeat;
  }

  if (state.phase === "trump") {
    return state.trump.declarer;
  }

  if (state.phase === "trickPlay") {
    return ((state.currentTrick.leader +
      state.currentTrick.playedDominoes.length) % 4) as SeatIndex;
  }

  return null;
}

function isBotSeat(room: MultiplayerRoom, seat: SeatIndex): boolean {
  const assignment = room.seats[seat];

  if (!assignment) {
    return false;
  }

  return room.participants[assignment.playerId]?.kind === "bot";
}

function createBotFortyTwoAction(
  decision: LegalRandomBotDecision
): SubmitFortyTwoBidAction | CallFortyTwoTrumpAction | PlayFortyTwoDominoAction {
  switch (decision.kind) {
    case "bid":
      return {
        payload: {
          bid: decision.bid,
          seat: decision.seat
        },
        type: "fortyTwo.bid.submit"
      };
    case "callTrump":
      return {
        payload: {
          trump: decision.trump
        },
        type: "fortyTwo.trump.call"
      };
    case "playDomino":
      return {
        payload: {
          domino: decision.play.domino,
          ...(decision.play.ledSuit !== undefined
            ? { ledSuit: decision.play.ledSuit }
            : {}),
          seat: decision.seat
        },
        type: "fortyTwo.domino.play"
      };
  }
}

function storeActionSuccess(
  session: MultiplayerGameSession,
  actionId: string,
  actorId: string,
  events: readonly FortyTwoEventEnvelope[]
): MultiplayerGameSession {
  if (actionId.trim().length === 0) {
    return session;
  }

  return {
    ...session,
    actionResults: {
      ...session.actionResults,
      [actionId]: {
        actorId,
        events,
        ok: true
      }
    }
  };
}

function storeActionFailure(
  session: MultiplayerGameSession,
  actionId: string,
  actorId: string,
  error: EngineError
): MultiplayerSubmitActionResult {
  const nextSession = actionId.trim().length === 0
    ? session
    : {
        ...session,
        actionResults: {
          ...session.actionResults,
          [actionId]: {
            actorId,
            error,
            ok: false as const
          }
        }
      };

  return {
    duplicate: false,
    error,
    ok: false,
    session: nextSession
  };
}

function redactFortyTwoState(
  state: FortyTwoState,
  viewerSeat: SeatIndex | null
): MultiplayerVisibleFortyTwoState {
  if ("hands" in state) {
    const { hands, ...publicState } = state;
    const redactedState = {
      ...publicState,
      handCounts: createHandCounts(hands),
      ...(viewerSeat !== null ? { viewerHand: hands[viewerSeat] } : {})
    };

    return redactedState as MultiplayerVisibleFortyTwoState;
  }

  return state;
}

function createHandCounts(
  hands: Readonly<Record<SeatIndex, readonly Domino[]>>
): Readonly<Record<SeatIndex, number>> {
  return {
    0: hands[0].length,
    1: hands[1].length,
    2: hands[2].length,
    3: hands[3].length
  };
}

function unwrapFortyTwoResult<TEvent extends FortyTwoEvent>(
  result: FortyTwoCommandResult<TEvent>
): Extract<FortyTwoCommandResult<TEvent>, { readonly ok: true }> {
  if (!result.ok) {
    throw result.error;
  }

  return result;
}

function runMultiplayerResult<TValue>(
  run: () => TValue
): MultiplayerResult<TValue> {
  try {
    return {
      ok: true,
      value: run()
    };
  } catch (error) {
    if (error instanceof EngineError) {
      return {
        error,
        ok: false
      };
    }

    throw error;
  }
}
