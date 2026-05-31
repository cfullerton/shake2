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
  if (typeof fetch !== "function") {
    throw new Error("A fetch implementation is required for multiplayer network calls.");
  }

  return fetch as FetchLike;
}
