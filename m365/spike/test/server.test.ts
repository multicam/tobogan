import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authConfig, redisState, resetProcessState, routeFetch, signInAs, stubBaseEnv, TOKEN_URL, graphJson } from "./next-harness";
import { clearDriveCache } from "../lib/m365/drive";
import { getAppGraph, getDriveContext, getGraph, getRole, getTokenManager, getUserGraph } from "../lib/m365/server";
import { ReauthRequiredError, TOKEN_TTL_MS } from "../lib/m365/tokens";
// Imported for its side effect: registers auth.ts's config with the fake next-auth.
import "../auth";

vi.mock("next-auth", () => import("./next-harness").then((m) => m.nextAuthModule));
vi.mock("redis", () => import("./next-harness").then((m) => m.redisModule));

const ME = /^https:\/\/graph\.microsoft\.com\/v1\.0\/me$/;
const MESSAGES = /^https:\/\/graph\.microsoft\.com\/v1\.0\/me\/messages/;

beforeEach(() => {
  resetProcessState();
  clearDriveCache();
  stubBaseEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("token store selection", () => {
  it("uses the in-memory store outside production", async () => {
    await signInAs({ uid: "u1", accessToken: "mem-token" });
    expect(await getTokenManager().getAccessToken("u1")).toBe("mem-token");
    expect(redisState.clients).toHaveLength(0);
  });

  it("refuses an in-memory store in production unless TOKEN_STORE=memory", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getTokenManager()).toThrow("No shared token store");
    vi.stubEnv("TOKEN_STORE", "memory");
    expect(() => getTokenManager()).not.toThrow();
  });

  it("requires an encryption key with REDIS_URL", () => {
    vi.stubEnv("REDIS_URL", "redis://cache.test:6379");
    expect(() => getTokenManager()).toThrow("TOKEN_ENCRYPTION_KEY is required with REDIS_URL");
  });

  it("rejects an encryption key of the wrong length", () => {
    vi.stubEnv("REDIS_URL", "redis://cache.test:6379");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => getTokenManager()).toThrow("must be 32 bytes");
  });

  describe("with Redis", () => {
    beforeEach(() => {
      vi.stubEnv("REDIS_URL", "redis://cache.test:6379");
      vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    });

    it("stores tokens encrypted, with the refresh-token lifetime as TTL, and reads them back", async () => {
      await signInAs({ uid: "u1", accessToken: "redis-token" });
      const [client] = redisState.clients;
      expect(client?.url).toBe("redis://cache.test:6379");
      expect(client?.connected).toBe(true);
      const entry = client!.data.get("m365:tokens:u1")!;
      expect(entry.value.startsWith("v1.")).toBe(true);
      expect(entry.value).not.toContain("redis-token");
      expect(entry.px).toBe(TOKEN_TTL_MS);
      expect(await getTokenManager().getAccessToken("u1")).toBe("redis-token");
    });

    it("deletes the entry on sign-out", async () => {
      await signInAs({ uid: "u1" });
      await authConfig().events.signOut({ token: { uid: "u1" } });
      expect(redisState.clients[0]!.data.size).toBe(0);
      await expect(getTokenManager().getAccessToken("u1")).rejects.toBeInstanceOf(ReauthRequiredError);
    });

    it("logs connection errors instead of crashing the process", () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      getTokenManager();
      const failure = new Error("ECONNREFUSED");
      for (const listener of redisState.clients[0]!.listeners.get("error") ?? []) listener(failure);
      expect(log).toHaveBeenCalledWith("token store connection error", failure);
    });

    it("creates one client per process", () => {
      expect(getTokenManager()).toBe(getTokenManager());
      expect(redisState.clients).toHaveLength(1);
    });
  });
});

