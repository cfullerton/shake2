import { getDefaultFetch, type FetchResponseLike } from "../http";

test("calls browser fetch with the global object binding", async () => {
  const previousFetch = globalThis.fetch;
  const response: FetchResponseLike = {
    json: async () => ({}),
    ok: true,
    status: 200,
    text: async () => ""
  };
  const fetcher = jest.fn(function (
    this: typeof globalThis,
    input: string | URL | Request,
    init?: RequestInit
  ) {
    if (this !== globalThis) {
      throw new TypeError("Can only call Window.fetch on instances of Window");
    }

    expect(input).toBe("https://example.test/");
    expect(init?.method).toBe("POST");

    return Promise.resolve(response as Response);
  });

  try {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetcher,
      writable: true
    });

    await expect(
      getDefaultFetch()("https://example.test/", {
        method: "POST"
      })
    ).resolves.toBe(response);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: previousFetch,
      writable: true
    });
  }
});
