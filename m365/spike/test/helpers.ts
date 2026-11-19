import { createGraphClient } from "../lib/m365/graph-client";

export interface Call {
  method: string;
  url: string;
  headers: Headers;
  body?: unknown;
}

type Reply = Response | ((call: Call) => Response | Promise<Response>) | Error;

/** Fake fetch that answers from a queue and records every call. */
export function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body,
    };
    calls.push(call);
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(call) : reply;
  }) as typeof fetch;
  return { fetch: impl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export function graphWith(replies: Reply[]) {
  const fake = fakeFetch(replies);
  const sleeps: number[] = [];
  const graph = createGraphClient({
    getAccessToken: async () => "token-abc",
    fetch: fake.fetch,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { graph, calls: fake.calls, sleeps, fetch: fake.fetch };
}
