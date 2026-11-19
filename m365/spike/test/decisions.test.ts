import { describe, expect, it } from "vitest";
import { ensureLibrary, libraryForYear, listYearLibraries } from "../lib/m365/libraries";
import { isFirmEmail } from "../lib/m365/names";
import { can } from "../lib/m365/roles";
import { graphWith, json } from "./helpers";

describe("sharing inside and outside the firm (POLICY-4, POLICY-6)", () => {
  it("lets every role share inside the firm, and only admins and leads outside", () => {
    expect(["admin", "teamLeader", "associate"].every((r) => can(r as never, "share.internal"))).toBe(true);
    expect(can("associate", "share.external", { isMatterLead: true })).toBe(false);
    expect(can("teamLeader", "share.external")).toBe(false);
    expect(can("teamLeader", "share.external", { isMatterLead: true })).toBe(true);
    expect(can(undefined, "share.internal")).toBe(false);
  });

  it("classifies addresses by exact firm domain", () => {
    const firm = ["firm.example", "Firm-Law.example"];
    expect(isFirmEmail("Ada@FIRM.example", firm)).toBe(true);
    expect(isFirmEmail("bob@firm-law.example", firm)).toBe(true);
    expect(isFirmEmail("eve@notfirm.example", firm)).toBe(false);
    expect(isFirmEmail("eve@firm.example.evil.example", firm)).toBe(false);
    expect(isFirmEmail("eve@sub.firm.example", firm)).toBe(false);
    expect(isFirmEmail("ada@firm.example", [])).toBe(false);
    expect(isFirmEmail("no-at-sign", firm)).toBe(false);
  });
});

describe("one library per year (MATTER-10)", () => {
  it("fills the year into the name", () => {
    expect(libraryForYear("Matters {year}", 2026)).toBe("Matters 2026");
    expect(libraryForYear("Documents", 2026)).toBe("Documents");
    expect(libraryForYear(undefined, 2026)).toBeUndefined();
    expect(() => libraryForYear("Matters {year}", 26)).toThrow("year");
  });

  it("lists the yearly libraries newest first and ignores others", async () => {
    const { graph } = graphWith([
      json({ value: [{ id: "d1", name: "Matters 2025" }, { id: "d2", name: "Documents" }, { id: "d3", name: "Matters 2026" }, { id: "d4", name: "Matters 2026 old" }, { id: "d5", name: "Matters 20x6" }] }),
    ]);
    expect(await listYearLibraries(graph, "s1", "Matters {year}")).toEqual([
      { year: 2026, name: "Matters 2026", driveId: "d3" },
      { year: 2025, name: "Matters 2025", driveId: "d1" },
    ]);
  });

  it("reuses an existing library", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "d3", name: "Matters 2026" }] })]);
    expect(await ensureLibrary(graph, "s1", "matters 2026")).toBe("d3");
    expect(calls).toHaveLength(1);
  });

  it("creates a missing library and returns its drive", async () => {
    const { graph, calls } = graphWith([json({ value: [] }), json({ id: "L9" }, 201), json({ id: "d9" })]);
    expect(await ensureLibrary(graph, "s1", "Matters 2027")).toBe("d9");
    expect(JSON.parse(String(calls[1]!.body))).toEqual({ displayName: "Matters 2027", list: { template: "documentLibrary" } });
    expect(calls[2]!.url).toContain("/sites/s1/lists/L9/drive");
  });
});
