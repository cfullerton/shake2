import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Play } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import type { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing } from "../theme";

type LearnGameScreenProps = NativeStackScreenProps<RootStackParamList, "LearnGame">;

const handSteps = [
  "Everyone gets 7 dominoes from a double-six set.",
  "Players bid on how many hand points their team can capture.",
  "The highest bidder names trump.",
  "Players take 7 tricks. You must follow the led suit if you can.",
  "After the hand, the bid is made or set and one mark is awarded."
] as const;

const countDominoes = [
  { label: "0-5", points: "5" },
  { label: "1-4", points: "5" },
  { label: "2-3", points: "5" },
  { label: "5-5", points: "10" },
  { label: "6-4", points: "10" }
] as const;

export function LearnGameScreen({ navigation }: LearnGameScreenProps) {
  return (
    <Screen
      footer={
        <Button
          accessibilityLabel="Start a practice game"
          icon={<Play color={palette.surface} size={18} />}
          onPress={() => navigation.navigate("LocalGameStart")}
        >
          Start Practice
        </Button>
      }
      scroll
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>New to the table?</Text>
        <Text style={styles.title}>Texas 42 in plain English</Text>
        <Text style={styles.subtitle}>
          It is a partner trick-taking game played with dominoes. Win tricks,
          catch count dominoes, and make your bid.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>The big idea</Text>
        <Text style={styles.copy}>
          Four players sit around the table. North partners with South, and East
          partners with West. Each hand is worth 42 points. Your team wants to
          win enough points to make its bid, or stop the other team from making theirs.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>How a hand flows</Text>
        <View style={styles.stepList}>
          {handSteps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Where the 42 points come from</Text>
        <Text style={styles.copy}>
          Every trick is worth 1 point, so 7 tricks create 7 points. Five special
          dominoes add 35 more points.
        </Text>
        <View style={styles.countGrid}>
          {countDominoes.map((domino) => (
            <View key={domino.label} style={styles.countTile}>
              <Text style={styles.countDomino}>{domino.label}</Text>
              <Text style={styles.countPoints}>{domino.points} pts</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Bidding and trump</Text>
        <Text style={styles.copy}>
          A bid is a promise: "my team can win at least this many points." In the
          standard game here, bids run from 30 to 42. The highest bidder becomes
          declarer and chooses the trump suit. Trump dominoes beat non-trump dominoes.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Playing tricks</Text>
        <Text style={styles.copy}>
          The leader plays one domino. That sets the led suit. If you have that
          suit, you must follow it. If you cannot follow, you may play anything.
          The highest trump wins; if no trump is played, the highest domino in
          the led suit wins.
        </Text>
      </View>

      <View style={styles.tipPanel}>
        <Text style={styles.tipTitle}>Beginner tip</Text>
        <Text style={styles.tipCopy}>
          In practice mode, highlighted dominoes are legal plays. Faded dominoes
          cannot be played right now, usually because you have to follow suit.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 23
  },
  countDomino: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  countGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  countPoints: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  countTile: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 2,
    minWidth: 86,
    padding: spacing.sm
  },
  eyebrow: {
    color: palette.goldSoft,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  header: {
    gap: spacing.xs
  },
  panel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  stepList: {
    gap: spacing.sm
  },
  stepNumber: {
    backgroundColor: palette.teal,
    borderRadius: radius.sm,
    color: palette.surface,
    fontSize: 14,
    fontWeight: "900",
    minWidth: 28,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    textAlign: "center"
  },
  stepRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  stepText: {
    color: palette.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23
  },
  subtitle: {
    color: palette.paperMuted,
    fontSize: 16,
    lineHeight: 23
  },
  tipCopy: {
    color: palette.goldDark,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22
  },
  tipPanel: {
    backgroundColor: palette.goldSoft,
    borderColor: palette.gold,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  tipTitle: {
    color: palette.goldDark,
    fontSize: 18,
    fontWeight: "900"
  },
  title: {
    color: palette.paper,
    fontSize: 30,
    fontWeight: "900"
  }
});