describe("getUserGraph", () => {
  it("requires a signed-in user", async () => {
    await expect(getUserGraph()).rejects.toBeInstanceOf(ReauthRequiredError);
    await expect(getGraph()).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("calls Graph with the user's stored token and identifies the app", async () => {
    await signInAs({ uid: "u1", email: "ann@firm.example", roles: ["Admin"], accessToken: "tok-u1" });
    const { calls } = routeFetch([["GET", ME, () => graphJson({ id: "u1" })]]);
    const user = await getUserGraph();
    expect(user).toMatchObject({ userId: "u1", email: "ann@firm.example", role: "admin" });
    expect(await user.graph.request("GET", "/me")).toEqual({ id: "u1" });
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer tok-u1");
    expect(calls[0]!.headers.get("user-agent")).toMatch(/^NONISV\|/);
  });

  it("leaves email undefined when the session has none", async () => {
    await signInAs({ uid: "u1" });
    expect((await getUserGraph()).email).toBeUndefined();
  });

  it("refreshes an expired token through the Entra token endpoint", async () => {
    await signInAs({ uid: "u1", accessToken: "stale", expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const { calls } = routeFetch([
      ["POST", TOKEN_URL, () => Response.json({ access_token: "fresh", refresh_token: "r2", expires_in: 3600 })],
      ["GET", ME, () => graphJson({ id: "u1" })],
    ]);
    await (await getGraph()).request("GET", "/me");
    const body = new URLSearchParams(String(calls[0]!.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-u1");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer fresh");
  });

  it("asks the user to sign in again when Entra rejects the refresh token", async () => {
    await signInAs({ uid: "u1", expiresAt: 0 });
    routeFetch([["POST", TOKEN_URL, () => Response.json({ error: "invalid_grant" }, { status: 400 })]]);
    await expect((await getGraph()).request("GET", "/me")).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("caps concurrent mail requests per user across all of that user's clients", async () => {
    await signInAs({ uid: "u1" });
    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    routeFetch([
      [
        "GET",
        MESSAGES,
        async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise<void>((resolve) => release.push(resolve));
          active--;
          return graphJson({ value: [] });
        },
      ],
      ["GET", ME, () => graphJson({ id: "u1" })],
    ]);
    const [a, b] = [await getGraph(), await getGraph()];
    const pending = [a, b, a, b, a, b].map((g) => g.request("GET", "/me/messages"));
    await vi.waitFor(() => expect(active).toBe(4));
    // Non-mail calls are not held back by the mailbox limit.
    await expect(a.request("GET", "/me")).resolves.toEqual({ id: "u1" });

    // Another user has a limiter of their own.
    await signInAs({ uid: "u2" });
    const other = (await getGraph()).request("GET", "/me/messages");
    await vi.waitFor(() => expect(active).toBe(5));

    while (release.length > 0 || active > 0) {
      release.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all([...pending, other]);
    expect(peak).toBe(5);
  });
});

describe("getAppGraph", () => {
  it("uses client credentials and reuses the app token across clients", async () => {
    const { calls } = routeFetch([
      ["POST", TOKEN_URL, () => Response.json({ access_token: "app-token", expires_in: 3600 })],
      ["GET", /\/v1\.0\/sites\/root$/, () => graphJson({ id: "site" })],
    ]);
    await getAppGraph().request("GET", "/sites/root");
    await getAppGraph().request("GET", "/sites/root");
    const tokenCalls = calls.filter((c) => TOKEN_URL.test(c.url));
    expect(tokenCalls).toHaveLength(1);
    const body = new URLSearchParams(String(tokenCalls[0]!.body));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("scope")).toBe("https://graph.microsoft.com/.default");
    expect(calls.at(-1)!.headers.get("authorization")).toBe("Bearer app-token");
    expect(calls.at(-1)!.headers.get("user-agent")).toMatch(/^NONISV\|/);
  });

  it("surfaces a failed app token request", async () => {
    routeFetch([["POST", TOKEN_URL, () => Response.json({ error: "invalid_client" }, { status: 401 })]]);
    await expect(getAppGraph().request("GET", "/sites/root")).rejects.toThrow("App token request failed: invalid_client");
  });
});

describe("getDriveContext", () => {
  it("resolves the configured site and default library for the signed-in user", async () => {
    await signInAs({ uid: "u1", email: "ann@firm.example", roles: ["Associate"] });
    const { calls } = routeFetch([
      ["GET", /\/sites\/contoso\.sharepoint\.com:\/sites\/legal\?/, () => graphJson({ id: "site-1" })],
      ["GET", /\/sites\/site-1\/drive\?/, () => graphJson({ id: "drive-1" })],
    ]);
    expect(await getDriveContext()).toMatchObject({ userId: "u1", email: "ann@firm.example", role: "associate", siteId: "site-1", driveId: "drive-1" });
    expect(calls.every((c) => c.headers.get("authorization") === "Bearer access-u1")).toBe(true);
  });

  it("fails clearly when the configured library does not exist", async () => {
    vi.stubEnv("SHAREPOINT_LIBRARY_NAME", "Archive");
    await signInAs({ uid: "u1" });
    routeFetch([
      ["GET", /\/sites\/contoso\.sharepoint\.com:\/sites\/legal\?/, () => graphJson({ id: "site-1" })],
      ["GET", /\/sites\/site-1\/drives\?/, () => graphJson({ value: [{ id: "d", name: "Documents" }] })],
    ]);
    await expect(getDriveContext()).rejects.toMatchObject({ status: 404, code: "libraryNotFound" });
  });
});

describe("getRole", () => {
  it("is undefined without a session or role, else the highest app role", async () => {
    expect(await getRole()).toBeUndefined();
    await signInAs({ uid: "u1" });
    expect(await getRole()).toBeUndefined();
    await signInAs({ uid: "u1", roles: ["Associate", "TeamLeader"] });
    expect(await getRole()).toBe("teamLeader");
  });
});
