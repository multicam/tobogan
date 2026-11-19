import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppTokenProvider,
  createTokenManager,
  EncryptedTokenStore,
  MemoryTokenStore,
  ReauthRequiredError,
  redisBackend,
  TOKEN_TTL_MS,
  type KeyValueBackend,
} from "../lib/m365/tokens";
import { fakeFetch, json } from "./helpers";

const KEY = randomBytes(32).toString("base64");
const NOW = 1_000_000_000_000;
const tokens = (expiresAt: number) => ({ accessToken: "old-at", refreshToken: "old-rt", expiresAt });

/** Map-backed stand-in for a key-value service, recording TTLs. */
function memoryBackend() {
  const data = new Map<string, string>();
  const ttls = new Map<string, number>();
  const backend: KeyValueBackend = {
    get: async (k) => data.get(k),
    set: async (k, v, ttl) => void (data.set(k, v), ttls.set(k, ttl)),
    delete: async (k) => void data.delete(k),
  };
  return { backend, data, ttls };
}

function manager(replies: Parameters<typeof fakeFetch>[0], store = new MemoryTokenStore()) {
  const fake = fakeFetch(replies);
  const tm = createTokenManager({
    store,
    tenantId: "contoso.onmicrosoft.com",
    clientId: "client",
    clientSecret: "s3cret",
    scope: "openid offline_access",
    fetch: fake.fetch,
    now: () => NOW,
  });
  return { tm, store, calls: fake.calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemoryTokenStore", () => {
  it("stores, returns and deletes per user", async () => {
    const store = new MemoryTokenStore();
    await store.set("u1", tokens(1));
    expect(await store.get("u1")).toEqual(tokens(1));
    expect(await store.get("u2")).toBeUndefined();
    await store.delete("u1");
    expect(await store.get("u1")).toBeUndefined();
  });
});

describe("ReauthRequiredError", () => {
  it("has a default and a custom message", () => {
    expect(new ReauthRequiredError()).toMatchObject({ name: "ReauthRequiredError", message: "Microsoft 365 sign-in required." });
    expect(new ReauthRequiredError("again").message).toBe("again");
  });
});

