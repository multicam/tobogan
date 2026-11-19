import { describe, expect, it } from "vitest";
import { driveDelta, handleNotificationRequest, mailDelta, subscribe } from "../lib/m365/changes";
import { createFromTemplate, waitForCopy } from "../lib/m365/drive";
import { createGraphClient, createLimiter, isMailRequest } from "../lib/m365/graph-client";
import { graphScope } from "../lib/m365/scopes";
import { invite, setPermissionRole } from "../lib/m365/sharing";
import { grantAppSiteAccess } from "../lib/m365/sites";
import { createAppTokenProvider, EncryptedTokenStore, redisBackend, type KeyValueBackend } from "../lib/m365/tokens";
import { fakeFetch, graphWith, json } from "./helpers";

const KEY = Buffer.alloc(32, 7).toString("base64");

function memoryBackend() {
  const data = new Map<string, { value: string; ttl: number }>();
  const backend: KeyValueBackend = {
    get: async (k) => data.get(k)?.value,
    set: async (k, value, ttl) => void data.set(k, { value, ttl }),
    delete: async (k) => void data.delete(k),
  };
  return { backend, data };
}

describe("encrypted token store (AUTH-7)", () => {
  const tokens = { accessToken: "a", refreshToken: "r-secret", expiresAt: 1 };

  it("round-trips, stores ciphertext only and sets a 90-day TTL", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    await store.set("u1", tokens);
    const raw = data.get("m365:tokens:u1")!;
    expect(raw.value).not.toContain("r-secret");
    expect(raw.value.startsWith("v1.")).toBe(true);
    expect(raw.ttl).toBe(90 * 24 * 3600 * 1000);
    expect(await store.get("u1")).toEqual(tokens);
  });

  it("refuses an entry moved to another user's key, and deletes it", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    await store.set("u1", tokens);
    data.set("m365:tokens:u2", data.get("m365:tokens:u1")!);
    expect(await store.get("u2")).toBeUndefined();
    expect(data.has("m365:tokens:u2")).toBe(false);
  });

  it("refuses entries sealed with a different key", async () => {
    const { backend } = memoryBackend();
    await new EncryptedTokenStore(backend, Buffer.alloc(32, 1).toString("base64")).set("u1", tokens);
    expect(await new EncryptedTokenStore(backend, KEY).get("u1")).toBeUndefined();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => new EncryptedTokenStore(memoryBackend().backend, Buffer.alloc(16).toString("base64"))).toThrow("32 bytes");
  });

  it("adapts a node-redis client", async () => {
    const calls: unknown[][] = [];
    const client = {
      get: async (k: string) => (calls.push(["get", k]), "v"),
      set: async (k: string, v: string, o: { PX: number }) => (calls.push(["set", k, v, o]), "OK"),
      del: async (k: string) => (calls.push(["del", k]), 1),
    };
    const kv = redisBackend(client);
    expect(await kv.get("k")).toBe("v");
    await kv.set("k", "v", 5000);
    await kv.delete("k");
    expect(calls).toEqual([["get", "k"], ["set", "k", "v", { PX: 5000 }], ["del", "k"]]);
  });
});

describe("app-only tokens (MATTER-7)", () => {
  it("uses client credentials, caches until near expiry and shares one request", async () => {
    const now = { value: 0 };
    const fake = fakeFetch([json({ access_token: "app1", expires_in: 3600 }), json({ access_token: "app2", expires_in: 3600 })]);
    const get = createAppTokenProvider({ tenantId: "t", clientId: "c", clientSecret: "s", fetch: fake.fetch, now: () => now.value });
    expect(await Promise.all([get(), get()])).toEqual(["app1", "app1"]);
    expect(String(fake.calls[0]!.body)).toContain("grant_type=client_credentials");
    expect(String(fake.calls[0]!.body)).toContain("scope=https%3A%2F%2Fgraph.microsoft.com%2F.default");
    now.value = 3_400_000;
    expect(await get()).toBe("app2");
    expect(fake.calls).toHaveLength(2);
  });

  it("throws on failure", async () => {
    const get = createAppTokenProvider({ tenantId: "t", clientId: "c", clientSecret: "s", fetch: fakeFetch([json({ error: "invalid_client" }, 401)]).fetch });
    await expect(get()).rejects.toThrow("invalid_client");
  });
});

