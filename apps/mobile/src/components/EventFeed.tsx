import { StyleSheet, Text, View } from "react-native";

import { palette, spacing } from "../theme";

type EventKind = "bid" | "pass" | "trump" | "trick" | "other";

interface FeedEntry {
  readonly id: string;
  readonly text: string;
}

interface EventFeedProps {
  readonly entries: readonly FeedEntry[];
  readonly isActive?: boolean;
}

function classifyEntry(text: string): EventKind {
  const lower = text.toLowerCase();
  if (lower.includes("pass")) return "pass";
  if (lower.includes("bid")) return "bid";
  if (lower.includes("trump")) return "trump";
  if (lower.includes("trick") || lower.includes("won")) return "trick";
  return "other";
}

const kindIcon: Record<EventKind, string> = {
  bid: "🎯",
  other: "•",
  pass: "🤚",
  trick: "⭐",
  trump: "🂠"
};

export function EventFeed({ entries, isActive = false }: EventFeedProps) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {isActive ? "Bots are thinking…" : "No activity yet."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.feed}>
      {entries.map((entry, index) => {
        const isLatest = index === entries.length - 1;
        const kind = classifyEntry(entry.text);

        return (
          <View key={entry.id} style={[styles.row, isLatest && styles.latestRow]}>
            <Text style={styles.icon}>{kindIcon[kind]}</Text>
            <Text style={[styles.text, isLatest && styles.latestText]}>{entry.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: spacing.xs
  },
  emptyText: {
    color: palette.subtle,
    fontSize: 14,
    fontStyle: "italic"
  },
  feed: {
    gap: spacing.xs
  },
  icon: {
    fontSize: 14,
    width: 22
  },
  latestRow: {
    borderTopColor: palette.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs
  },
  latestText: {
    color: palette.ink,
    fontWeight: "800"
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.xs
  },
  text: {
    color: palette.subtle,
    flex: 1,
    fontSize: 15,
    lineHeight: 20
  }
});
