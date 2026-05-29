import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RotateCcw } from "lucide-react-native";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { useGameStore } from "../state/GameStore";
import { palette, radius, spacing } from "../theme";

type HistoryScreenProps = NativeStackScreenProps<RootStackParamList, "History">;

export function HistoryScreen({ route }: HistoryScreenProps) {
  const { findGame, undoLastScore } = useGameStore();
  const game = findGame(route.params.gameId);

  if (!game) {
    return (
      <Screen>
        <Text style={styles.emptyTitle}>Game not found</Text>
        <Text style={styles.emptyCopy}>This saved game is no longer available.</Text>
      </Screen>
    );
  }

  const activeGame = game;
  const entries = [...activeGame.history].reverse();

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
        <Button
          disabled={activeGame.history.length === 0}
          icon={<RotateCcw color={palette.surface} size={18} />}
          onPress={handleUndo}
        >
          Undo Latest
        </Button>
      }
    >
      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No hands scored yet</Text>
          <Text style={styles.emptyCopy}>Award marks from the scorekeeper screen.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={entries}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => {
            const team = activeGame.teams[item.teamId];

            return (
              <View style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.hand}>Hand {item.handNumber}</Text>
                  <Text style={styles.time}>{formatTimestamp(item.createdAt)}</Text>
                </View>
                <Text style={styles.team}>{team.name}</Text>
                <Text style={styles.detail}>
                  {item.marks} {item.marks === 1 ? "mark" : "marks"}
                </Text>
                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  detail: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  emptyCopy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center"
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center"
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  entry: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  entryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  hand: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.lg
  },
  note: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20
  },
  team: {
    color: palette.teal,
    fontSize: 15,
    fontWeight: "800"
  },
  time: {
    color: palette.subtle,
    fontSize: 13,
    fontWeight: "700"
  }
});
