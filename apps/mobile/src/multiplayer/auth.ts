import type { MobileMultiplayerConfig } from "./config";
import { getDefaultFetch, type FetchLike } from "./http";

export interface CognitoPasswordSignInInput {
  readonly password: string;
  readonly username: string;
}

export interface CognitoAuthSession {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly idToken: string;
  readonly refreshToken?: string;
  readonly tokenType: string;
  readonly username: string;
}

export interface AuthSessionProvider {
  getIdToken(): Promise<string>;
}

export class CognitoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognitoAuthError";
  }
}

export class StaticAuthSessionProvider implements AuthSessionProvider {
  constructor(private readonly session: Pick<CognitoAuthSession, "idToken">) {}

  async getIdToken(): Promise<string> {
    return this.session.idToken;
  }
}

export class CognitoPasswordAuthClient {
  private readonly config: Pick<
    MobileMultiplayerConfig,
    "awsRegion" | "cognitoUserPoolClientId"
  >;
  private readonly fetcher: FetchLike;

  constructor(
    config: Pick<MobileMultiplayerConfig, "awsRegion" | "cognitoUserPoolClientId">,
    fetcher: FetchLike = getDefaultFetch()
  ) {
    this.config = config;
    this.fetcher = fetcher;
  }

  async signIn(input: CognitoPasswordSignInInput): Promise<CognitoAuthSession> {
    const response = await this.fetcher(
      `https://cognito-idp.${this.config.awsRegion}.amazonaws.com/`,
      {
        body: JSON.stringify({
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: {
            PASSWORD: input.password,
            USERNAME: input.username
          },
          ClientId: this.config.cognitoUserPoolClientId
        }),
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
        },
        method: "POST"
      }
    );
    const body = await readJsonObject(response);

    if (!response.ok) {
      throw new CognitoAuthError(readCognitoErrorMessage(body, response.status));
    }

    const result = readObject(body.AuthenticationResult, "AuthenticationResult");
    const idToken = readString(result.IdToken, "IdToken");
    const accessToken = readString(result.AccessToken, "AccessToken");
    const expiresIn = readOptionalNumber(result.ExpiresIn) ?? 3600;
    const tokenType = readOptionalString(result.TokenType) ?? "Bearer";
    const refreshToken = readOptionalString(result.RefreshToken);

    return {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
      idToken,
      ...(refreshToken ? { refreshToken } : {}),
      tokenType,
      username: input.username
    };
  }
}

async function readJsonObject(response: {
  json(): Promise<unknown>;
  text(): Promise<string>;
}): Promise<Readonly<Record<string, unknown>>> {
  try {
    return readObject(await response.json(), "Cognito response");
  } catch (_error) {
    const text = await response.text();

    throw new CognitoAuthError(
      text.trim().length > 0
        ? "Cognito returned a non-JSON response."
        : "Cognito returned an empty response."
    );
  }
}

function readCognitoErrorMessage(
  body: Readonly<Record<string, unknown>>,
  status: number
): string {
  const message = readOptionalString(body.message) ??
    readOptionalString(body.__type) ??
    `Cognito sign-in failed with HTTP ${status}.`;

  return message;
}

function readObject(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CognitoAuthError(`${label} must be an object.`);
  }

  return value as Readonly<Record<string, unknown>>;
}

function readString(value: unknown, label: string): string {
  const normalized = readOptionalString(value);

  if (!normalized) {
    throw new CognitoAuthError(`${label} is required.`);
  }

  return normalized;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
