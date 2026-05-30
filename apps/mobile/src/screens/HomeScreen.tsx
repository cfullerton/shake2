import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SEAT_LABELS } from "@shake2/game-engine";
import { Bot, Plus, Trophy } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { MarkDots } from "../components/MarkDots";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { useGameStore } from "../state/GameStore";
import { palette, radius, spacing } from "../theme";

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { error, games, loading } = useGameStore();
  const sortedGames = [...games].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Trophy color={palette.surface} size={28} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Texas 42 Saloon</Text>
          <Text style={styles.subtitle}>Score the table or practice against bots.</Text>
        </View>
      </View>

      <Button
        icon={<Plus color={palette.surface} size={19} />}
        onPress={() => navigation.navigate("NewGame")}
      >
        Score Real World Game
      </Button>
      <Button
        icon={<Bot color={palette.teal} size={19} />}
        onPress={() => navigation.navigate("LocalGameStart")}
        variant="secondary"
      >
        Practice vs Bots
      </Button>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.teal} />
          <Text style={styles.loadingText}>Loading saved games</Text>
        </View>
      ) : sortedGames.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No games yet</Text>
          <Text style={styles.emptyCopy}>Create a scorekeeper game when the table is ready.</Text>
        </View>
      ) : (
        <View style={styles.games}>
          <Text style={styles.sectionTitle}>Saved Games</Text>
          {sortedGames.map((game) => {
            const dealer = game.players[game.dealer];

            return (
              <Pressable
                key={game.id}
                onPress={() => navigation.navigate("Scorekeeper", { gameId: game.id })}
                style={({ pressed }) => [styles.gameCard, pressed && styles.pressedCard]}
              >
                <View style={styles.gameHeader}>
                  <View style={styles.gameTitleGroup}>
                    <Text numberOfLines={1} style={styles.gameTitle}>
                      {game.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.gameMeta}>
                      Hand {game.handNumber} · Dealer {dealer.name} ({SEAT_LABELS[game.dealer]}) ·
                      Updated {formatDate(game.updatedAt)}
                    </Text>
                  </View>
                  <Text style={[styles.status, game.status === "complete" && styles.complete]}>
                    {game.status === "complete" ? "Complete" : "Active"}
                  </Text>
                </View>

                <View style={styles.scoreRows}>
                  {Object.values(game.teams).map((team) => (
                    <View key={team.id} style={styles.scoreRow}>
                      <View style={styles.teamCopy}>
                        <Text numberOfLines={1} style={styles.teamName}>
                          {team.name}
                        </Text>
                        <Text style={styles.marksText}>
                          {team.marks}/{game.targetMarks}
                        </Text>
                      </View>
                      <MarkDots marks={team.marks} targetMarks={game.targetMarks} />
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  brandMark: {
    alignItems: "center",
    backgroundColor: palette.teal,
    borderColor: palette.gold,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  complete: {
    backgroundColor: palette.goldSoft,
    color: palette.goldDark
  },
  emptyCopy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800"
  },
  error: {
    color: palette.red,
    fontSize: 14,
    fontWeight: "700"
  },
  gameCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  gameHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  gameMeta: {
    color: palette.subtle,
    fontSize: 13,
    fontWeight: "700"
  },
  gameTitle: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "800"
  },
  gameTitleGroup: {
    flex: 1,
    gap: 3
  },
  games: {
    gap: spacing.md
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    gap: spacing.xs
  },
  loading: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl
  },
  loadingText: {
    color: palette.paperMuted,
    fontSize: 15,
    fontWeight: "700"
  },
  marksText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  pressedCard: {
    opacity: 0.82
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  scoreRows: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: palette.paperMuted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  status: {
    backgroundColor: palette.tealSoft,
    borderRadius: radius.sm,
    color: palette.teal,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  subtitle: {
    color: palette.paperMuted,
    fontSize: 15,
    lineHeight: 20
  },
  teamCopy: {
    flex: 1,
    gap: 2
  },
  teamName: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  title: {
    color: palette.paper,
    fontSize: 28,
    fontWeight: "900"
  }
});
