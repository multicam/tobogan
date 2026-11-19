import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/auth/[...nextauth]/route";
import { handlers } from "../auth";
import { getTokenManager } from "../lib/m365/server";
import { ReauthRequiredError } from "../lib/m365/tokens";
import { authConfig, resetProcessState, routeFetch, signInAs, stubBaseEnv, TENANT_ID, TOKEN_URL } from "./next-harness";

vi.mock("next-auth", () => import("./next-harness").then((m) => m.nextAuthModule));

beforeEach(() => {
  resetProcessState();
  stubBaseEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Auth.js config (auth.ts)", () => {
  it("uses JWT sessions and one Entra provider locked to the tenant", () => {
    const config = authConfig();
    expect(config.session.strategy).toBe("jwt");
    expect(config.providers).toHaveLength(1);
    const provider = config.providers[0]!;
    expect(provider.id).toBe("microsoft-entra-id");
    expect(provider.options?.clientId).toBe("test-client-id");
    expect(provider.options?.issuer).toBe(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`);
    expect(provider.options?.authorization?.params?.scope).toContain("offline_access");
    expect(provider.options?.authorization?.params?.scope).toContain("Sites.Selected");
  });

  it("fails the request, not the build, when the tenant is multi-tenant or missing", () => {
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "common");
    expect(() => authConfig()).toThrow("must be one tenant's id or domain");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "");
    expect(() => authConfig()).toThrow("Missing environment variable AUTH_MICROSOFT_ENTRA_ID_TENANT_ID");
  });

  it("serves the Auth.js handlers from the catch-all route", () => {
    expect(GET).toBe(handlers.GET);
    expect(POST).toBe(handlers.POST);
  });
});

describe("jwt callback", () => {
  it("moves the Graph tokens to the server-side store and keeps only the user key in the cookie", async () => {
    const token = await signInAs({ uid: "user-1", accessToken: "access-xyz", roles: ["Associate", "TeamLeader"] });
    expect(token).toEqual({ sub: "user-1", uid: "user-1", role: "teamLeader" });
    expect(JSON.stringify(token)).not.toContain("access-xyz");
    expect(await getTokenManager().getAccessToken("user-1")).toBe("access-xyz");
  });

  it("leaves the token untouched on later requests (no account)", async () => {
    const existing = { sub: "user-1", uid: "user-1", role: "admin" };
    expect(await authConfig().callbacks.jwt({ token: { ...existing } })).toEqual(existing);
  });

  it("gives no role when the ID token carries no known app role", async () => {
    expect((await signInAs({ uid: "user-2", roles: ["Reader"] })).role).toBeUndefined();
    expect((await signInAs({ uid: "user-3" })).role).toBeUndefined();
  });

  it.each([
    ["access", { refresh_token: "r" }],
    ["refresh", { access_token: "a" }],
  ])("refuses a sign-in without the %s token", async (_missing, tokens) => {
    const jwt = authConfig().callbacks.jwt({ token: {}, account: { providerAccountId: "u", ...tokens }, profile: {} });
    await expect(jwt).rejects.toThrow("check the offline_access scope");
  });

  it("assumes a one-hour lifetime when Entra omits expires_at", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    const { calls } = routeFetch([
      ["POST", TOKEN_URL, () => Response.json({ access_token: "refreshed", expires_in: 3600 })],
    ]);
    await authConfig().callbacks.jwt({
      token: {},
      account: { providerAccountId: "user-4", access_token: "first", refresh_token: "r" },
      profile: {},
    });

    // Still valid 54 minutes in (expiry 60 min, refreshed 5 min early).
    vi.setSystemTime(new Date("2026-03-01T10:54:00Z"));
    expect(await getTokenManager().getAccessToken("user-4")).toBe("first");
    expect(calls).toHaveLength(0);

    vi.setSystemTime(new Date("2026-03-01T10:56:00Z"));
    expect(await getTokenManager().getAccessToken("user-4")).toBe("refreshed");
    expect(calls).toHaveLength(1);
  });
});

describe("session callback", () => {
  it("exposes the user key and a valid role", () => {
    const session = authConfig().callbacks.session({ session: { user: {} }, token: { uid: "user-1", role: "admin" } });
    expect(session.user).toEqual({ id: "user-1", role: "admin" });
  });

  it("drops a non-string uid and an unknown role", () => {
    const session = authConfig().callbacks.session({ session: { user: {} }, token: { uid: 42, role: "superuser" } });
    expect(session.user).toEqual({ role: undefined });
  });
});

describe("signOut event", () => {
  it("deletes the user's stored Graph tokens", async () => {
    await signInAs({ uid: "user-1" });
    await authConfig().events.signOut({ token: { uid: "user-1" } });
    await expect(getTokenManager().getAccessToken("user-1")).rejects.toBeInstanceOf(ReauthRequiredError);
  });

  it("ignores database-session messages and tokens without a user key", async () => {
    await signInAs({ uid: "user-1" });
    await authConfig().events.signOut({ session: { sessionToken: "s" } });
    await authConfig().events.signOut({ token: null });
    await authConfig().events.signOut({ token: { uid: 7 } });
    expect(await getTokenManager().getAccessToken("user-1")).toBe("access-user-1");
  });
});
