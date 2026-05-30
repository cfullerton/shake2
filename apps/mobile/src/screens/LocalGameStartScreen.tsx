import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Play } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";
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
  const [targetMarks, setTargetMarks] = useState("7");

  function handleStart() {
    const parsedTarget = Number.parseInt(targetMarks, 10);

    if (!Number.isInteger(parsedTarget) || parsedTarget <= 0) {
      Alert.alert("Check target marks", "Target marks must be a positive whole number.");
      return;
    }

    navigation.navigate("LocalGame", {
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
  title: {
    color: palette.ink,
    fontSize: 28,
    fontWeight: "900"
  }
});
