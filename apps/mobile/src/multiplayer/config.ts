export interface MobileMultiplayerConfig {
  readonly appSyncGraphqlUrl: string;
  readonly appSyncRealtimeUrl: string;
  readonly awsRegion: string;
  readonly cognitoUserPoolClientId: string;
  readonly cognitoUserPoolId: string;
}

export interface MobileMultiplayerEnvironment {
  readonly EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL?: string;
  readonly EXPO_PUBLIC_SHAKE2_APPSYNC_REALTIME_URL?: string;
  readonly EXPO_PUBLIC_SHAKE2_AWS_REGION?: string;
  readonly EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID?: string;
  readonly EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID?: string;
}

const REQUIRED_ENV_KEYS = [
  "EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL",
  "EXPO_PUBLIC_SHAKE2_AWS_REGION",
  "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID",
  "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID"
] as const;

export class MobileMultiplayerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileMultiplayerConfigError";
  }
}

export function readMobileMultiplayerConfig(
  env: MobileMultiplayerEnvironment = readDefaultEnvironment()
): MobileMultiplayerConfig | null {
  const hasAnyValue = [
    ...REQUIRED_ENV_KEYS,
    "EXPO_PUBLIC_SHAKE2_APPSYNC_REALTIME_URL" as const
  ].some((key) => readOptionalValue(env[key]) !== undefined);

  if (!hasAnyValue) {
    return null;
  }

  return requireMobileMultiplayerConfig(env);
}

export function requireMobileMultiplayerConfig(
  env: MobileMultiplayerEnvironment = readDefaultEnvironment()
): MobileMultiplayerConfig {
  const appSyncGraphqlUrl = requireEnvironmentValue(
    env.EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL,
    "EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL"
  );
  const appSyncRealtimeUrl = readOptionalValue(
    env.EXPO_PUBLIC_SHAKE2_APPSYNC_REALTIME_URL
  ) ?? deriveAppSyncRealtimeUrl(appSyncGraphqlUrl);

  return {
    appSyncGraphqlUrl,
    appSyncRealtimeUrl,
    awsRegion: requireEnvironmentValue(
      env.EXPO_PUBLIC_SHAKE2_AWS_REGION,
      "EXPO_PUBLIC_SHAKE2_AWS_REGION"
    ),
    cognitoUserPoolClientId: requireEnvironmentValue(
      env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID,
      "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID"
    ),
    cognitoUserPoolId: requireEnvironmentValue(
      env.EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID,
      "EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID"
    )
  };
}

export function deriveAppSyncRealtimeUrl(graphqlUrl: string): string {
  const parsed = new URL(graphqlUrl);

  parsed.protocol = "wss:";
  parsed.hostname = parsed.hostname.replace(
    ".appsync-api.",
    ".appsync-realtime-api."
  );
  parsed.pathname = "/graphql";
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString();
}

function requireEnvironmentValue(
  value: string | undefined,
  name: string
): string {
  const normalized = readOptionalValue(value);

  if (!normalized) {
    throw new MobileMultiplayerConfigError(`${name} is required.`);
  }

  return normalized;
}

function readOptionalValue(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function readDefaultEnvironment(): MobileMultiplayerEnvironment {
  if (typeof process === "undefined") {
    return {};
  }

  return process.env as MobileMultiplayerEnvironment;
}
