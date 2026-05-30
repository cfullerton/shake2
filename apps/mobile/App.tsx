import { NavigationContainer } from "@react-navigation/native";
import {
  Cinzel_400Regular,
  Cinzel_700Bold,
  useFonts
} from "@expo-google-fonts/cinzel";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";

import { AppNavigator } from "./src/navigation/AppNavigator";
import { GameProvider } from "./src/state/GameStore";
import { palette } from "./src/theme";

export default function App() {
  const [fontsLoaded] = useFonts({ Cinzel_400Regular, Cinzel_700Bold });

  if (!fontsLoaded) {
    return <View style={{ backgroundColor: palette.background, flex: 1 }} />;
  }

  return (
    <SafeAreaProvider>
      <GameProvider>
        <NavigationContainer>
          <AppNavigator />
          <StatusBar style="dark" />
        </NavigationContainer>
      </GameProvider>
    </SafeAreaProvider>
  );
}
