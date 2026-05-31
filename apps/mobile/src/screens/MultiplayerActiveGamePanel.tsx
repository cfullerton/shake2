import { AlertCircle, RefreshCw, Send } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { GameText } from "../components/GameText";
import {
  multiplayerSeatLabels,
  useMultiplayerActiveGame,
  type MultiplayerLobbyGameClient
} from "../multiplayer";
import type {
  CognitoAuthSession,
  MultiplayerDomino,
  MultiplayerPublicGameSnapshot,
  MultiplayerRoomView
} from "../multiplayer";
import { palette, radius, spacing } from "../theme";

export function MultiplayerActiveGamePanel({
  actorId,
  client,
  initialRoom,
  initialSnapshot,
  session
}: {
  readonly actorId: string | null;
  readonly client: MultiplayerLobbyGameClient;
  readonly initialRoom: MultiplayerRoomView;
  readonly initialSnapshot: MultiplayerPublicGameSnapshot;
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

      <View style={styles.statusGrid}>
        <InfoTile label="Turn" value={view.currentTurnLabel} />
        <InfoTile label="Dealer" value={view.dealerLabel} />
        <InfoTile label="Bid" value={view.currentBidLabel} />
        <InfoTile label="State" value={view.snapshotVersionLabel} />
      </View>

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
            {view.privateHand.map((domino) => (
              <MultiplayerDominoTile
                domino={domino}
                key={domino.key}
              />
            ))}
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
        {view.canPass || view.canSubmitBid ? (
          <>
            <Text style={styles.copy}>Your bid.</Text>
            <View style={styles.bidGrid}>
              {view.legalBidAmounts.map((amount) => (
                <Button
                  disabled={!canSubmitActions}
                  key={amount}
                  loading={game.busyAction === "submitBid"}
                  onPress={() =>
                    game.submitBid({
                      amount,
                      kind: "numeric"
                    })
                  }
                  style={styles.bidButton}
                >
                  {String(amount)}
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
        ) : (
          <Text style={styles.copy}>{view.waitingMessage}</Text>
        )}
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
  label,
  value
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MultiplayerDominoTile({
  domino
}: {
  readonly domino: MultiplayerDomino;
}) {
  return (
    <View
      accessibilityLabel={`Domino ${domino.key}`}
      accessibilityRole="image"
      style={styles.dominoTile}
    >
      <DominoHalf pip={domino.high} />
      <View style={styles.dominoDivider} />
      <DominoHalf pip={domino.low} />
    </View>
  );
}

function DominoHalf({ pip }: { readonly pip: number }) {
  const filledCells = pipCellsByValue[pip] ?? [];

  return (
    <View style={styles.dominoHalf}>
      {Array.from({ length: 9 }, (_value, cell) => (
        <View key={cell} style={styles.pipCell}>
          {filledCells.includes(cell) ? <View style={styles.dominoPip} /> : null}
        </View>
      ))}
    </View>
  );
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
  dominoDivider: {
    backgroundColor: palette.ink,
    height: 1,
    opacity: 0.24,
    width: "100%"
  },
  dominoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  dominoHalf: {
    flexDirection: "row",
    flexWrap: "wrap",
    height: 34,
    width: 42
  },
  dominoPip: {
    backgroundColor: palette.ink,
    borderRadius: 4,
    height: 7,
    width: 7
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
    backgroundColor: palette.surface,
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
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
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
    height: 11,
    justifyContent: "center",
    width: 14
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
  viewerSeatCard: {
    borderColor: palette.crimson,
    borderWidth: 2
  }
});
