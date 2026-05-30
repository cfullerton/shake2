import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LearnGameScreen } from "../screens/LearnGameScreen";
import { LocalGameScreen } from "../screens/LocalGameScreen";
import { LocalGameStartScreen } from "../screens/LocalGameStartScreen";
import { NewGameScreen } from "../screens/NewGameScreen";
import { ScorekeeperScreen } from "../screens/ScorekeeperScreen";
import { TeamSetupScreen } from "../screens/TeamSetupScreen";
import { fonts, palette } from "../theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: {
          backgroundColor: palette.background
        },
        headerBackTitle: "",
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: palette.wood
        },
        headerTintColor: palette.paper,
        headerTitleStyle: {
          fontFamily: fonts.display,
          fontSize: 17
        }
      }}
    >
      <Stack.Screen
        component={HomeScreen}
        name="Home"
        options={{ headerTransparent: true, title: "Shake 2" }}
      />
      <Stack.Screen
        component={LocalGameStartScreen}
        name="LocalGameStart"
        options={{ title: "Local Game" }}
      />
      <Stack.Screen
        component={LearnGameScreen}
        name="LearnGame"
        options={{ title: "How to Play" }}
      />
      <Stack.Screen
        component={LocalGameScreen}
        name="LocalGame"
        options={{ title: "Practice Game" }}
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
