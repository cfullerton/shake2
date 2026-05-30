import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SEAT_LABELS } from "@shake2/game-engine";
import { BookOpen, Bot, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { GameText } from "../components/GameText";
import { MarkDots } from "../components/MarkDots";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { useGameStore } from "../state/GameStore";
import { letterSpacing, palette, radius, spacing } from "../theme";

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { error, games, loading } = useGameStore();
  const sortedGames = [...games].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );

  return (
    <Screen scroll>
      <View style={styles.hero}>
        <GameText style={styles.heroTitle}>Texas 42 Saloon</GameText>
        <View style={styles.heroRule}>
          <View style={styles.ruleLine} />
          <View style={styles.ruleDiamond} />
          <View style={styles.ruleLine} />
        </View>
        <Text style={styles.heroTagline}>Keep score at the table or saddle up against the bots.</Text>
      </View>

      <Button
        icon={<Plus color={palette.surface} size={19} />}
        onPress={() => navigation.navigate("NewGame")}
      >
        Score the Table
      </Button>
      <Button
        icon={<Bot color={palette.denim} size={19} />}
        onPress={() => navigation.navigate("LocalGameStart")}
        variant="secondary"
      >
        Practice with Bots
      </Button>
      <Button
        icon={<BookOpen color={palette.crimson} size={19} />}
        onPress={() => navigation.navigate("LearnGame")}
        variant="secondary"
      >
        How to Play
      </Button>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.crimson} />
          <Text style={styles.loadingText}>Shufflin' the books…</Text>
        </View>
      ) : sortedGames.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No games yet</Text>
          <Text style={styles.emptyCopy}>Start a game when the table is ready.</Text>
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
                <View style={styles.gameCardAccent} />
                <View style={styles.gameCardInner}>
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
                        </View>
                        <GameText variant="score" style={styles.cardMarkCount}>
                          {String(team.marks)}
                        </GameText>
                        <MarkDots marks={team.marks} targetMarks={game.targetMarks} />
                      </View>
                    ))}
                  </View>
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
  cardMarkCount: {
    color: palette.crimson,
    fontSize: 26,
    minWidth: 32,
    textAlign: "right"
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
  errorBanner: {
    backgroundColor: palette.crimsonSoft,
    borderColor: palette.crimson,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.md
  },
  gameCard: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden"
  },
  gameCardAccent: {
    backgroundColor: palette.gold,
    width: 3
  },
  gameCardInner: {
    flex: 1,
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
  hero: {
    alignItems: "center",
    backgroundColor: palette.wood,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  heroRule: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    width: "80%"
  },
  heroTagline: {
    color: palette.paperMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  heroTitle: {
    color: palette.gold,
    fontSize: 30,
    letterSpacing: 2,
    textAlign: "center"
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
  pressedCard: {
    opacity: 0.82
  },
  ruleDiamond: {
    backgroundColor: palette.border,
    height: 6,
    transform: [{ rotate: "45deg" }],
    width: 6
  },
  ruleLine: {
    backgroundColor: palette.border,
    flex: 1,
    height: StyleSheet.hairlineWidth
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  scoreRows: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: palette.paperMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase"
  },
  status: {
    backgroundColor: palette.crimsonSoft,
    borderRadius: radius.sm,
    color: palette.crimson,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  teamCopy: {
    flex: 1,
    gap: 2
  },
  teamName: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800"
  }
});