describe("scopes (AUTH-5)", () => {
  it("defaults to Sites.Selected", () => {
    expect(graphScope(undefined)).toContain("Sites.Selected");
    expect(graphScope(undefined)).not.toContain("Sites.ReadWrite.All");
    expect(graphScope("all")).toContain("Sites.ReadWrite.All");
    expect(() => graphScope("everything")).toThrow();
  });

  it("grants the app a role on one site", async () => {
    const { graph, calls } = graphWith([json({ id: "g1", roles: ["fullcontrol"] }, 201)]);
    await grantAppSiteAccess(graph, "contoso.sharepoint.com,abc,def", { clientId: "0f6c5a8e-1b2c-4d3e-8f90-123456789abc", displayName: "Cub" }, "fullcontrol");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com%2Cabc%2Cdef/permissions");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({
      roles: ["fullcontrol"],
      grantedToIdentities: [{ application: { id: "0f6c5a8e-1b2c-4d3e-8f90-123456789abc", displayName: "Cub" } }],
    });
  });
});

describe("mailbox limiter (GRAPH-7)", () => {
  it("never runs more than the limit at once", async () => {
    const limiter = createLimiter(2);
    let running = 0;
    let peak = 0;
    const task = () =>
      limiter.run(async () => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      });
    await Promise.all(Array.from({ length: 7 }, task));
    expect(peak).toBe(2);
    expect(limiter.active).toBe(0);
  });

  it("applies only to mail requests", async () => {
    expect(isMailRequest(new URL("https://graph.microsoft.com/v1.0/me/messages/x"))).toBe(true);
    expect(isMailRequest(new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"))).toBe(true);
    expect(isMailRequest(new URL("https://graph.microsoft.com/v1.0/users/a@b.c/sendMail"))).toBe(true);
    expect(isMailRequest(new URL("https://graph.microsoft.com/v1.0/drives/d/root/children"))).toBe(false);
    expect(isMailRequest(new URL("https://graph.microsoft.com/v1.0/me/messagesX"))).toBe(false);

    let limited = 0;
    const mailLimiter = { run: <T,>(fn: () => Promise<T>) => (limited++, fn()) };
    const fake = fakeFetch([json({}), json({})]);
    const graph = createGraphClient({ getAccessToken: async () => "t", fetch: fake.fetch, mailLimiter });
    await graph.request("GET", "/drives/d/root");
    await graph.request("GET", "/me/messages");
    expect(limited).toBe(1);
  });
});

describe("delta (GRAPH-8)", () => {
  it("follows pages to the deltaLink", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "a", name: "x.docx", parentReference: { id: "p" } }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/drives/d/root/delta?token=2" }),
      json({ value: [{ id: "b", deleted: {} }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/drives/d/root/delta?token=3" }),
    ]);
    const result = await driveDelta(graph, "d");
    expect(result.changes).toEqual([
      { id: "a", name: "x.docx", deleted: false, isFolder: false, parentId: "p" },
      { id: "b", name: undefined, deleted: true, isFolder: false, parentId: undefined },
    ]);
    expect(result.deltaLink).toContain("token=3");
    expect(result.resynced).toBe(false);
    expect(calls[0]!.url).toContain("/drives/d/root/delta?%24select=");
  });

  it("starts over when the saved token has expired (410)", async () => {
    const { graph, calls } = graphWith([
      json({ error: { code: "resyncRequired", message: "gone" } }, 410),
      json({ value: [{ id: "a" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/drives/d/root/delta?token=new" }),
    ]);
    const result = await driveDelta(graph, "d", "https://graph.microsoft.com/v1.0/drives/d/root/delta?token=old");
    expect(result.resynced).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(calls[1]!.url).toContain("/drives/d/root/delta?%24select=");
  });

  it("tracks mail with immutable ids and reports removals", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "m1", "@removed": { reason: "deleted" } }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/x" })]);
    const result = await mailDelta(graph);
    expect(result.changes[0]).toMatchObject({ id: "m1", removed: true });
    expect(calls[0]!.headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(calls[0]!.url).toContain("/me/mailFolders/inbox/messages/delta");
  });
});

describe("subscriptions and webhooks (GRAPH-8)", () => {
  it("subscribes to the drive root with a capped lifetime", async () => {
    const { graph, calls } = graphWith([json({ id: "s1", resource: "r", expirationDateTime: "x" }, 201)]);
    await subscribe(graph, { kind: "drive", driveId: "d", notificationUrl: "https://app.example/api/graph/notifications", clientState: "x".repeat(32), now: 0 });
    const body = JSON.parse(String(calls[0]!.body));
    expect(body).toMatchObject({ changeType: "updated", resource: "/drives/d/root" });
    expect(Date.parse(body.expirationDateTime)).toBe((42_300 - 60) * 60_000);
  });

  it("rejects insecure URLs and weak client state", async () => {
    const { graph } = graphWith([]);
    await expect(subscribe(graph, { kind: "mail", notificationUrl: "http://x", clientState: "x".repeat(32) })).rejects.toThrow("HTTPS");
    await expect(subscribe(graph, { kind: "mail", notificationUrl: "https://x", clientState: "short" })).rejects.toThrow("clientState");
  });

  it("echoes the validation token as plain text", async () => {
    const response = await handleNotificationRequest(new Request("https://app.example/hook?validationToken=abc%20123", { method: "POST" }), { clientState: "s", onNotifications: () => {} });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("abc 123");
  });

  it("passes on only notifications with the right client state, and answers 202", async () => {
    const received: unknown[] = [];
    const body = { value: [{ subscriptionId: "s1", clientState: "right-secret", resource: "r" }, { subscriptionId: "s2", clientState: "wrong-secret" }, { subscriptionId: "s3" }] };
    const response = await handleNotificationRequest(new Request("https://app.example/hook", { method: "POST", body: JSON.stringify(body) }), {
      clientState: "right-secret",
      onNotifications: (items) => void received.push(...items),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(response.status).toBe(202);
    expect(received).toEqual([{ subscriptionId: "s1", resource: "r", changeType: undefined, lifecycleEvent: undefined }]);
  });
});

describe("template copy (FILES-7)", () => {
  it("returns the monitor URL and polls it until the new item exists", async () => {
    const monitor = "https://contoso.sharepoint.com/_api/v2.0/monitor/abc";
    const { graph, calls } = graphWith([new Response(null, { status: 202, headers: { Location: monitor } })]);
    expect(await createFromTemplate(graph, "d", "tpl", "root", "New.docx")).toBe(monitor);
    expect(new URL(calls[0]!.url).searchParams.get("@microsoft.graph.conflictBehavior")).toBe("fail");

    const poll = fakeFetch([json({ status: "inProgress", percentageComplete: 50 }, 202), json({ status: "completed", resourceId: "new1" })]);
    expect(await waitForCopy(monitor, { fetch: poll.fetch, sleep: async () => {} })).toBe("new1");
    expect(poll.calls.every((c) => !c.headers.has("authorization"))).toBe(true);
  });

  it("fails on a failed copy, a non-Microsoft monitor URL, or a timeout", async () => {
    await expect(waitForCopy("https://contoso.sharepoint.com/m", { fetch: fakeFetch([json({ status: "failed", error: { message: "name in use" } })]).fetch, sleep: async () => {} })).rejects.toThrow("name in use");
    await expect(waitForCopy("https://evil.example/m", { fetch: fakeFetch([]).fetch })).rejects.toThrow("monitor");
    const forever = fakeFetch(Array.from({ length: 3 }, () => json({ status: "inProgress" }, 202)));
    await expect(waitForCopy("https://contoso.sharepoint.com/m", { fetch: forever.fetch, sleep: async () => {}, maxPolls: 3 })).rejects.toThrow("did not finish");
  });
});

describe("sharing additions", () => {
  it("invites groups by object id", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "p1" }] })]);
    await invite(graph, "d", "i", { emails: [], groupIds: ["0f6c5a8e-1b2c-4d3e-8f90-123456789abc"] });
    expect(JSON.parse(String(calls[0]!.body)).recipients).toEqual([{ objectId: "0f6c5a8e-1b2c-4d3e-8f90-123456789abc" }]);
    await expect(invite(graph, "d", "i", { emails: [], groupIds: ["not-a-guid"] })).rejects.toThrow("Invalid");
  });

  it("changes a role", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 204 })]);
    await setPermissionRole(graph, "d", "i", "p1", "read");
    expect(calls[0]!.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ roles: ["read"] });
  });
});