describe("token manager", () => {
  it("save and forget go straight to the store", async () => {
    const { tm, store } = manager([]);
    await tm.save("u", tokens(NOW + 3_600_000));
    expect(await store.get("u")).toEqual(tokens(NOW + 3_600_000));
    expect(await tm.getAccessToken("u")).toBe("old-at");
    await tm.forget("u");
    await expect(tm.getAccessToken("u")).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("posts a refresh_token grant to the tenant's token endpoint", async () => {
    const { tm, store, calls } = manager([json({ access_token: "new-at", refresh_token: "new-rt", expires_in: 600 })]);
    await store.set("u", tokens(NOW));
    expect(await tm.getAccessToken("u")).toBe("new-at");
    expect(calls[0]!.url).toBe("https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token");
    expect(calls[0]!.method).toBe("POST");
    const form = calls[0]!.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({
      client_id: "client",
      client_secret: "s3cret",
      grant_type: "refresh_token",
      refresh_token: "old-rt",
      scope: "openid offline_access",
    });
    expect(await store.get("u")).toEqual({ accessToken: "new-at", refreshToken: "new-rt", expiresAt: NOW + 600_000 });
  });

  it("refreshes inside the skew window and defaults expires_in to an hour", async () => {
    const { tm, store } = manager([json({ access_token: "new-at" })]);
    // Valid for 4 more minutes: inside the default 5-minute skew.
    await store.set("u", tokens(NOW + 4 * 60_000));
    expect(await tm.getAccessToken("u")).toBe("new-at");
    expect((await store.get("u"))!.expiresAt).toBe(NOW + 3_600_000);
  });

  it("honours a custom skew", async () => {
    const store = new MemoryTokenStore();
    const fake = fakeFetch([]);
    const tm = createTokenManager({ store, tenantId: "t", clientId: "c", clientSecret: "s", scope: "x", fetch: fake.fetch, now: () => NOW, skewMs: 0 });
    await store.set("u", tokens(NOW + 1));
    expect(await tm.getAccessToken("u")).toBe("old-at");
    expect(fake.calls).toHaveLength(0);
  });

  it("requires sign-in on interaction_required (e.g. conditional access) and drops the tokens", async () => {
    const { tm, store } = manager([json({ error: "interaction_required" }, 400)]);
    await store.set("u", tokens(NOW));
    await expect(tm.getAccessToken("u")).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(await store.get("u")).toBeUndefined();
  });

  it("treats a 200 without an access token as a transient failure", async () => {
    const { tm, store } = manager([json({})]);
    await store.set("u", tokens(NOW));
    await expect(tm.getAccessToken("u")).rejects.toThrow("Token refresh failed: 200");
    expect(await store.get("u")).toEqual(tokens(NOW));
  });

  it("reports the HTTP status when the error body is not JSON", async () => {
    const { tm, store } = manager([new Response("<html>oops</html>", { status: 503 })]);
    await store.set("u", tokens(NOW));
    await expect(tm.getAccessToken("u")).rejects.toThrow("Token refresh failed: 503");
  });

  it("allows a new refresh after a failed one", async () => {
    const { tm, store } = manager([json({ error: "temporarily_unavailable" }, 500), json({ access_token: "after" })]);
    await store.set("u", tokens(NOW));
    await expect(tm.getAccessToken("u")).rejects.toThrow("temporarily_unavailable");
    expect(await tm.getAccessToken("u")).toBe("after");
  });

  it("defaults to the global fetch and clock", async () => {
    const fake = fakeFetch([json({ access_token: "g" })]);
    vi.stubGlobal("fetch", fake.fetch);
    const store = new MemoryTokenStore();
    const tm = createTokenManager({ store, tenantId: "t", clientId: "c", clientSecret: "s", scope: "x" });
    await store.set("u", tokens(Date.now() - 1));
    expect(await tm.getAccessToken("u")).toBe("g");
    expect((await store.get("u"))!.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("EncryptedTokenStore", () => {
  it("uses the default prefix and TTL, or the configured ones", async () => {
    const a = memoryBackend();
    await new EncryptedTokenStore(a.backend, KEY).set("u", tokens(1));
    expect([...a.ttls]).toEqual([["m365:tokens:u", TOKEN_TTL_MS]]);

    const b = memoryBackend();
    const store = new EncryptedTokenStore(b.backend, KEY, { prefix: "p:", ttlMs: 5 });
    await store.set("u", tokens(2));
    expect([...b.ttls]).toEqual([["p:u", 5]]);
    expect(await store.get("u")).toEqual(tokens(2));
  });

  it("returns undefined for a missing entry", async () => {
    expect(await new EncryptedTokenStore(memoryBackend().backend, KEY).get("nobody")).toBeUndefined();
  });

  it("deletes the entry on delete()", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    await store.set("u", tokens(1));
    await store.delete("u");
    expect(data.size).toBe(0);
  });

  it("discards entries in an unknown format or with missing parts", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    for (const sealed of ["v2.a.b.c", "v1.a.b", "plaintext", "v1..tag.body"]) {
      data.set("m365:tokens:u", sealed);
      expect(await store.get("u")).toBeUndefined();
      expect(data.has("m365:tokens:u")).toBe(false);
    }
  });

  it("discards a tampered ciphertext", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    await store.set("u", tokens(1));
    const [v, iv, tag, body] = data.get("m365:tokens:u")!.split(".") as [string, string, string, string];
    const flipped = Buffer.from(body, "base64url");
    flipped[0] = flipped[0]! ^ 0xff;
    data.set("m365:tokens:u", [v, iv, tag, flipped.toString("base64url")].join("."));
    expect(await store.get("u")).toBeUndefined();
  });

  it("uses a fresh IV for every write", async () => {
    const { backend, data } = memoryBackend();
    const store = new EncryptedTokenStore(backend, KEY);
    await store.set("u", tokens(1));
    const first = data.get("m365:tokens:u");
    await store.set("u", tokens(1));
    expect(data.get("m365:tokens:u")).not.toBe(first);
  });
});

describe("redisBackend", () => {
  it("treats non-string replies as absent", async () => {
    const backend = redisBackend({ get: async () => ({}), set: async () => "OK", del: async () => 1 });
    expect(await backend.get("k")).toBeNull();
  });

  it("returns null when Redis has no value", async () => {
    const backend = redisBackend({ get: async () => null, set: async () => "OK", del: async () => 0 });
    expect(await backend.get("k")).toBeNull();
  });

  it("propagates Redis failures", async () => {
    const boom = new Error("ECONNREFUSED");
    const backend = redisBackend({
      get: async () => Promise.reject(boom),
      set: async () => Promise.reject(boom),
      del: async () => Promise.reject(boom),
    });
    await expect(backend.get("k")).rejects.toBe(boom);
    await expect(backend.set("k", "v", 1)).rejects.toBe(boom);
    await expect(backend.delete("k")).rejects.toBe(boom);
  });
});

describe("app token provider", () => {
  const options = (replies: Parameters<typeof fakeFetch>[0], now = () => NOW) => {
    const fake = fakeFetch(replies);
    return { get: createAppTokenProvider({ tenantId: "t id", clientId: "c", clientSecret: "s", fetch: fake.fetch, now }), calls: fake.calls };
  };

  it("requests the .default Graph scope with client credentials", async () => {
    const { get, calls } = options([json({ access_token: "app", expires_in: 3600 })]);
    expect(await get()).toBe("app");
    expect(calls[0]!.url).toBe("https://login.microsoftonline.com/t%20id/oauth2/v2.0/token");
    expect(Object.fromEntries(calls[0]!.body as URLSearchParams)).toMatchObject({
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
  });

  it("refreshes once the cached token enters the skew window, defaulting expires_in to an hour", async () => {
    let now = NOW;
    const { get, calls } = options([json({ access_token: "one" }), json({ access_token: "two" })], () => now);
    expect(await get()).toBe("one");
    now += 3_600_000 - 5 * 60_000 - 1;
    expect(await get()).toBe("one");
    now += 1;
    expect(await get()).toBe("two");
    expect(calls).toHaveLength(2);
  });

  it("reports the HTTP status for a non-JSON failure and recovers on the next call", async () => {
    const { get } = options([new Response("bad", { status: 502 }), json({ access_token: "ok" })]);
    await expect(get()).rejects.toThrow("App token request failed: 502");
    expect(await get()).toBe("ok");
  });

  it("rejects a 200 without an access token", async () => {
    const { get } = options([json({ error: "unauthorized_client" })]);
    await expect(get()).rejects.toThrow("unauthorized_client");
  });

  it("defaults to the global fetch and clock", async () => {
    const fake = fakeFetch([json({ access_token: "g" })]);
    vi.stubGlobal("fetch", fake.fetch);
    const get = createAppTokenProvider({ tenantId: "t", clientId: "c", clientSecret: "s" });
    expect(await get()).toBe("g");
    expect(await get()).toBe("g");
    expect(fake.calls).toHaveLength(1);
  });
});
