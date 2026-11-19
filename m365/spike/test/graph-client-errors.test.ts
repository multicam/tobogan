import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraphClient, createLimiter, GraphError, isMailRequest, seg, type RawResult } from "../lib/m365/graph-client";
import { fakeFetch, graphWith, json } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GraphError", () => {
  it("classifies auth, forbidden, not found and conflict by status", () => {
    const by = (status: number) => new GraphError(status, "c", "m");
    expect(by(401)).toMatchObject({ isAuth: true, isForbidden: false, isNotFound: false, isConflict: false });
    expect(by(403)).toMatchObject({ isAuth: false, isForbidden: true });
    expect(by(404)).toMatchObject({ isNotFound: true, isConflict: false });
    expect(by(409)).toMatchObject({ isConflict: true, isNotFound: false });
    expect(by(500)).toMatchObject({ isAuth: false, isForbidden: false, isNotFound: false, isConflict: false });
    expect(by(400).name).toBe("GraphError");
  });
});

describe("graph client error mapping", () => {
  it("surfaces 4xx Graph errors with code, message and request id, without retrying", async () => {
    const { graph, calls } = graphWith([
      json({ error: { code: "itemNotFound", message: "Item does not exist" } }, 404, { "request-id": "req-1" }),
    ]);
    const error = (await graph.request("GET", "/x").catch((e) => e)) as GraphError;
    expect(error).toMatchObject({ status: 404, code: "itemNotFound", message: "Item does not exist", requestId: "req-1", isNotFound: true });
    expect(calls).toHaveLength(1);
  });

  it("falls back to http<status> and statusText for a non-JSON error body", async () => {
    const { graph } = graphWith([new Response("<html>bad gateway</html>", { status: 400, statusText: "Bad Request" })]);
    await expect(graph.request("GET", "/x")).rejects.toMatchObject({ status: 400, code: "http400", message: "Bad Request", requestId: undefined });
  });

  it("uses a generic message when there is no statusText and the JSON has no error", async () => {
    const { graph } = graphWith([json({ unrelated: true }, 403)]);
    await expect(graph.request("GET", "/x")).rejects.toMatchObject({ status: 403, code: "http403", message: "Graph request failed" });
  });

  it("does not retry 500 even for GET", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "generalException" } }, 500)]);
    await expect(graph.request("GET", "/x")).rejects.toMatchObject({ status: 500, code: "generalException" });
    expect(calls).toHaveLength(1);
  });

  it("retries 502 and 504 for idempotent verbs with exponential backoff", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    const { graph, calls, sleeps } = graphWith([json({}, 502), json({}, 504), json({ ok: true })]);
    expect(await graph.request("PUT", "/x", { json: {} })).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    // base/2 + random*base/2 with random=1: the full base, doubling per attempt.
    expect(sleeps).toEqual([1000, 2000]);
    random.mockRestore();
  });

  it("caps Retry-After at maxRetryDelayMs and backoff at the same bound", async () => {
    const fake = fakeFetch([json({}, 429, { "Retry-After": "120" }), json({}, 429), json({ ok: 1 })]);
    const sleeps: number[] = [];
    vi.spyOn(Math, "random").mockReturnValue(1);
    const graph = createGraphClient({
      getAccessToken: async () => "t",
      fetch: fake.fetch,
      maxRetryDelayMs: 1500,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await graph.request("GET", "/x");
    expect(sleeps).toEqual([1500, 1500]);
    vi.restoreAllMocks();
  });

  it("honours a custom maxRetries of zero", async () => {
    const fake = fakeFetch([json({ error: { code: "TooManyRequests" } }, 429)]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch, maxRetries: 0, sleep: async () => {} });
    await expect(graph.request("GET", "/x")).rejects.toMatchObject({ status: 429 });
    expect(fake.calls).toHaveLength(1);
  });

  it("gives up on repeated network errors for GET after maxRetries", async () => {
    const fake = fakeFetch([new TypeError("down"), new TypeError("down"), new TypeError("still down")]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch, maxRetries: 2, sleep: async () => {} });
    await expect(graph.request("GET", "/x")).rejects.toThrow("still down");
    expect(fake.calls).toHaveLength(3);
  });

  it("does not retry when the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("aborted", "AbortError");
    const { graph, calls } = graphWith([abortError]);
    await expect(graph.request("GET", "/x", { signal: controller.signal })).rejects.toBe(abortError);
    expect(calls).toHaveLength(1);
  });

  it("fetches a fresh token on every attempt", async () => {
    const tokens = ["first", "second"];
    const fake = fakeFetch([json({}, 429, { "Retry-After": "0" }), json({ ok: 1 })]);
    const graph = createGraphClient({ getAccessToken: async () => tokens.shift()!, fetch: fake.fetch, sleep: async () => {} });
    await graph.request("GET", "/x");
    expect(fake.calls.map((c) => c.headers.get("authorization"))).toEqual(["Bearer first", "Bearer second"]);
  });

  it("propagates a token failure without calling Graph", async () => {
    const fake = fakeFetch([]);
    const graph = createGraphClient({ getAccessToken: async () => Promise.reject(new Error("no token")), fetch: fake.fetch });
    await expect(graph.request("GET", "/x")).rejects.toThrow("no token");
    expect(fake.calls).toHaveLength(0);
  });

  it("throws on a malformed JSON success body", async () => {
    const { graph } = graphWith([new Response("{not json", { status: 200 })]);
    await expect(graph.request("GET", "/x")).rejects.toThrow(SyntaxError);
  });
});

