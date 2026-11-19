import { describe, expect, it } from "vitest";
import { createTokenManager, MemoryTokenStore, ReauthRequiredError } from "../lib/m365/tokens";
import { fakeFetch, json } from "./helpers";

function setup(replies: Parameters<typeof fakeFetch>[0], now = { value: 1_000_000 }) {
  const store = new MemoryTokenStore();
  const fake = fakeFetch(replies);
  const manager = createTokenManager({
    store,
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "shh",
    scope: "offline_access Mail.Read",
    fetch: fake.fetch,
    now: () => now.value,
  });
  return { store, manager, calls: fake.calls, now };
}

describe("token manager", () => {
  it("returns a valid token without calling Entra", async () => {
    const t = setup([]);
    await t.manager.save("u1", { accessToken: "a1", refreshToken: "r1", expiresAt: t.now.value + 3_600_000 });
    expect(await t.manager.getAccessToken("u1")).toBe("a1");
    expect(t.calls).toHaveLength(0);
  });

  it("requires sign-in when nothing is stored", async () => {
    await expect(setup([]).manager.getAccessToken("nobody")).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("refreshes an expiring token once for concurrent callers and persists it", async () => {
    const t = setup([json({ access_token: "a2", refresh_token: "r2", expires_in: 3600 })]);
    await t.manager.save("u1", { accessToken: "a1", refreshToken: "r1", expiresAt: t.now.value + 60_000 });
    const results = await Promise.all([t.manager.getAccessToken("u1"), t.manager.getAccessToken("u1"), t.manager.getAccessToken("u1")]);
    expect(results).toEqual(["a2", "a2", "a2"]);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.url).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(String(t.calls[0]!.body)).toContain("refresh_token=r1");
    expect(await t.store.get("u1")).toEqual({ accessToken: "a2", refreshToken: "r2", expiresAt: t.now.value + 3_600_000 });
  });

  it("keeps the old refresh token when Entra does not return a new one", async () => {
    const t = setup([json({ access_token: "a2", expires_in: 100 })]);
    await t.manager.save("u1", { accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
    await t.manager.getAccessToken("u1");
    expect((await t.store.get("u1"))?.refreshToken).toBe("r1");
  });

  it("drops tokens and requires sign-in on invalid_grant", async () => {
    const t = setup([json({ error: "invalid_grant" }, 400)]);
    await t.manager.save("u1", { accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
    await expect(t.manager.getAccessToken("u1")).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(await t.store.get("u1")).toBeUndefined();
  });

  it("keeps tokens on a transient failure so a later call can retry", async () => {
    const t = setup([json({ error: "temporarily_unavailable" }, 503), json({ access_token: "a2", expires_in: 100 })]);
    await t.manager.save("u1", { accessToken: "a1", refreshToken: "r1", expiresAt: 0 });
    await expect(t.manager.getAccessToken("u1")).rejects.toThrow("Token refresh failed");
    expect(await t.store.get("u1")).toBeDefined();
    expect(await t.manager.getAccessToken("u1")).toBe("a2");
  });
});
