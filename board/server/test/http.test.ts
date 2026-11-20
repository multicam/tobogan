import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, type Running } from "../src/main.ts";
import { Tokens, hashToken } from "../src/tokens.ts";

type Failure = { error: { code: string; message: string } };
type Page = { events: { type: string; message: { text: string } }[]; cursor: string };
const dir = mkdtempSync(join(tmpdir(), "csf-board-http-"));

const token = randomBytes(24).toString("base64url");
let running: Running;
let base: string;

beforeAll(async () => {
  const tokens = Tokens.parse(JSON.stringify({ tokens: [{ sha256: hashToken(token), principal: "csf:user:ada", handle: "ada", name: "Ada" }] }), "test");
  running = await start({ host: "127.0.0.1", port: 0, dataDir: join(dir, "data"), boards: ["general"], tokens });
  base = `${running.url}/boards/general`;
});

afterAll(async () => {
  await running.stop();
  rmSync(dir, { recursive: true, force: true });
});

function call(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  return fetch(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
}

describe("http", () => {
  test("discovery needs no token and names the board's URL", async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ url: base, audience: base, team_id: null, project_id: null, sync: [] });
  });

  test("everything else needs a known bearer token", async () => {
    const none = await fetch(`${base}/me`);
    expect(none.status).toBe(401);
    const wrong = await fetch(`${base}/me`, { headers: { authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as Failure).error.code).toBe("unauthorized");
    expect((await fetch(`${running.url}/boards/other/me`)).status).toBe(404);
  });

  test("/me is the principal, or the profile its header names, narrowed by x-board-can", async () => {
    const me = await (await call("/me")).json();
    expect(me).toMatchObject({ actor: "csf:user:ada", principal: "csf:user:ada", kind: "person", handle: "ada", profile: null, can: { "*": ["read", "post", "react", "label", "sync", "manage"] } });
    const asFixer = await (await call("/me", { headers: { "x-board-profile": 'Fixer;avatar="https://example.com/f.png"', "x-board-can": "dev/=label" } })).json();
    expect(asFixer).toMatchObject({ actor: "csf:user:ada+fixer", kind: "agent", handle: "ada/fixer", avatar: "https://example.com/f.png", via: { name: "ada", environment: null }, can: { "dev/": ["read", "label"] } });
  });

  test("errors are { error: { code, message } } with a message", async () => {
    const res = await call("/messages", { method: "POST", body: JSON.stringify({ channel: "dev" }) });
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as Failure;
    expect(error.code).toBe("invalid_request");
    expect(error.message.length).toBeGreaterThan(0);
  });

  test("a long-poll on /events wakes when a write lands", async () => {
    const t0 = Date.now();
    const polled = call("/events?wait=20&channel=poll");
    await Bun.sleep(100);
    const posted = await call("/messages", { method: "POST", body: JSON.stringify({ channel: "poll", text: "wake up" }) });
    expect(posted.status).toBe(201);
    const page = (await (await polled).json()) as Page;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(page.events.map((e) => e.type)).toEqual(["message.posted"]);
    expect(page.events[0]?.message.text).toBe("wake up");
  });

  test("a long-poll with nothing to show answers empty when its wait runs out", async () => {
    const t0 = Date.now();
    const res = await call("/events?wait=1&channel=quiet");
    const page = (await res.json()) as Page;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(950);
    expect(page.events).toEqual([]);
    expect(typeof page.cursor).toBe("string");
  });

  test("optional features answer 501, so conformance skips them", async () => {
    expect((await call("/schedules")).status).toBe(501);
    expect((await call("/attachments", { method: "POST" })).status).toBe(501);
    expect((await call("/events", { headers: { accept: "text/event-stream" } })).status).toBe(501);
    expect((await call("/grants")).status).toBe(501);
  });

  test("a caller narrowed out of part of a subtree may not grant on that subtree", async () => {
    const res = await call("/grants", {
      method: "POST",
      headers: { "x-board-can": "*=all;dev/secret/=" },
      body: JSON.stringify({ principals: [{ kind: "everyone" }], can: { "dev/": ["read"] } }),
    });
    expect(res.status).toBe(403);
    // Unnarrowed, the request reaches what the board doesn't keep.
    const full = await call("/grants", { method: "POST", body: JSON.stringify({ principals: [{ kind: "everyone" }], can: { "dev/": ["read"] } }) });
    expect(full.status).toBe(501);
  });
});
