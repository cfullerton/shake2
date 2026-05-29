import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { NewGameScreen } from "../screens/NewGameScreen";
import { ScorekeeperScreen } from "../screens/ScorekeeperScreen";
import { TeamSetupScreen } from "../screens/TeamSetupScreen";
import { palette } from "../theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: {
          backgroundColor: palette.background
        },
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: palette.background
        },
        headerTintColor: palette.ink,
        headerTitleStyle: {
          fontWeight: "800"
        }
      }}
    >
      <Stack.Screen
        component={HomeScreen}
        name="Home"
        options={{ title: "Shake 2" }}
      />
      <Stack.Screen
        component={NewGameScreen}
        name="NewGame"
        options={{ title: "New Game" }}
      />
      <Stack.Screen
        component={TeamSetupScreen}
        name="TeamSetup"
        options={{ title: "Team Setup" }}
      />
      <Stack.Screen
        component={ScorekeeperScreen}
        name="Scorekeeper"
        options={{ title: "Scorekeeper" }}
      />
      <Stack.Screen
        component={HistoryScreen}
        name="History"
        options={{ title: "History" }}
      />
    </Stack.Navigator>
  );
}
