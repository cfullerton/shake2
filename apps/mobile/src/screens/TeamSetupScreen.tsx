import type { PlayerSeat, TeamId } from "@shake2/game-engine";
import { CommonActions } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Check } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { TextField } from "../components/TextField";
import type { RootStackParamList } from "../navigation/types";
import { useGameStore } from "../state/GameStore";
import { palette, radius, spacing } from "../theme";
import { useState } from "react";

type TeamSetupScreenProps = NativeStackScreenProps<RootStackParamList, "TeamSetup">;

const defaultPlayerNames: Record<PlayerSeat, string> = {
  east: "East",
  north: "North",
  south: "South",
  west: "West"
};

const defaultTeamNames: Record<TeamId, string> = {
  eastWest: "East / West",
  northSouth: "North / South"
};

export function TeamSetupScreen({ navigation, route }: TeamSetupScreenProps) {
  const { createGame } = useGameStore();
  const [creating, setCreating] = useState(false);
  const [playerNames, setPlayerNames] = useState(defaultPlayerNames);
  const [teamNames, setTeamNames] = useState(defaultTeamNames);

  function updatePlayerName(seat: PlayerSeat, value: string) {
    setPlayerNames((current) => ({
      ...current,
      [seat]: value
    }));
  }

  function updateTeamName(teamId: TeamId, value: string) {
    setTeamNames((current) => ({
      ...current,
      [teamId]: value
    }));
  }

  async function handleCreate() {
    try {
      setCreating(true);
      const game = await createGame({
        dealer: route.params.dealer,
        name: route.params.name,
        playerNames,
        targetMarks: route.params.targetMarks,
        teamNames
      });

      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: "Home" },
            {
              name: "Scorekeeper",
              params: {
                gameId: game.id
              }
            }
          ]
        })
      );
    } catch (error) {
      Alert.alert("Could not create game", error instanceof Error ? error.message : "Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          icon={<Check color={palette.surface} size={18} />}
          loading={creating}
          onPress={handleCreate}
        >
          Create Game
        </Button>
      }
      scroll
    >
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Teams</Text>
        <TextField
          autoCapitalize="words"
          label="North / South"
          onChangeText={(value) => updateTeamName("northSouth", value)}
          value={teamNames.northSouth}
        />
        <TextField
          autoCapitalize="words"
          label="East / West"
          onChangeText={(value) => updateTeamName("eastWest", value)}
          value={teamNames.eastWest}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Players</Text>
        <View style={styles.grid}>
          <TextField
            autoCapitalize="words"
            label="North"
            onChangeText={(value) => updatePlayerName("north", value)}
            value={playerNames.north}
          />
          <TextField
            autoCapitalize="words"
            label="East"
            onChangeText={(value) => updatePlayerName("east", value)}
            value={playerNames.east}
          />
          <TextField
            autoCapitalize="words"
            label="South"
            onChangeText={(value) => updatePlayerName("south", value)}
            value={playerNames.south}
          />
          <TextField
            autoCapitalize="words"
            label="West"
            onChangeText={(value) => updatePlayerName("west", value)}
            value={playerNames.west}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.md
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
  }
});
