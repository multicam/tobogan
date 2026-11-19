import { describe, expect, it } from "vitest";
import { ensureLibrary, libraryForYear, listYearLibraries } from "../lib/m365/libraries";
import { InvalidInputError } from "../lib/m365/names";
import { graphScope } from "../lib/m365/scopes";
import { grantAppSiteAccess, listAppSiteGrants, type SiteRole } from "../lib/m365/sites";
import { tenantIssuer } from "../lib/m365/tenant";
import { graphWith, json } from "./helpers";

describe("grantAppSiteAccess", () => {
  it("falls back to the requested role when Graph omits roles", async () => {
    const { graph } = graphWith([json({ id: "perm1" }, 201)]);
    expect(await grantAppSiteAccess(graph, "site1", { clientId: "app1", displayName: "App" }, "write")).toEqual({ id: "perm1", roles: ["write"], appId: "app1" });
  });

  it("refuses an unknown role and malformed ids before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(grantAppSiteAccess(graph, "site1", { clientId: "app1", displayName: "App" }, "admin" as SiteRole)).rejects.toThrow("Invalid site role.");
    await expect(grantAppSiteAccess(graph, "a/b", { clientId: "app1", displayName: "App" }, "read")).rejects.toThrow("Invalid site id.");
    await expect(grantAppSiteAccess(graph, "site1", { clientId: "", displayName: "App" }, "read")).rejects.toThrow("Invalid client id.");
    expect(calls).toHaveLength(0);
  });

  it("surfaces a 403 when the caller lacks Sites.FullControl.All", async () => {
    const { graph } = graphWith([json({ error: { code: "accessDenied", message: "Access denied" } }, 403)]);
    await expect(grantAppSiteAccess(graph, "site1", { clientId: "app1", displayName: "App" }, "fullcontrol")).rejects.toMatchObject({ isForbidden: true });
  });
});

describe("listAppSiteGrants", () => {
  it("maps grants, tolerating missing roles and identities", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "p1", roles: ["read"], grantedToIdentitiesV2: [{ application: { id: "app1" } }] }, { id: "p2" }, { id: "p3", grantedToIdentitiesV2: [{}] }] }),
    ]);
    expect(await listAppSiteGrants(graph, "site1")).toEqual([
      { id: "p1", roles: ["read"], appId: "app1" },
      { id: "p2", roles: [], appId: undefined },
      { id: "p3", roles: [], appId: undefined },
    ]);
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/sites/site1/permissions");
  });

  it("rejects a malformed site id", async () => {
    const { graph } = graphWith([]);
    await expect(listAppSiteGrants(graph, "bad id")).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("libraryForYear", () => {
  it("returns undefined without a template and substitutes every {year}", () => {
    expect(libraryForYear(undefined, 2026)).toBeUndefined();
    expect(libraryForYear("", 2026)).toBeUndefined();
    expect(libraryForYear("Matters {year} ({year})", 2026)).toBe("Matters 2026 (2026)");
    expect(libraryForYear("Matters", 2026)).toBe("Matters");
  });

  it.each([1999, 10000, 2026.5, Number.NaN])("rejects year %s", (year) => {
    expect(() => libraryForYear("Matters {year}", year)).toThrow(InvalidInputError);
  });
});

describe("listYearLibraries", () => {
  it("keeps only four-digit years matching the template, newest first", async () => {
    const { graph } = graphWith([
      json({
        value: [
          { id: "d1", name: "Matters 2024" },
          { id: "d2", name: "Matters 2026" },
          { id: "d3", name: "Matters draft" },
          { id: "d4", name: "Documents" },
          { id: "d5", name: "Matters 20261" },
        ],
      }),
    ]);
    expect(await listYearLibraries(graph, "site1", "Matters {year}")).toEqual([
      { year: 2026, name: "Matters 2026", driveId: "d2" },
      { year: 2024, name: "Matters 2024", driveId: "d1" },
    ]);
  });

  it("matches a suffix after the year", async () => {
    const { graph } = graphWith([json({ value: [{ id: "a", name: "FY2025 files" }, { id: "b", name: "FY2025 other" }] })]);
    expect(await listYearLibraries(graph, "s", "FY{year} files")).toEqual([{ year: 2025, name: "FY2025 files", driveId: "a" }]);
  });

  it("requires {year} in the template", async () => {
    const { graph, calls } = graphWith([]);
    await expect(listYearLibraries(graph, "s", "Matters")).rejects.toThrow('The library name has no "{year}".');
    expect(calls).toHaveLength(0);
  });
});

describe("ensureLibrary", () => {
  it("returns an existing library case-insensitively without creating one", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "d1", name: "Matters 2026" }] })]);
    expect(await ensureLibrary(graph, "s", "matters 2026")).toBe("d1");
    expect(calls).toHaveLength(1);
  });

  it("creates a document library and returns its drive id", async () => {
    const { graph, calls } = graphWith([json({ value: [] }), json({ id: "list1" }, 201), json({ id: "drive1" })]);
    expect(await ensureLibrary(graph, "s", "Matters 2027")).toBe("drive1");
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ displayName: "Matters 2027", list: { template: "documentLibrary" } });
    expect(calls[2]!.url).toContain("/sites/s/lists/list1/drive");
  });

  it("fails with noDrive when the new list has no drive", async () => {
    const { graph } = graphWith([json({ value: [] }), json({ id: "list1" }, 201), json({})]);
    await expect(ensureLibrary(graph, "s", "X")).rejects.toMatchObject({ status: 502, code: "noDrive" });
  });

  it("surfaces a 403 when the caller may not create lists", async () => {
    const { graph } = graphWith([json({ value: [] }), json({ error: { code: "accessDenied", message: "denied" } }, 403)]);
    await expect(ensureLibrary(graph, "s", "X")).rejects.toMatchObject({ isForbidden: true });
  });
});

describe("graphScope", () => {
  it("uses Sites.ReadWrite.All for all, and rejects unknown values", () => {
    expect(graphScope("all").split(" ")).toContain("Sites.ReadWrite.All");
    expect(graphScope("all").split(" ")).not.toContain("Sites.Selected");
    expect(graphScope("selected").split(" ")).toEqual(["openid", "profile", "email", "offline_access", "Sites.Selected", "Mail.ReadWrite", "Mail.Send"]);
    expect(() => graphScope("everything")).toThrow('SHAREPOINT_SITE_ACCESS must be "selected" or "all".');
  });
});

describe("tenantIssuer", () => {
  it.each(["72f988bf-86f1-41af-91ab-2d7cd011db47", "contoso.onmicrosoft.com", "law-firm.co.uk"])("accepts %s", (id) => {
    expect(tenantIssuer(id)).toBe(`https://login.microsoftonline.com/${id}/v2.0`);
  });

  it.each(["common", "Organizations", "consumers", "contoso", "not a tenant", "x/../y.com"])("rejects %j", (id) => {
    expect(() => tenantIssuer(id)).toThrow("must be one tenant's id or domain");
  });

  it("rejects a missing tenant id", () => {
    expect(() => tenantIssuer(undefined)).toThrow("Missing environment variable AUTH_MICROSOFT_ENTRA_ID_TENANT_ID");
    expect(() => tenantIssuer("")).toThrow("Missing environment variable");
  });
});
