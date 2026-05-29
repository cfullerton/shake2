import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shake 2</Text>
      <Text style={styles.subtitle}>Texas 42 scorekeeper setup is ready.</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#F7F8F3",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  subtitle: {
    color: "#52605F",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center"
  },
  title: {
    color: "#1F2A2E",
    fontSize: 34,
    fontWeight: "800"
  }
});
