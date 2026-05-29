import type { TeamId } from "@shake2/game-engine";
import { SEAT_LABELS, getScoreSummary, getWinningTeamId } from "@shake2/game-engine";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ListChecks, Minus, Plus, RotateCcw } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { MarkDots } from "../components/MarkDots";
import { Screen } from "../components/Screen";
import { SegmentedControl, type Segment } from "../components/SegmentedControl";
import { TextField } from "../components/TextField";
import type { RootStackParamList } from "../navigation/types";
import { useGameStore } from "../state/GameStore";
import { palette, radius, spacing } from "../theme";
import { useMemo, useState } from "react";

type ScorekeeperScreenProps = NativeStackScreenProps<RootStackParamList, "Scorekeeper">;

const teamSegments: readonly Segment<TeamId>[] = [
  { label: "North / South", value: "northSouth" },
  { label: "East / West", value: "eastWest" }
];

export function ScorekeeperScreen({ navigation, route }: ScorekeeperScreenProps) {
  const { awardMarks, findGame, undoLastScore } = useGameStore();
  const game = findGame(route.params.gameId);
  const [marks, setMarks] = useState(1);
  const [note, setNote] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>("northSouth");

  const winningTeamId = game ? getWinningTeamId(game) : null;
  const scoreSummary = useMemo(() => (game ? getScoreSummary(game) : null), [game]);

  if (!game) {
    return (
      <Screen>
        <Text style={styles.emptyTitle}>Game not found</Text>
        <Text style={styles.emptyCopy}>This saved game is no longer available.</Text>
      </Screen>
    );
  }

  const activeGame = game;
  const dealer = activeGame.players[activeGame.dealer];
  const selectedTeam = activeGame.teams[selectedTeamId];
  const winningTeam = winningTeamId ? activeGame.teams[winningTeamId] : null;

  function increaseMarks() {
    setMarks((current) => Math.min(activeGame.targetMarks, current + 1));
  }

  function decreaseMarks() {
    setMarks((current) => Math.max(1, current - 1));
  }

  async function handleAward() {
    try {
      await awardMarks(activeGame.id, selectedTeamId, marks, note);
      setNote("");
      setMarks(1);
    } catch (error) {
      Alert.alert("Could not award marks", error instanceof Error ? error.message : "Try again.");
    }
  }

  async function handleUndo() {
    try {
      await undoLastScore(activeGame.id);
    } catch (error) {
      Alert.alert("Undo failed", error instanceof Error ? error.message : "Try again.");
    }
  }

  return (
    <Screen
      footer={
        <View style={styles.footerActions}>
          <Button
            disabled={activeGame.history.length === 0}
            icon={<RotateCcw color={palette.teal} size={18} />}
            onPress={handleUndo}
            style={styles.footerButton}
            variant="secondary"
          >
            Undo
          </Button>
          <Button
            icon={<ListChecks color={palette.teal} size={18} />}
            onPress={() => navigation.navigate("History", { gameId: activeGame.id })}
            style={styles.footerButton}
            variant="secondary"
          >
            History
          </Button>
        </View>
      }
      scroll
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.title}>
            {activeGame.name}
          </Text>
          <Text style={styles.subtitle}>
            Hand {activeGame.handNumber} · First to {activeGame.targetMarks} marks
          </Text>
        </View>
        <Text style={[styles.status, activeGame.status === "complete" && styles.completeStatus]}>
          {activeGame.status === "complete" ? "Complete" : "Active"}
        </Text>
      </View>

      <View style={styles.dealerPanel}>
        <View>
          <Text style={styles.dealerLabel}>Dealer</Text>
          <Text numberOfLines={1} style={styles.dealerName}>
            {dealer.name}
          </Text>
        </View>
        <Text style={styles.dealerSeat}>{SEAT_LABELS[activeGame.dealer]}</Text>
      </View>

      {winningTeam ? (
        <View style={styles.winnerBanner}>
          <Text style={styles.winnerTitle}>{winningTeam.name} wins</Text>
          <Text style={styles.winnerCopy}>Undo the latest hand to reopen scoring.</Text>
        </View>
      ) : null}

      <View style={styles.scoreboard}>
        {Object.values(activeGame.teams).map((team) => {
          const isLeader = scoreSummary?.leaderTeamId === team.id;
          const hasDealer = team.playerSeats.includes(activeGame.dealer);

          return (
            <Pressable
              key={team.id}
              onPress={() => setSelectedTeamId(team.id)}
              style={[
                styles.teamCard,
                selectedTeamId === team.id && styles.selectedTeamCard
              ]}
            >
              <View style={styles.teamHeader}>
                <View style={styles.teamNames}>
                  <Text numberOfLines={1} style={styles.teamName}>
                    {team.name}
                  </Text>
                  <Text style={styles.players}>
                    {team.playerSeats.map((seat) => activeGame.players[seat].name).join(" / ")}
                  </Text>
                </View>
                <View style={styles.pills}>
                  {hasDealer ? <Text style={styles.dealerPill}>Dealer</Text> : null}
                  {isLeader ? <Text style={styles.leaderPill}>Leader</Text> : null}
                </View>
              </View>
              <Text style={styles.scoreNumber}>{team.marks}</Text>
              <MarkDots marks={team.marks} targetMarks={activeGame.targetMarks} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.entryPanel}>
        <Text style={styles.panelTitle}>Award Marks</Text>
        <SegmentedControl
          label="Team"
          onChange={setSelectedTeamId}
          segments={teamSegments}
          value={selectedTeamId}
        />

        <View style={styles.markStepper}>
          <Text style={styles.stepperLabel}>Marks</Text>
          <View style={styles.stepperControls}>
            <Pressable accessibilityRole="button" onPress={decreaseMarks} style={styles.iconButton}>
              <Minus color={palette.ink} size={20} />
            </Pressable>
            <Text style={styles.markValue}>{marks}</Text>
            <Pressable accessibilityRole="button" onPress={increaseMarks} style={styles.iconButton}>
              <Plus color={palette.ink} size={20} />
            </Pressable>
          </View>
        </View>

        <TextField
          label="Note"
          onChangeText={setNote}
          placeholder="Optional hand note"
          value={note}
        />

        <Button
          disabled={activeGame.status === "complete"}
          icon={<Plus color={palette.surface} size={18} />}
          onPress={handleAward}
        >
          {`Add to ${selectedTeam.name}`}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  completeStatus: {
    backgroundColor: palette.goldSoft,
    color: palette.goldDark
  },
  dealerLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  dealerName: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2
  },
  dealerPanel: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md
  },
  dealerPill: {
    backgroundColor: palette.goldSoft,
    borderRadius: radius.sm,
    color: palette.goldDark,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  dealerSeat: {
    backgroundColor: palette.ink,
    borderRadius: radius.sm,
    color: palette.surface,
    fontSize: 13,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  emptyCopy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  entryPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  footerActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  footerButton: {
    flex: 1
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  leaderPill: {
    backgroundColor: palette.tealSoft,
    borderRadius: radius.sm,
    color: palette.teal,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  markStepper: {
    gap: spacing.xs
  },
  markValue: {
    color: palette.ink,
    fontSize: 26,
    fontWeight: "900",
    minWidth: 48,
    textAlign: "center"
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  pills: {
    alignItems: "flex-end",
    gap: spacing.xs
  },
  players: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  scoreNumber: {
    color: palette.ink,
    fontSize: 48,
    fontWeight: "900"
  },
  scoreboard: {
    gap: spacing.md
  },
  selectedTeamCard: {
    borderColor: palette.teal,
    borderWidth: 2
  },
  status: {
    backgroundColor: palette.tealSoft,
    borderRadius: radius.sm,
    color: palette.teal,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  stepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  stepperLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  subtitle: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: "700"
  },
  teamCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  teamHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  teamName: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "900"
  },
  teamNames: {
    flex: 1,
    gap: 3
  },
  title: {
    color: palette.ink,
    fontSize: 27,
    fontWeight: "900"
  },
  winnerBanner: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  winnerCopy: {
    color: palette.goldDark,
    fontSize: 14,
    fontWeight: "700"
  },
  winnerTitle: {
    color: palette.goldDark,
    fontSize: 18,
    fontWeight: "900"
  }
});
