import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeItemAction, provisioningGraph } from "../lib/m365/authorize";
import { clearDriveCache } from "../lib/m365/drive";
import { createGraphClient } from "../lib/m365/graph-client";
import { ForbiddenError } from "../lib/m365/roles";
import { bearer, graphUrl, libraryRoutes, resetProcessState, routeFetch, signInAs, stubBaseEnv } from "./next-harness";
import "../auth";

vi.mock("next-auth", () => import("./next-harness").then((m) => m.nextAuthModule));

const LEAD = "lead@firm.example";

beforeEach(() => {
  resetProcessState();
  clearDriveCache();
  stubBaseEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provisioningGraph", () => {
  const userGraph = createGraphClient({ getAccessToken: async () => "user-token" });

  it("acts as the app by default (MATTER-7)", async () => {
    const { calls } = routeFetch([...libraryRoutes(), ["GET", graphUrl("/sites/root"), () => Response.json({ id: "s" })]]);
    const graph = provisioningGraph(userGraph);
    expect(graph).not.toBe(userGraph);
    await graph.request("GET", "/sites/root");
    expect(bearer(calls.at(-1)!)).toBe("app-token");
  });

  it("acts as the user when MATTER_PROVISIONING=delegated", () => {
    vi.stubEnv("MATTER_PROVISIONING", "delegated");
    expect(provisioningGraph(userGraph)).toBe(userGraph);
  });

  it("rejects an invalid provisioning mode", () => {
    vi.stubEnv("MATTER_PROVISIONING", "both");
    expect(() => provisioningGraph(userGraph)).toThrow("MATTER_PROVISIONING");
  });
});

describe("authorizeItemAction", () => {
  it("lets the matter's lead close it, reading the lead from the matter column", async () => {
    await signInAs({ uid: "u1", email: "Lead@Firm.Example", roles: ["TeamLeader"] });
    const { calls } = routeFetch(libraryRoutes({ lead: LEAD }));
    const result = await authorizeItemAction("matter.close", "d1");
    expect(result).toMatchObject({ matterId: "m1", driveId: "drive-1", siteId: "site-1", userId: "u1", role: "teamLeader" });

    // The item walk uses the user's own token; the lead column is read as the app.
    const walk = calls.filter((c) => /\/items\/(d1|m1)\?/.test(c.url));
    expect(walk.map(bearer)).toEqual(["access-u1", "access-u1"]);
    const fields = calls.find((c) => c.url.includes("/fields"))!;
    expect(bearer(fields)).toBe("app-token");
    expect(result.admin).toBeDefined();
  });

  it("refuses a team leader who does not lead the matter", async () => {
    await signInAs({ uid: "u2", email: "other@firm.example", roles: ["TeamLeader"] });
    routeFetch(libraryRoutes({ lead: LEAD }));
    await expect(authorizeItemAction("matter.manageTeam", "d1")).rejects.toThrow(new ForbiddenError("Your role does not allow: matter.manageTeam"));
  });

  it("treats a user without an email as not leading anything", async () => {
    await signInAs({ uid: "u3", roles: ["TeamLeader"] });
    routeFetch(libraryRoutes({ lead: LEAD }));
    await expect(authorizeItemAction("share.external", "m1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows items outside any matter only for roles that need no lead", async () => {
    await signInAs({ uid: "u4", email: LEAD, roles: ["TeamLeader"] });
    const { calls } = routeFetch(libraryRoutes({ lead: LEAD }));
    await expect(authorizeItemAction("matter.close", "root-id")).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.some((c) => c.url.includes("/fields"))).toBe(false);

    await signInAs({ uid: "u5", roles: ["Admin"] });
    expect((await authorizeItemAction("matter.close", "root-id")).matterId).toBeUndefined();
  });

  it("uses the user's client for everything in delegated mode", async () => {
    vi.stubEnv("MATTER_PROVISIONING", "delegated");
    await signInAs({ uid: "u1", email: LEAD, roles: ["TeamLeader"] });
    const { calls } = routeFetch(libraryRoutes({ lead: LEAD }));
    await authorizeItemAction("matter.manageTeam", "m1");
    expect(new Set(calls.map(bearer))).toEqual(new Set(["access-u1"]));
  });

  it("propagates Graph's 404 when the user cannot see the item", async () => {
    await signInAs({ uid: "u5", roles: ["Admin"] });
    routeFetch(libraryRoutes());
    await expect(authorizeItemAction("matter.close", "secret")).rejects.toMatchObject({ status: 404, code: "itemNotFound" });
  });

  it("rejects a malformed item id before calling Graph", async () => {
    await signInAs({ uid: "u5", roles: ["Admin"] });
    const { calls } = routeFetch(libraryRoutes());
    await expect(authorizeItemAction("matter.close", "../root")).rejects.toThrow("Invalid id.");
    expect(calls.some((c) => c.url.includes("/items/"))).toBe(false);
  });

  it("requires a session", async () => {
    await expect(authorizeItemAction("matter.read", "d1")).rejects.toThrow("sign-in required");
  });
});
