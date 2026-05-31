import { StaticAuthSessionProvider } from "../auth";
import {
  AppSyncGraphqlClient,
  GraphqlRequestError,
  type GraphqlRequest
} from "../graphql";
import type { FetchLike } from "../http";

test("AppSyncGraphqlClient sends authenticated GraphQL requests", async () => {
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
      data: {
        ping: true
      }
    });
  };
  const client = new AppSyncGraphqlClient(
    {
      appSyncGraphqlUrl: "https://example/graphql"
    },
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }),
    fetcher
  );
  const data = await client.execute<{ readonly ping: boolean }>({
    operationName: "Ping",
    query: "query Ping { ping }"
  });

  expect(data).toEqual({
    ping: true
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.headers).toMatchObject({
    Authorization: "id-token",
    "Content-Type": "application/json"
  });
  expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
    operationName: "Ping",
    query: "query Ping { ping }",
    variables: {}
  });
});

test("AppSyncGraphqlClient throws typed GraphQL errors", async () => {
  const fetcher: FetchLike = async () =>
    createJsonResponse({
      data: null,
      errors: [
        {
          errorType: "INVALID_ACTOR",
          message: "Only the room host can start the game."
        }
      ]
    });
  const client = new AppSyncGraphqlClient(
    {
      appSyncGraphqlUrl: "https://example/graphql"
    },
    new StaticAuthSessionProvider({
      idToken: "id-token"
    }),
    fetcher
  );

  await expect(
    client.execute({
      operationName: "StartGame",
      query: "mutation StartGame { startGame { room { roomId } } }"
    })
  ).rejects.toMatchObject({
    errors: [
      {
        errorType: "INVALID_ACTOR"
      }
    ],
    name: "GraphqlRequestError"
  } satisfies Partial<GraphqlRequestError>);
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
