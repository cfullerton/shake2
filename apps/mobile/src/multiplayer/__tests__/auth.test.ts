import {
  CognitoAuthError,
  CognitoPasswordAuthClient,
  StaticAuthSessionProvider
} from "../auth";
import type { FetchLike } from "../http";

test("CognitoPasswordAuthClient sends USER_PASSWORD_AUTH request", async () => {
  const calls: Array<{
    readonly body?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly input: string;
    readonly method?: string;
  }> = [];
  const fetcher: FetchLike = async (input, init) => {
    calls.push({
      body: init?.body,
      headers: init?.headers,
      input,
      method: init?.method
    });

    return createJsonResponse({
      AuthenticationResult: {
        AccessToken: "access-token",
        ExpiresIn: 60,
        IdToken: "id-token",
        RefreshToken: "refresh-token",
        TokenType: "Bearer"
      }
    });
  };
  const client = new CognitoPasswordAuthClient(
    {
      awsRegion: "us-east-1",
      cognitoUserPoolClientId: "client-id"
    },
    fetcher
  );
  const session = await client.signIn({
    password: "temporary-password",
    username: "smoke-user"
  });

  expect(session).toMatchObject({
    accessToken: "access-token",
    idToken: "id-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    username: "smoke-user"
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.input).toBe(
    "https://cognito-idp.us-east-1.amazonaws.com/"
  );
  expect(calls[0]?.headers).toMatchObject({
    "Content-Type": "application/x-amz-json-1.1",
    "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"
  });
  expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      PASSWORD: "temporary-password",
      USERNAME: "smoke-user"
    },
    ClientId: "client-id"
  });
});

test("CognitoPasswordAuthClient maps Cognito errors without echoing passwords", async () => {
  const fetcher: FetchLike = async () =>
    createJsonResponse(
      {
        message: "Incorrect username or password."
      },
      400
    );
  const client = new CognitoPasswordAuthClient(
    {
      awsRegion: "us-east-1",
      cognitoUserPoolClientId: "client-id"
    },
    fetcher
  );

  await expect(
    client.signIn({
      password: "do-not-print",
      username: "smoke-user"
    })
  ).rejects.toThrow(CognitoAuthError);
  await expect(
    client.signIn({
      password: "do-not-print",
      username: "smoke-user"
    })
  ).rejects.not.toThrow(/do-not-print/u);
});

test("StaticAuthSessionProvider returns an ID token", async () => {
  await expect(
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }).getIdToken()
  ).resolves.toBe("id-token");
});

function createJsonResponse(
  body: unknown,
  status = 200
): Awaited<ReturnType<FetchLike>> {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}
