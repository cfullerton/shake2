export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init?: {
    readonly body?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly method?: string;
  }
) => Promise<FetchResponseLike>;

export function getDefaultFetch(): FetchLike {
  const defaultFetch = globalThis.fetch;

  if (typeof defaultFetch !== "function") {
    throw new Error("A fetch implementation is required for multiplayer network calls.");
  }

  return (input, init) =>
    defaultFetch.call(globalThis, input, init) as Promise<FetchResponseLike>;
}
