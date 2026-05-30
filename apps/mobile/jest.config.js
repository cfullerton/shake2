module.exports = {
  moduleNameMapper: {
    "^@shake2/game-engine$": "<rootDir>/../../packages/game-engine/src/index.ts",
    "^@shake2/shared$": "<rootDir>/../../packages/shared/src/index.ts"
  },
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage/async-storage|@react-navigation/.*|@expo(nent)?/.*|expo(nent)?|expo-.*|lucide-react-native|react-native-svg)/)"
  ]
};
