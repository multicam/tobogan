import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, delegatedScope, firmDomains, firmWideGroupIds, matterProvisioning, tenantIssuer } from "../lib/m365/config";
import { ADMIN_GROUP, LEADERS_GROUP, stubBaseEnv, TENANT_ID } from "./next-harness";

beforeEach(() => stubBaseEnv());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("config", () => {
  it("reads the Entra app settings lazily from the environment", () => {
    expect(config.tenantId).toBe(TENANT_ID);
    expect(config.clientId).toBe("test-client-id");
    expect(config.clientSecret).toBe("test-placeholder-not-a-secret");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "changed");
    expect(config.clientId).toBe("changed");
  });

  it("names the missing variable instead of returning undefined", () => {
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "");
    expect(() => config.clientSecret).toThrow("Missing environment variable AUTH_MICROSOFT_ENTRA_ID_SECRET");
    vi.stubEnv("SHAREPOINT_HOSTNAME", "");
    expect(() => config.sharePoint).toThrow("SHAREPOINT_HOSTNAME");
  });

  it("uses the site's default library when no library name is set", () => {
    expect(config.sharePoint).toEqual({ hostname: "contoso.sharepoint.com", sitePath: "/sites/legal", libraryName: undefined });
  });

  it("fills {year} in the library name with the current UTC year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-12-31T23:30:00Z"));
    vi.stubEnv("SHAREPOINT_LIBRARY_NAME", "Matters {year}");
    expect(config.sharePoint.libraryName).toBe("Matters 2027");
    vi.stubEnv("SHAREPOINT_LIBRARY_NAME", "Documents");
    expect(config.sharePoint.libraryName).toBe("Documents");
  });

  it("re-exports the single-tenant issuer check", () => {
    expect(tenantIssuer(TENANT_ID)).toBe(`https://login.microsoftonline.com/${TENANT_ID}/v2.0`);
  });
});

describe("delegatedScope", () => {
  it("defaults to Sites.Selected", () => {
    expect(delegatedScope().split(" ")).toContain("Sites.Selected");
    expect(delegatedScope().split(" ")).toContain("offline_access");
  });

  it("switches to Sites.ReadWrite.All when SHAREPOINT_SITE_ACCESS=all", () => {
    vi.stubEnv("SHAREPOINT_SITE_ACCESS", "all");
    expect(delegatedScope().split(" ")).toContain("Sites.ReadWrite.All");
    expect(delegatedScope()).not.toContain("Sites.Selected");
  });

  it("rejects an unknown site access mode", () => {
    vi.stubEnv("SHAREPOINT_SITE_ACCESS", "some");
    expect(() => delegatedScope()).toThrow("SHAREPOINT_SITE_ACCESS");
  });
});

describe("matterProvisioning", () => {
  it('defaults to "app"', () => {
    expect(matterProvisioning()).toBe("app");
  });

  it('accepts "delegated" and "app"', () => {
    vi.stubEnv("MATTER_PROVISIONING", "delegated");
    expect(matterProvisioning()).toBe("delegated");
    vi.stubEnv("MATTER_PROVISIONING", "app");
    expect(matterProvisioning()).toBe("app");
  });

  it("rejects anything else", () => {
    vi.stubEnv("MATTER_PROVISIONING", "user");
    expect(() => matterProvisioning()).toThrow('MATTER_PROVISIONING must be "app" or "delegated".');
  });
});

describe("firmWideGroupIds", () => {
  it("returns the admin group first, then the team leaders group", () => {
    expect(firmWideGroupIds()).toEqual([ADMIN_GROUP, LEADERS_GROUP]);
  });

  it.each(["MATTER_ADMIN_GROUP_ID", "MATTER_LEADERS_GROUP_ID"])("refuses to run without %s", (name) => {
    vi.stubEnv(name, "");
    expect(() => firmWideGroupIds()).toThrow("POLICY-7, POLICY-8");
  });
});

describe("firmDomains", () => {
  it("splits, trims, lower-cases and drops empty entries", () => {
    vi.stubEnv("FIRM_EMAIL_DOMAINS", " Firm.Example , ,other.example,");
    expect(firmDomains()).toEqual(["firm.example", "other.example"]);
  });

  it("is empty when unset, so every address counts as external", () => {
    vi.stubEnv("FIRM_EMAIL_DOMAINS", "");
    expect(firmDomains()).toEqual([]);
    delete process.env.FIRM_EMAIL_DOMAINS;
    expect(firmDomains()).toEqual([]);
  });
});
