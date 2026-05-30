import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette, radius, spacing } from "../theme";

export interface Segment<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
}

interface SegmentedControlProps<TValue extends string> {
  readonly label?: string;
  readonly onChange: (value: TValue) => void;
  readonly segments: readonly Segment<TValue>[];
  readonly value: TValue;
}

export function SegmentedControl<TValue extends string>({
  label,
  onChange,
  segments,
  value
}: SegmentedControlProps<TValue>) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.track}>
        {segments.map((segment) => {
          const selected = segment.value === value;

          return (
            <Pressable
              accessibilityRole="button"
              key={segment.value}
              onPress={() => onChange(segment.value)}
              style={[styles.segment, selected && styles.selectedSegment]}
            >
              <Text style={[styles.segmentLabel, selected && styles.selectedLabel]}>
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs
  },
  label: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  segmentLabel: {
    color: palette.muted,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  },
  selectedLabel: {
    color: palette.surface
  },
  selectedSegment: {
    backgroundColor: palette.teal
  },
  track: {
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  }
});