describe("graph client request shapes", () => {
  it("sends raw bytes with the given or default content type, ahead of json", async () => {
    const { graph, calls } = graphWith([json({}), json({})]);
    const bytes = new Uint8Array([1, 2, 3]);
    await graph.request("PUT", "/a", { body: bytes, json: { ignored: true }, contentType: "text/plain" });
    await graph.request("PUT", "/b", { body: bytes });
    expect(calls[0]!.body).toBe(bytes);
    expect(calls[0]!.headers.get("content-type")).toBe("text/plain");
    expect(calls[1]!.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("serialises json bodies, merges caller headers and sets the user agent", async () => {
    const fake = fakeFetch([json({})]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch, userAgent: "NONISV|Test|App/1" });
    await graph.request("post", "relative/path", { json: { a: 1 }, headers: { Prefer: "x" }, query: { skip: undefined, top: 5, flag: true } });
    const call = fake.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://graph.microsoft.com/v1.0/relative/path?top=5&flag=true");
    expect(call.body).toBe('{"a":1}');
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(call.headers.get("prefer")).toBe("x");
    expect(call.headers.get("user-agent")).toBe("NONISV|Test|App/1");
  });

  it("sends no body or content type when there is none", async () => {
    const { graph, calls } = graphWith([json({})]);
    await graph.request("GET", "/x");
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[0]!.headers.get("content-type")).toBeNull();
  });

  it("respects a custom baseUrl for both relative paths and cursors", async () => {
    const fake = fakeFetch([json({ value: [1], "@odata.nextLink": "https://graph.example.test/beta/x?page=2" }), json({ value: [2] })]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch, baseUrl: "https://graph.example.test/beta" });
    expect(await graph.getAll("/x")).toEqual([1, 2]);
    expect(fake.calls.map((c) => c.url)).toEqual(["https://graph.example.test/beta/x", "https://graph.example.test/beta/x?page=2"]);
  });

  it("defaults to the global fetch", async () => {
    const fake = fakeFetch([json({ id: "g" })]);
    vi.stubGlobal("fetch", fake.fetch);
    const graph = createGraphClient({ getAccessToken: async () => "t" });
    expect(await graph.request("GET", "/me")).toEqual({ id: "g" });
    expect(fake.calls).toHaveLength(1);
  });

  it("uses a real timer for retries when no sleep is injected", async () => {
    vi.useFakeTimers();
    const fake = fakeFetch([json({}, 429, { "Retry-After": "2" }), json({ ok: 1 })]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch });
    const pending = graph.request("GET", "/x");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: 1 });
  });
});

