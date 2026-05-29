import { StyleSheet, Text, View } from "react-native";

import { palette, spacing } from "../theme";

interface MarkDotsProps {
  readonly marks: number;
  readonly targetMarks: number;
}

export function MarkDots({ marks, targetMarks }: MarkDotsProps) {
  const visibleDots = Array.from({ length: targetMarks }, (_, index) => index);
  const overage = Math.max(0, marks - targetMarks);

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {visibleDots.map((index) => (
          <View
            key={index}
            style={[styles.dot, index < marks ? styles.filledDot : styles.emptyDot]}
          />
        ))}
      </View>
      {overage > 0 ? <Text style={styles.overage}>+{overage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 18
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  dots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  emptyDot: {
    backgroundColor: palette.border
  },
  filledDot: {
    backgroundColor: palette.gold
  },
  overage: {
    color: palette.goldDark,
    fontSize: 13,
    fontWeight: "800"
  }
});
