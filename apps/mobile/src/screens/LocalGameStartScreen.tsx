import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Play } from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useState } from "react";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import type { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing } from "../theme";

type LocalGameStartScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "LocalGameStart"
>;

export function LocalGameStartScreen({ navigation }: LocalGameStartScreenProps) {
  const [noTrump, setNoTrump] = useState(false);
  const [speedUpWhenDecided, setSpeedUpWhenDecided] = useState(false);
  const [targetMarks, setTargetMarks] = useState("7");

  function handleStart() {
    const parsedTarget = Number.parseInt(targetMarks, 10);

    if (!Number.isInteger(parsedTarget) || parsedTarget <= 0) {
      Alert.alert("Check target marks", "Target marks must be a positive whole number.");
      return;
    }

    navigation.navigate("LocalGame", {
      noTrump,
      speedUpWhenDecided,
      targetMarks: parsedTarget
    });
  }

  return (
    <Screen
      footer={
        <Button
          icon={<Play color={palette.surface} size={18} />}
          onPress={handleStart}
        >
          Deal 'Em Up
        </Button>
      }
      scroll
    >
      <View style={styles.panel}>
        <Text style={styles.title}>Practice Texas 42</Text>
        <Text style={styles.copy}>
          You play North. Three bot opponents handle their own bids, trump calls,
          and trick plays. Full Texas 42 rules apply.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Setup</Text>
        <TextField
          keyboardType="number-pad"
          label="Target Marks"
          onChangeText={setTargetMarks}
          value={targetMarks}
        />
        <Pressable
          accessibilityLabel="Speed up play when outcome is decided"
          accessibilityRole="switch"
          accessibilityState={{ checked: speedUpWhenDecided }}
          onPress={() => setSpeedUpWhenDecided((current) => !current)}
          style={styles.optionRow}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionLabel}>Speed up play when outcome is decided</Text>
            <Text style={styles.optionMeta}>Auto-end decided hands</Text>
          </View>
          <Switch
            onValueChange={setSpeedUpWhenDecided}
            thumbColor={speedUpWhenDecided ? palette.goldSoft : palette.paper}
            trackColor={{
              false: palette.paperMuted,
              true: palette.crimson
            }}
            value={speedUpWhenDecided}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="No Trump"
          accessibilityRole="switch"
          accessibilityState={{ checked: noTrump }}
          onPress={() => setNoTrump((current) => !current)}
          style={styles.optionRow}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionLabel}>No Trump</Text>
            <Text style={styles.optionMeta}>Contract variant</Text>
          </View>
          <Switch
            onValueChange={setNoTrump}
            thumbColor={noTrump ? palette.goldSoft : palette.paper}
            trackColor={{
              false: palette.paperMuted,
              true: palette.crimson
            }}
            value={noTrump}
          />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22
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
    fontSize: 18,
    fontWeight: "900"
  },
  optionLabel: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  optionMeta: {
    color: palette.subtle,
    fontSize: 13,
    lineHeight: 18
  },
  optionRow: {
    alignItems: "center",
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  optionText: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: "900"
  }
});
