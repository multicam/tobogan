import { describe, expect, it } from "vitest";
import { GraphError, parseRetryAfter } from "../lib/m365/graph-client";
import { graphWith, json } from "./helpers";

describe("graph client", () => {
  it("sends the bearer token and parses JSON", async () => {
    const { graph, calls } = graphWith([json({ id: "1" })]);
    expect(await graph.request("GET", "/me", { query: { $select: "id" } })).toEqual({ id: "1" });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/me?%24select=id");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer token-abc");
  });

  it("waits for Retry-After on 429 and then succeeds, even for POST", async () => {
    const { graph, calls, sleeps } = graphWith([json({}, 429, { "Retry-After": "7" }), json({ ok: true })]);
    expect(await graph.request("POST", "/x", { json: {} })).toEqual({ ok: true });
    expect(sleeps).toEqual([7000]);
    expect(calls).toHaveLength(2);
  });

  it("retries 503 for GET but not for POST", async () => {
    const get = graphWith([json({}, 503), json({ ok: 1 })]);
    await get.graph.request("GET", "/x");
    expect(get.calls).toHaveLength(2);

    const post = graphWith([json({ error: { code: "serviceNotAvailable", message: "down" } }, 503)]);
    await expect(post.graph.request("POST", "/x", { json: {} })).rejects.toMatchObject({ status: 503, code: "serviceNotAvailable" });
    expect(post.calls).toHaveLength(1);
  });

  it("gives up after maxRetries and surfaces the Graph error", async () => {
    const replies = Array.from({ length: 5 }, () => json({ error: { code: "TooManyRequests", message: "slow down" } }, 429));
    const { graph, calls } = graphWith(replies);
    const error = (await graph.request("GET", "/x").catch((e) => e)) as GraphError;
    expect(error).toBeInstanceOf(GraphError);
    expect(error.status).toBe(429);
    expect(calls).toHaveLength(5);
  });

  it("retries network errors only for idempotent verbs", async () => {
    const get = graphWith([new TypeError("fetch failed"), json({ ok: 1 })]);
    await get.graph.request("GET", "/x");
    expect(get.calls).toHaveLength(2);
    const post = graphWith([new TypeError("fetch failed")]);
    await expect(post.graph.request("POST", "/x", { json: {} })).rejects.toThrow("fetch failed");
  });

  it("never sends the token to a non-Graph host", async () => {
    const { graph, calls } = graphWith([]);
    await expect(graph.getPage("https://evil.example/v1.0/me/messages")).rejects.toMatchObject({ code: "invalidCursor" });
    await expect(graph.getPage("http://graph.microsoft.com/v1.0/me")).rejects.toMatchObject({ code: "invalidCursor" });
    await expect(graph.getPage("https://graph.microsoft.com.evil.example/x")).rejects.toMatchObject({ code: "invalidCursor" });
    expect(calls).toHaveLength(0);
  });

  it("follows nextLink until done and respects maxItems", async () => {
    const next = "https://graph.microsoft.com/v1.0/x?$skiptoken=abc";
    const a = graphWith([json({ value: [1, 2], "@odata.nextLink": next }), json({ value: [3] })]);
    expect(await a.graph.getAll("/x")).toEqual([1, 2, 3]);
    expect(a.calls[1]!.url).toBe(next);

    const b = graphWith([json({ value: [1, 2], "@odata.nextLink": next })]);
    expect(await b.graph.getAll("/x", { maxItems: 2 })).toEqual([1, 2]);
  });

  it("handles 204 and empty bodies", async () => {
    const { graph } = graphWith([new Response(null, { status: 204 })]);
    expect(await graph.request("DELETE", "/x")).toBeUndefined();
  });

  it("parses Retry-After as seconds or a date", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", Date.parse("2026-01-01T00:00:00Z"))).toBe(10_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
