import {
  MobileMultiplayerConfigError,
  deriveAppSyncRealtimeUrl,
  readMobileMultiplayerConfig,
  requireMobileMultiplayerConfig
} from "../config";

test("returns null when multiplayer environment is not configured", () => {
  expect(readMobileMultiplayerConfig({})).toBeNull();
});

test("parses public Expo multiplayer environment values", () => {
  const config = requireMobileMultiplayerConfig({
    EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL:
      "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
    EXPO_PUBLIC_SHAKE2_AWS_REGION: "us-east-1",
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID: "client-id",
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID: "pool-id"
  });

  expect(config).toEqual({
    appSyncGraphqlUrl:
      "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
    appSyncRealtimeUrl:
      "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql",
    awsRegion: "us-east-1",
    cognitoUserPoolClientId: "client-id",
    cognitoUserPoolId: "pool-id"
  });
});

test("accepts an explicit AppSync realtime URL override", () => {
  const config = requireMobileMultiplayerConfig({
    EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL:
      "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
    EXPO_PUBLIC_SHAKE2_APPSYNC_REALTIME_URL: "wss://custom/graphql",
    EXPO_PUBLIC_SHAKE2_AWS_REGION: "us-east-1",
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID: "client-id",
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID: "pool-id"
  });

  expect(config.appSyncRealtimeUrl).toBe("wss://custom/graphql");
});

test("rejects partially configured multiplayer environment", () => {
  expect(() =>
    readMobileMultiplayerConfig({
      EXPO_PUBLIC_SHAKE2_AWS_REGION: "us-east-1"
    })
  ).toThrow(MobileMultiplayerConfigError);
});

test("derives AppSync realtime URL from GraphQL URL", () => {
  expect(
    deriveAppSyncRealtimeUrl(
      "https://abc.appsync-api.us-west-2.amazonaws.com/graphql?unused=true"
    )
  ).toBe("wss://abc.appsync-realtime-api.us-west-2.amazonaws.com/graphql");
});
