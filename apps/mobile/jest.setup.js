jest.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map();

  return {
    clear: jest.fn(async () => {
      storage.clear();
    }),
    getItem: jest.fn(async (key) => storage.get(key) ?? null),
    removeItem: jest.fn(async (key) => {
      storage.delete(key);
    }),
    setItem: jest.fn(async (key, value) => {
      storage.set(key, value);
    })
  };
});

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");

  function MockIcon({ accessibilityLabel }) {
    return React.createElement(Text, null, accessibilityLabel ?? "icon");
  }

  return new Proxy(
    {},
    {
      get: () => MockIcon
    }
  );
});
