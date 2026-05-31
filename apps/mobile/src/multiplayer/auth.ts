import type { MobileMultiplayerConfig } from "./config";
import { getDefaultFetch, type FetchLike } from "./http";

export interface CognitoPasswordSignInInput {
  readonly password: string;
  readonly username: string;
}

export interface CognitoCompleteNewPasswordInput {
  readonly newPassword: string;
  readonly session: string;
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

export interface CognitoNewPasswordChallenge {
  readonly challengeName: "NEW_PASSWORD_REQUIRED";
  readonly session: string;
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

export class CognitoNewPasswordRequiredError extends CognitoAuthError {
  readonly challenge: CognitoNewPasswordChallenge;

  constructor(challenge: CognitoNewPasswordChallenge) {
    super(readCognitoChallengeMessage(challenge.challengeName));
    this.name = "CognitoNewPasswordRequiredError";
    this.challenge = challenge;
    Object.setPrototypeOf(this, CognitoNewPasswordRequiredError.prototype);
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
    const body = await this.requestCognito(
      "AWSCognitoIdentityProviderService.InitiateAuth",
      {
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          PASSWORD: input.password,
          USERNAME: input.username
        },
        ClientId: this.config.cognitoUserPoolClientId
      }
    );
    const result = readAuthenticationResult(body, input.username);

    return toAuthSession(result, input.username);
  }

  async completeNewPassword(
    input: CognitoCompleteNewPasswordInput
  ): Promise<CognitoAuthSession> {
    const body = await this.requestCognito(
      "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
      {
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        ChallengeResponses: {
          NEW_PASSWORD: input.newPassword,
          USERNAME: input.username
        },
        ClientId: this.config.cognitoUserPoolClientId,
        Session: input.session
      }
    );
    const result = readAuthenticationResult(body, input.username);

    return toAuthSession(result, input.username);
  }

  private async requestCognito(
    target: string,
    body: Readonly<Record<string, unknown>>
  ): Promise<Readonly<Record<string, unknown>>> {
    const response = await this.fetcher(this.endpoint, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": target
      },
      method: "POST"
    });
    const responseBody = await readJsonObject(response);

    if (!response.ok) {
      throw new CognitoAuthError(
        readCognitoErrorMessage(responseBody, response.status)
      );
    }

    return responseBody;
  }

  private get endpoint(): string {
    return `https://cognito-idp.${this.config.awsRegion}.amazonaws.com/`;
  }
}

function readAuthenticationResult(
  body: Readonly<Record<string, unknown>>,
  username: string
): Readonly<Record<string, unknown>> {
  if (isRecord(body.AuthenticationResult)) {
    return body.AuthenticationResult;
  }

  const challengeName = readOptionalString(body.ChallengeName);

  if (challengeName) {
    if (challengeName === "NEW_PASSWORD_REQUIRED") {
      const session = readString(body.Session, "Session");

      throw new CognitoNewPasswordRequiredError({
        challengeName,
        session,
        username: readChallengeUsername(body, username)
      });
    }

    throw new CognitoAuthError(readCognitoChallengeMessage(challengeName));
  }

  throw new CognitoAuthError("Cognito sign-in did not return tokens.");
}

function toAuthSession(
  result: Readonly<Record<string, unknown>>,
  username: string
): CognitoAuthSession {
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
    username
  };
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

function readCognitoChallengeMessage(challengeName: string): string {
  if (challengeName === "NEW_PASSWORD_REQUIRED") {
    return "Sign-in requires NEW_PASSWORD_REQUIRED. Set a permanent password to continue.";
  }

  return `Sign-in requires unsupported Cognito challenge ${challengeName}.`;
}

function readChallengeUsername(
  body: Readonly<Record<string, unknown>>,
  fallbackUsername: string
): string {
  const challengeParameters = body.ChallengeParameters;

  if (isRecord(challengeParameters)) {
    return readOptionalString(challengeParameters.USER_ID_FOR_SRP) ??
      readOptionalString(challengeParameters.USERNAME) ??
      fallbackUsername;
  }

  return fallbackUsername;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
