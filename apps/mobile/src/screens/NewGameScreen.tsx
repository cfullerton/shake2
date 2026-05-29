import type { PlayerSeat } from "@shake2/game-engine";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowRight } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { SegmentedControl, type Segment } from "../components/SegmentedControl";
import { TextField } from "../components/TextField";
import type { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing } from "../theme";
import { useState } from "react";

type NewGameScreenProps = NativeStackScreenProps<RootStackParamList, "NewGame">;

const dealerSegments: readonly Segment<PlayerSeat>[] = [
  { label: "North", value: "north" },
  { label: "East", value: "east" },
  { label: "South", value: "south" },
  { label: "West", value: "west" }
];

export function NewGameScreen({ navigation }: NewGameScreenProps) {
  const [dealer, setDealer] = useState<PlayerSeat>("north");
  const [name, setName] = useState("Friday Night 42");
  const [targetMarks, setTargetMarks] = useState("7");

  function handleNext() {
    const parsedTarget = Number.parseInt(targetMarks, 10);

    if (!Number.isInteger(parsedTarget) || parsedTarget <= 0) {
      Alert.alert("Check target marks", "Target marks must be a positive whole number.");
      return;
    }

    navigation.navigate("TeamSetup", {
      dealer,
      name: name.trim() || "Texas 42",
      targetMarks: parsedTarget
    });
  }

  return (
    <Screen
      footer={
        <Button
          icon={<ArrowRight color={palette.surface} size={18} />}
          onPress={handleNext}
        >
          Continue
        </Button>
      }
      scroll
    >
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Game</Text>
        <TextField
          autoCapitalize="words"
          label="Name"
          onChangeText={setName}
          returnKeyType="next"
          value={name}
        />
        <TextField
          keyboardType="number-pad"
          label="Target Marks"
          onChangeText={setTargetMarks}
          value={targetMarks}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Opening Dealer</Text>
        <SegmentedControl
          onChange={setDealer}
          segments={dealerSegments}
          value={dealer}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  }
});