describe("graph client response types", () => {
  it("raw returns status, headers and parsed body", async () => {
    const { graph } = graphWith([json({ a: 1 }, 202, { Location: "https://x.sharepoint.com/monitor" })]);
    const raw = await graph.request<RawResult>("POST", "/copy", { responseType: "raw" });
    expect(raw.status).toBe(202);
    expect(raw.headers.get("location")).toBe("https://x.sharepoint.com/monitor");
    expect(raw.body).toEqual({ a: 1 });
  });

  it("raw with an empty body returns undefined body", async () => {
    const { graph } = graphWith([new Response(null, { status: 202 })]);
    expect((await graph.request<RawResult>("POST", "/copy", { responseType: "raw" })).body).toBeUndefined();
  });

  it("none and 202 discard the body", async () => {
    const { graph } = graphWith([json({ discarded: true }), json({ discarded: true }, 202)]);
    expect(await graph.request("PATCH", "/x", { responseType: "none" })).toBeUndefined();
    expect(await graph.request("POST", "/x")).toBeUndefined();
  });

  it("bytes returns the body as a Uint8Array", async () => {
    const { graph } = graphWith([new Response(new Uint8Array([9, 8, 7]))]);
    expect(await graph.request("GET", "/content", { responseType: "bytes" })).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("a 200 with an empty body parses to undefined", async () => {
    const { graph } = graphWith([new Response("", { status: 200 })]);
    expect(await graph.request("GET", "/x")).toBeUndefined();
  });
});

describe("graph client paging", () => {
  it("getPage tolerates a missing value array and an empty body", async () => {
    const { graph } = graphWith([json({}), new Response(null, { status: 204 })]);
    expect(await graph.getPage("/x")).toEqual({ items: [], nextLink: undefined });
    expect(await graph.getPage("/y")).toEqual({ items: [], nextLink: undefined });
  });

  it("getAll passes only headers and signal on to later pages, and caps at the default 5000", async () => {
    const next = "https://graph.microsoft.com/v1.0/x?$skiptoken=1";
    const big = Array.from({ length: 5_001 }, (_, i) => i);
    const { graph, calls } = graphWith([json({ value: big.slice(0, 3000), "@odata.nextLink": next }), json({ value: big.slice(3000), "@odata.nextLink": next })]);
    const all = await graph.getAll<number>("/x", { query: { $top: 3000 }, headers: { Prefer: "p" } });
    expect(all).toHaveLength(5_000);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(next);
    expect(calls[1]!.headers.get("prefer")).toBe("p");
  });
});

describe("limiter and mail detection", () => {
  it("rejects a non-positive or non-integer limit", () => {
    expect(() => createLimiter(0)).toThrow(RangeError);
    expect(() => createLimiter(1.5)).toThrow(RangeError);
  });

  it("queues tasks in FIFO order and releases the slot when a task fails", async () => {
    const limiter = createLimiter(1);
    const order: string[] = [];
    let release!: () => void;
    const first = limiter.run(() => new Promise<void>((r) => (release = r)).then(() => order.push("a")));
    const second = limiter.run(async () => {
      order.push("b");
      throw new Error("b failed");
    });
    const third = limiter.run(async () => order.push("c"));
    await Promise.resolve();
    expect(limiter.active).toBe(1);
    expect(limiter.queued).toBe(2);
    release();
    await first;
    await expect(second).rejects.toThrow("b failed");
    await third;
    expect(order).toEqual(["a", "b", "c"]);
    expect(limiter.active).toBe(0);
    expect(limiter.queued).toBe(0);
  });

  it("recognises mailbox paths for me and other users only", () => {
    const u = (p: string) => new URL(`https://graph.microsoft.com${p}`);
    expect(isMailRequest(u("/v1.0/me/messages"))).toBe(true);
    expect(isMailRequest(u("/v1.0/users/abc/mailFolders/inbox/messages"))).toBe(true);
    expect(isMailRequest(u("/v1.0/me/sendMail"))).toBe(true);
    expect(isMailRequest(u("/v1.0/me/messages('id')"))).toBe(true);
    expect(isMailRequest(u("/v1.0/me/messagesExtra"))).toBe(false);
    expect(isMailRequest(u("/v1.0/drives/abc/root"))).toBe(false);
  });

  it("seg encodes characters that would change the path", () => {
    expect(seg("a/b c#?")).toBe("a%2Fb%20c%23%3F");
  });
});
