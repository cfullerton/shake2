import { AlertCircle, Play, RefreshCw, Send } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { Button } from "../components/Button";
import { EventFeed } from "../components/EventFeed";
import { GameText } from "../components/GameText";
import {
  multiplayerSeatLabels,
  useMultiplayerActiveGame,
  type AppSyncSeatIndex,
  type MultiplayerActiveGameView,
  type MultiplayerActiveSeatSummary,
  type MultiplayerActiveTrickPlay,
  type MultiplayerLobbyGameClient
} from "../multiplayer";
import type {
  CognitoAuthSession,
  MultiplayerDomino,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView,
  MultiplayerTrumpSelection,
  MultiplayerTrumpSuit
} from "../multiplayer";
import { palette, radius, spacing } from "../theme";

export function MultiplayerActiveGamePanel({
  actorId,
  client,
  initialRoom,
  initialSnapshot,
  onStartNewGame,
  session
}: {
  readonly actorId: string | null;
  readonly client: MultiplayerLobbyGameClient;
  readonly initialRoom: MultiplayerRoomView;
  readonly initialSnapshot: MultiplayerPublicGameSnapshot;
  readonly onStartNewGame?: () => void;
  readonly session: CognitoAuthSession;
}) {
  const game = useMultiplayerActiveGame({
    actorId,
    client,
    initialRoom,
    initialSnapshot
  });
  const view = game.view;
  const canSubmitActions = actorId !== null;
  const legalPlayByDominoKey = new Map(
    view.legalDominoPlays.map((play) => [play.domino.key, play])
  );
  const currentTrickPlayBySeat = new Map(
    view.currentTrickPlays.map((play) => [play.seatIndex, play])
  );
  const activityEntries = createMultiplayerActivityEntries(view);
  const isTrickPlayStatus = view.phase === "trickPlay";

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <GameText style={styles.title}>Online Game</GameText>
          <Text style={styles.meta}>
            Room {view.roomCode} · {view.viewerSeatLabel} · {session.username}
          </Text>
        </View>
        <View style={styles.phasePill}>
          <Text style={styles.phasePillText}>{view.phaseTitle}</Text>
        </View>
      </View>

      <View style={styles.scoreboard}>
        {view.teams.map((team) => (
          <View key={team.id} style={styles.scoreRow}>
            <Text style={styles.scoreName}>{team.name}</Text>
            <Text style={styles.scoreMarks}>{team.marks}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.tablePanel, isTrickPlayStatus ? styles.compactPanel : null]}>
        <View style={styles.sectionHeader}>
          <Text
            style={[
              styles.panelTitle,
              isTrickPlayStatus ? styles.compactPanelTitle : null
            ]}
          >
            Table status
          </Text>
          <Text style={styles.meta}>
            Latest: {getLatestActivityText(activityEntries)}
          </Text>
        </View>
        <View style={[styles.statusGrid, isTrickPlayStatus ? styles.compactInfoGrid : null]}>
          <InfoTile
            compact={isTrickPlayStatus}
            label="Turn"
            value={getCurrentTurnDisplayLabel(view)}
          />
          <InfoTile
            compact={isTrickPlayStatus}
            label="Dealer"
            value={getDealerDisplayLabel(view)}
          />
          <InfoTile
            compact={isTrickPlayStatus}
            label="Current bid"
            value={view.currentBidLabel}
          />
          <InfoTile
            compact={isTrickPlayStatus}
            label="Trump"
            value={view.currentTrumpLabel}
          />
          <InfoTile
            compact={isTrickPlayStatus}
            label="Current score"
            value={view.currentScoreLabel}
          />
        </View>
      </View>

      {view.lastCompletedHand ? (
        <View style={styles.tablePanel}>
          <View style={styles.tableHeader}>
            <Text style={styles.panelTitle}>
              {view.gameOverMessage ? "Game Complete" : "Last Hand"}
            </Text>
            <Text style={styles.meta}>Hand {view.lastCompletedHand.handNumber}</Text>
          </View>
          {view.gameOverMessage ? (
            <Text style={styles.resultBanner}>{view.gameOverMessage}</Text>
          ) : null}
          <View style={styles.statusGrid}>
            <InfoTile
              label="Result"
              value={view.lastCompletedHand.outcomeLabel}
            />
            <InfoTile
              label="Bid Team"
              value={view.lastCompletedHand.biddingTeamLabel}
            />
            <InfoTile
              label="Declarer"
              value={view.lastCompletedHand.declarerLabel}
            />
            <InfoTile
              label="Bid Points"
              value={view.lastCompletedHand.biddingTeamPointsLabel}
            />
            <InfoTile
              label="Hand Points"
              value={view.lastCompletedHand.teamPointsLabel}
            />
            <InfoTile
              label="Tricks"
              value={view.lastCompletedHand.tricksLabel}
            />
          </View>
          <Text style={styles.copy}>{view.lastCompletedHand.marksAwardLabel}</Text>
          {view.gameOverMessage && onStartNewGame ? (
            <Button
              icon={<Play color={palette.surface} size={16} />}
              onPress={onStartNewGame}
            >
              Start New Game
            </Button>
          ) : null}
        </View>
      ) : null}

      <View style={styles.tablePanel}>
        <View style={styles.tableHeader}>
          <Text style={styles.panelTitle}>Current trick</Text>
          <Text style={styles.meta}>{view.currentTrickLeadLabel}</Text>
        </View>
        <View style={styles.trickMetaRow}>
          <Text style={styles.meta}>
            Leader: {getCurrentTrickLeaderDisplayLabel(view)}
          </Text>
          <Text style={styles.meta}>
            Led: {getCurrentTrickLedLabel(view)}
          </Text>
        </View>
        <View style={styles.trickTable} testID="multiplayer-game-trick-table">
          <MultiplayerTrickSeatSlot
            play={currentTrickPlayBySeat.get("SEAT_2")}
            positionStyle={styles.trickSeatTop}
            seat={getSeatSummary(view, "SEAT_2")}
            testID="multiplayer-game-trick-seat-top"
          />
          <MultiplayerTrickSeatSlot
            play={currentTrickPlayBySeat.get("SEAT_1")}
            positionStyle={styles.trickSeatLeft}
            seat={getSeatSummary(view, "SEAT_1")}
            testID="multiplayer-game-trick-seat-left"
          />
          <MultiplayerTrickSeatSlot
            play={currentTrickPlayBySeat.get("SEAT_3")}
            positionStyle={styles.trickSeatRight}
            seat={getSeatSummary(view, "SEAT_3")}
            testID="multiplayer-game-trick-seat-right"
          />
          <MultiplayerTrickSeatSlot
            play={currentTrickPlayBySeat.get("SEAT_0")}
            positionStyle={styles.trickSeatBottom}
            seat={getSeatSummary(view, "SEAT_0")}
            testID="multiplayer-game-trick-seat-bottom"
          />
        </View>
        {view.currentTrickPlays.length === 0 ? (
          <Text style={styles.copy}>No dominoes played yet.</Text>
        ) : null}
      </View>

      <View style={styles.tablePanel}>
        <View style={styles.tableHeader}>
          <Text style={styles.panelTitle}>Your Hand</Text>
          <Text style={styles.meta}>
            {game.busyAction === "loadPrivateHand"
              ? "Loading"
              : `${view.privateHand.length} dominoes`}
          </Text>
        </View>
        {view.privateHand.length > 0 ? (
          <View style={styles.dominoGrid}>
            {view.privateHand.map((domino) => {
              const legalPlay = legalPlayByDominoKey.get(domino.key);
              const playDisabled = view.canPlayDomino &&
                (!legalPlay ||
                  !canSubmitActions ||
                  game.busyAction === "submitDomino");

              return (
                <MultiplayerDominoTile
                  disabled={playDisabled}
                  domino={domino}
                  key={domino.key}
                  onPress={
                    legalPlay
                      ? () => game.submitDomino(legalPlay)
                      : undefined
                  }
                  playable={view.canPlayDomino && Boolean(legalPlay)}
                />
              );
            })}
          </View>
        ) : (
          <Text style={styles.copy}>Your private hand will appear here.</Text>
        )}
      </View>

      <View style={styles.tablePanel}>
        <View style={styles.tableHeader}>
          <Text style={styles.panelTitle}>Action</Text>
          <Button
            icon={<RefreshCw color={palette.ink} size={16} />}
            loading={game.busyAction === "refresh"}
            onPress={game.refresh}
            variant="secondary"
          >
            Refresh
          </Button>
        </View>
        {view.canPlayDomino ? (
          <>
            <Text style={styles.copy}>Choose a domino from your hand.</Text>
            <Text style={styles.meta}>{view.currentTrickLeadLabel}</Text>
          </>
        ) : view.canCallTrump ? (
          <>
            <Text style={styles.copy}>Call trump for this hand.</Text>
            <View style={styles.trumpGrid}>
              {view.legalTrumpCalls.map((call) => (
                <TrumpCallButton
                  call={call}
                  disabled={!canSubmitActions || game.busyAction === "submitTrump"}
                  key={getTrumpSelectionKey(call.selection)}
                  onPress={() => game.submitTrump(call.selection)}
                />
              ))}
            </View>
          </>
        ) : view.canPass || view.canSubmitBid ? (
          <>
            <Text style={styles.copy}>Your bid.</Text>
            <View style={styles.bidGrid}>
              {view.legalBidOptions
                .filter((option) => option.bid.kind !== "pass")
                .map((option) => (
                  <Button
                    disabled={!canSubmitActions}
                    key={option.label}
                    loading={game.busyAction === "submitBid"}
                    onPress={() => game.submitBid(option.bid)}
                    style={styles.bidButton}
                  >
                    {option.label}
                  </Button>
                ))}
            </View>
            <Button
              disabled={!canSubmitActions}
              icon={<Send color={palette.ink} size={16} />}
              loading={game.busyAction === "submitBid"}
              onPress={() =>
                game.submitBid({
                  kind: "pass"
                })
              }
              variant="secondary"
            >
              Pass
            </Button>
          </>
        ) : view.canStartNextHand ? (
          <>
            <Text style={styles.copy}>Ready for the next hand.</Text>
            <Button
              disabled={!canSubmitActions}
              icon={<Play color={palette.surface} size={16} />}
              loading={game.busyAction === "startNextHand"}
              onPress={game.startNextHand}
            >
              Deal Next Hand
            </Button>
          </>
        ) : (
          <Text style={styles.copy}>{view.waitingMessage}</Text>
        )}
      </View>

      <View style={styles.tablePanel}>
        <Text style={styles.panelTitle}>Activity</Text>
        <EventFeed entries={activityEntries} />
      </View>

      {hasWonDominoes(view) ? (
        <View style={styles.tablePanel}>
          <Text style={styles.panelTitle}>Won Dominoes</Text>
          <MultiplayerWonDominoesSection team={view.wonDominoes[0]} />
          <View style={styles.wonDominoesDivider} />
          <MultiplayerWonDominoesSection team={view.wonDominoes[1]} />
        </View>
      ) : null}

      <View style={styles.tablePanel}>
        <View style={styles.tableHeader}>
          <Text style={styles.panelTitle}>Table</Text>
          <Text style={styles.meta}>Hand {view.handNumber}</Text>
        </View>
        <View style={styles.seatGrid}>
          {view.seatSummaries.map((seat) => (
            <View
              key={seat.seatIndex}
              style={[
                styles.seatCard,
                seat.isViewer ? styles.viewerSeatCard : null,
                seat.isCurrentTurn ? styles.currentSeatCard : null
              ]}
            >
              <Text style={styles.seatLabel}>
                {multiplayerSeatLabels[seat.seatIndex]}
                {seat.isDealer ? " · Dealer" : ""}
              </Text>
              <Text numberOfLines={1} style={styles.seatName}>
                {seat.occupied ? seat.displayName : "Empty"}
              </Text>
              <Text style={styles.meta}>
                {seat.handCount === null
                  ? "Cards hidden"
                  : `${seat.handCount} dominoes`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {game.error ? (
        <Pressable onPress={game.clearError} style={styles.errorBanner}>
          <AlertCircle color={palette.red} size={18} />
          <Text style={styles.errorText}>{game.error}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoTile({
  compact = false,
  label,
  value
}: {
  readonly compact?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={[styles.infoTile, compact ? styles.compactInfoTile : null]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, compact ? styles.compactInfoValue : null]}>
        {value}
      </Text>
    </View>
  );
}

function MultiplayerTrickSeatSlot({
  play,
  positionStyle,
  seat,
  testID
}: {
  readonly play: MultiplayerActiveTrickPlay | undefined;
  readonly positionStyle: StyleProp<ViewStyle>;
  readonly seat: MultiplayerActiveSeatSummary | undefined;
  readonly testID: string;
}) {
  const displayName = getSeatDisplayName(seat);

  return (
    <View style={[styles.trickSeatSlot, positionStyle]} testID={testID}>
      <Text numberOfLines={1} style={styles.trickSeatName}>
        {displayName}
      </Text>
      {play ? (
        <MultiplayerDominoTile
          accessibilityLabel={`${displayName} played ${play.domino.key}`}
          domino={play.domino}
          size="small"
        />
      ) : (
        <Text style={styles.trickWaitingText}>Waiting</Text>
      )}
    </View>
  );
}

function MultiplayerWonDominoesSection({
  team
}: {
  readonly team: MultiplayerActiveGameView["wonDominoes"][number];
}) {
  return (
    <View style={styles.wonTeamSection}>
      <Text style={styles.wonTeamLabel}>
        {team.name} · {team.trickCount} trick{team.trickCount !== 1 ? "s" : ""}
      </Text>
      {team.tricks.length === 0 ? (
        <Text style={styles.meta}>No tricks yet</Text>
      ) : (
        <View style={styles.wonTricksList}>
          {team.tricks.map((trick) => (
            <View key={trick.id} style={styles.wonTrickPile}>
              {trick.dominoes.map((domino) => (
                <MultiplayerDominoTile
                  accessibilityLabel={`${domino.key} won by ${team.name}`}
                  domino={domino}
                  key={domino.key}
                  size="small"
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function createMultiplayerActivityEntries(
  view: MultiplayerActiveGameView
): readonly {
  readonly id: string;
  readonly text: string;
}[] {
  const entries: {
    readonly id: string;
    readonly text: string;
  }[] = [
    {
      id: `phase-${view.handNumber}-${view.phase}`,
      text: `Hand ${view.handNumber}: ${view.phaseTitle}.`
    }
  ];

  if (view.currentBidLabel !== "No bid yet") {
    entries.push({
      id: `bid-${view.currentBidLabel}`,
      text: `Current bid ${view.currentBidLabel}.`
    });
  }

  if (view.currentTrumpLabel !== "Not called") {
    entries.push({
      id: `trump-${view.currentTrumpLabel}`,
      text: `${view.currentTrumpLabel} trump.`
    });
  }

  for (const play of view.currentTrickPlays) {
    const seat = getSeatSummary(view, play.seatIndex);

    entries.push({
      id: `play-${play.seatIndex}-${play.domino.key}`,
      text: `${getSeatDisplayName(seat)} played ${play.domino.key}.`
    });
  }

  if (view.lastCompletedHand) {
    entries.push({
      id: `last-hand-${view.lastCompletedHand.handNumber}`,
      text: `${view.lastCompletedHand.outcomeLabel}. ${view.lastCompletedHand.marksAwardLabel}.`
    });
  }

  return entries.slice(-6);
}

function hasWonDominoes(view: MultiplayerActiveGameView): boolean {
  return view.wonDominoes.some((team) => team.tricks.length > 0);
}

function getLatestActivityText(
  entries: readonly {
    readonly text: string;
  }[]
): string {
  return entries.at(-1)?.text ?? "No activity yet.";
}

function getSeatSummary(
  view: MultiplayerActiveGameView,
  seatIndex: AppSyncSeatIndex
): MultiplayerActiveSeatSummary | undefined {
  return view.seatSummaries.find((seat) => seat.seatIndex === seatIndex);
}

function getSeatDisplayName(
  seat: MultiplayerActiveSeatSummary | undefined
): string {
  if (!seat || !seat.occupied) {
    return "Empty";
  }

  return seat.displayName;
}

function getStatusSeatDisplayName(
  seat: MultiplayerActiveSeatSummary | undefined,
  fallback: string
): string {
  if (!seat || !seat.occupied) {
    return fallback;
  }

  return seat.isViewer ? `${seat.displayName} (You)` : seat.displayName;
}

function getCurrentTurnDisplayLabel(view: MultiplayerActiveGameView): string {
  const currentSeat = view.seatSummaries.find((seat) => seat.isCurrentTurn);

  return getStatusSeatDisplayName(currentSeat, view.currentTurnLabel);
}

function getDealerDisplayLabel(view: MultiplayerActiveGameView): string {
  const dealerSeat = view.seatSummaries.find((seat) => seat.isDealer);

  return getStatusSeatDisplayName(dealerSeat, view.dealerLabel);
}

function getCurrentTrickLeaderDisplayLabel(
  view: MultiplayerActiveGameView
): string {
  const leaderSeatIndex = view.currentTrickPlays[0]?.seatIndex ??
    (view.phase === "trickPlay"
      ? view.seatSummaries.find((seat) => seat.isCurrentTurn)?.seatIndex
      : undefined);

  if (!leaderSeatIndex) {
    return "Waiting";
  }

  return getSeatDisplayName(getSeatSummary(view, leaderSeatIndex));
}

function getCurrentTrickLedLabel(view: MultiplayerActiveGameView): string {
  if (view.currentTrickPlays.length === 0) {
    return "Not led yet";
  }

  return view.currentTrickLeadLabel.endsWith(" led")
    ? view.currentTrickLeadLabel.slice(0, -" led".length)
    : view.currentTrickLeadLabel;
}

function MultiplayerDominoTile({
  accessibilityLabel,
  disabled = false,
  domino,
  onPress,
  playable = false,
  size = "regular"
}: {
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly domino: MultiplayerDomino;
  readonly onPress?: () => void;
  readonly playable?: boolean;
  readonly size?: "regular" | "small";
}) {
  const isSmall = size === "small";
  const tileStyle = [
    styles.dominoTile,
    isSmall ? styles.dominoTileSmall : null,
    playable ? styles.playableDominoTile : null,
    disabled ? styles.disabledTile : null
  ];
  const content = (
    <>
      <DominoHalf pip={domino.high} size={size} />
      <View style={[styles.dominoDivider, isSmall ? styles.dominoDividerSmall : null]} />
      <DominoHalf pip={domino.low} size={size} />
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? `Play domino ${domino.key}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          ...tileStyle,
          pressed && !disabled ? styles.pressedTile : null
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? `Domino ${domino.key}`}
      accessibilityRole="image"
      style={tileStyle}
    >
      {content}
    </View>
  );
}

function DominoHalf({
  pip,
  size = "regular"
}: {
  readonly pip: number;
  readonly size?: "regular" | "small";
}) {
  const filledCells = pipCellsByValue[pip] ?? [];
  const isSmall = size === "small";

  return (
    <View style={[styles.dominoHalf, isSmall ? styles.dominoHalfSmall : null]}>
      {Array.from({ length: 9 }, (_value, cell) => (
        <View key={cell} style={styles.pipCell}>
          {filledCells.includes(cell) ? (
            <View style={[styles.dominoPip, isSmall ? styles.dominoPipSmall : null]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function TrumpCallButton({
  call,
  disabled,
  onPress
}: {
  readonly call: MultiplayerActiveGameView["legalTrumpCalls"][number];
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const isNoTrump = call.selection.kind === "none";

  return (
    <Pressable
      accessibilityLabel={isNoTrump ? "Call No Trump" : `Call ${call.label} trump`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.trumpTile,
        disabled ? styles.disabledTile : null,
        pressed && !disabled ? styles.pressedTile : null
      ]}
    >
      {call.selection.kind === "pip" ? (
        <TrumpSuitPips trumpSuit={call.selection.suit} />
      ) : (
        <Text style={styles.noTrumpSymbol}>NT</Text>
      )}
      <Text style={styles.trumpTileLabel}>{call.label}</Text>
    </Pressable>
  );
}

function TrumpSuitPips({
  trumpSuit
}: {
  readonly trumpSuit: MultiplayerTrumpSuit;
}) {
  const count = trumpSuitPipCount[trumpSuit];

  return (
    <View style={styles.trumpPipContainer}>
      {Array.from({ length: count }, (_value, index) => (
        <View key={index} style={styles.trumpPip} />
      ))}
    </View>
  );
}

function getTrumpSelectionKey(selection: MultiplayerTrumpSelection): string {
  return selection.kind === "pip" ? `pip-${selection.suit}` : "no-trump";
}

const pipCellsByValue: Record<number, readonly number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

const trumpSuitPipCount: Record<MultiplayerTrumpSuit, number> = {
  blanks: 0,
  fives: 5,
  fours: 4,
  ones: 1,
  sixes: 6,
  threes: 3,
  twos: 2
};

const styles = StyleSheet.create({
  bidButton: {
    flexBasis: "30%",
    flexGrow: 1,
    minHeight: 48
  },
  bidGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  compactInfoGrid: {
    gap: spacing.xs
  },
  compactInfoTile: {
    minWidth: 116,
    padding: spacing.xs
  },
  compactInfoValue: {
    fontSize: 14,
    lineHeight: 18
  },
  compactPanel: {
    gap: spacing.sm,
    padding: spacing.sm
  },
  compactPanelTitle: {
    fontSize: 17
  },
  copy: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  currentSeatCard: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold
  },
  disabledTile: {
    opacity: 0.48
  },
  dominoDivider: {
    backgroundColor: palette.ink,
    height: 1,
    opacity: 0.24,
    width: "100%"
  },
  dominoDividerSmall: {
    height: 32,
    width: 1
  },
  dominoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  dominoHalf: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    height: 34,
    justifyContent: "center",
    width: 42
  },
  dominoHalfSmall: {
    height: 32,
    width: 32
  },
  dominoPip: {
    backgroundColor: palette.ink,
    borderRadius: 4,
    height: 7,
    width: 7
  },
  dominoPipSmall: {
    borderRadius: 3,
    height: 6,
    width: 6
  },
  dominoTile: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: "rgba(75, 54, 33, 0.22)",
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    shadowColor: palette.ink,
    shadowOffset: {
      height: 2,
      width: 0
    },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: 58
  },
  dominoTileSmall: {
    borderWidth: 1,
    flexDirection: "row",
    gap: 3,
    height: 44,
    padding: 3,
    shadowOpacity: 0,
    width: 82
  },
  errorBanner: {
    alignItems: "center",
    backgroundColor: palette.crimsonSoft,
    borderColor: palette.red,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  errorText: {
    color: palette.red,
    flex: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  infoLabel: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  infoTile: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  infoValue: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  meta: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  noTrumpSymbol: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  playableDominoTile: {
    borderColor: palette.felt,
    borderWidth: 2
  },
  phasePill: {
    backgroundColor: palette.felt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  phasePillText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  pipCell: {
    alignItems: "center",
    height: "33.333%",
    justifyContent: "center",
    width: "33.333%"
  },
  scoreMarks: {
    color: palette.crimson,
    fontSize: 26,
    fontWeight: "900"
  },
  scoreName: {
    color: palette.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  },
  scoreRow: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreboard: {
    flexDirection: "row",
    gap: spacing.sm
  },
  sectionHeader: {
    gap: spacing.xs
  },
  seatCard: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  seatLabel: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  seatName: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  shell: {
    gap: spacing.md
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  tableHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  tablePanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  title: {
    color: palette.ink,
    fontSize: 26
  },
  pressedTile: {
    opacity: 0.78
  },
  resultBanner: {
    color: palette.crimson,
    fontSize: 18,
    fontWeight: "900"
  },
  trickMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  trickSeatBottom: {
    bottom: 0,
    left: "50%",
    transform: [{ translateX: -56 }]
  },
  trickSeatLeft: {
    left: 0,
    top: "50%",
    transform: [{ translateY: -42 }]
  },
  trickSeatName: {
    color: palette.paperMuted,
    fontSize: 11,
    fontWeight: "900"
  },
  trickSeatRight: {
    right: 0,
    top: "50%",
    transform: [{ translateY: -42 }]
  },
  trickSeatSlot: {
    alignItems: "center",
    gap: spacing.xs,
    position: "absolute",
    width: 112
  },
  trickSeatTop: {
    left: "50%",
    top: 0,
    transform: [{ translateX: -56 }]
  },
  trickTable: {
    alignSelf: "center",
    backgroundColor: palette.felt,
    borderRadius: radius.md,
    minHeight: 220,
    position: "relative",
    width: "100%"
  },
  trickWaitingText: {
    color: palette.paperMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  trumpGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  trumpPip: {
    backgroundColor: palette.ink,
    borderRadius: 5,
    height: 10,
    width: 10
  },
  trumpPipContainer: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    height: 30,
    justifyContent: "center",
    width: 56
  },
  trumpTile: {
    alignItems: "center",
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 82,
    padding: spacing.sm
  },
  trumpTileLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  viewerSeatCard: {
    borderColor: palette.crimson,
    borderWidth: 2
  },
  wonDominoesDivider: {
    backgroundColor: palette.border,
    height: 1
  },
  wonTeamLabel: {
    color: palette.subtle,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  wonTeamSection: {
    gap: spacing.sm
  },
  wonTrickPile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  wonTricksList: {
    gap: spacing.sm
  }
});
