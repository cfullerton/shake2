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

test("reads default public Expo environment values", () => {
  const previousEnvironment = {
    EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL:
      process.env.EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL,
    EXPO_PUBLIC_SHAKE2_AWS_REGION:
      process.env.EXPO_PUBLIC_SHAKE2_AWS_REGION,
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID:
      process.env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID,
    EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID:
      process.env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID
  };

  try {
    process.env.EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL =
      "https://env.appsync-api.us-east-1.amazonaws.com/graphql";
    process.env.EXPO_PUBLIC_SHAKE2_AWS_REGION = "us-east-1";
    process.env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID =
      "env-client-id";
    process.env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID = "us-east-1_env";

    expect(readMobileMultiplayerConfig()).toMatchObject({
      appSyncGraphqlUrl:
        "https://env.appsync-api.us-east-1.amazonaws.com/graphql",
      awsRegion: "us-east-1",
      cognitoUserPoolClientId: "env-client-id",
      cognitoUserPoolId: "us-east-1_env"
    });
  } finally {
    restoreEnvValue(
      "EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL",
      previousEnvironment.EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL
    );
    restoreEnvValue(
      "EXPO_PUBLIC_SHAKE2_AWS_REGION",
      previousEnvironment.EXPO_PUBLIC_SHAKE2_AWS_REGION
    );
    restoreEnvValue(
      "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID",
      previousEnvironment.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID
    );
    restoreEnvValue(
      "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID",
      previousEnvironment.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID
    );
  }
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

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
