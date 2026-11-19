import { describe, expect, it } from "vitest";
import { createMatter, listMatters, matterFolderName } from "../lib/m365/matters";
import { assertCan, can, roleFromClaims, type Action } from "../lib/m365/roles";
import { tenantIssuer } from "../lib/m365/tenant";
import { graphWith, json } from "./helpers";

const folder = (over: object = {}) => ({ id: "m1", name: "2026-0042 - Acme v Bolt", webUrl: "https://sp/m1", lastModifiedDateTime: "x", folder: { childCount: 0 }, ...over });

describe("roles", () => {
  it("takes the highest role from the claim and none when absent", () => {
    expect(roleFromClaims(["Associate", "TeamLeader"])).toBe("teamLeader");
    expect(roleFromClaims(["Admin"])).toBe("admin");
    expect(roleFromClaims(["SomethingElse"])).toBeUndefined();
    expect(roleFromClaims(undefined)).toBeUndefined();
    expect(roleFromClaims("Admin")).toBeUndefined();
  });

  const all: Action[] = ["matter.create", "matter.read", "matter.manageTeam", "matter.close", "document.write", "mail.file", "share.external"];

  it("applies the policy matrix", () => {
    expect(all.every((a) => can("admin", a))).toBe(true);
    expect(all.filter((a) => can("teamLeader", a))).toEqual(["matter.create", "matter.read", "document.write", "mail.file"]);
    expect(all.every((a) => can("teamLeader", a, { isMatterLead: true }))).toBe(true);
    expect(all.filter((a) => can("associate", a, { isMatterLead: true }))).toEqual(["matter.read", "document.write", "mail.file"]);
    expect(all.some((a) => can(undefined, a))).toBe(false);
  });

  it("assertCan throws for a denied action", () => {
    expect(() => assertCan("associate", "matter.create")).toThrow("does not allow");
    expect(() => assertCan("teamLeader", "matter.create")).not.toThrow();
  });
});

describe("matters", () => {
  it("validates the matter number and title", () => {
    expect(matterFolderName("2026-0042", " Acme v Bolt ")).toBe("2026-0042 - Acme v Bolt");
    expect(() => matterFolderName("../x", "t")).toThrow("Matter number");
    expect(() => matterFolderName("2026-1", "  ")).toThrow("title");
  });

  it("lists only folders and splits number from title", async () => {
    const { graph } = graphWith([json({ value: [folder(), { ...folder({ id: "f", name: "readme.txt" }), folder: undefined, file: {} }] })]);
    expect((await listMatters(graph, "d")).items).toEqual([{ id: "m1", number: "2026-0042", title: "Acme v Bolt", webUrl: "https://sp/m1" }]);
  });

  it("creates the folder, cuts inheritance on the first grant and never emails", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), json({ value: [{ id: "p2" }] })]);
    const matter = await createMatter(graph, "d", {
      number: "2026-0042",
      title: "Acme v Bolt",
      creatorEmail: "Lead@firm.example",
      team: [
        { email: "Lead@firm.example", role: "write" },
        { email: "assoc@firm.example", role: "write" },
        { email: "clerk@firm.example", role: "read" },
        { email: "lead@firm.example", role: "read" },
      ],
    });
    expect(matter.number).toBe("2026-0042");
    const bodies = calls.slice(1).map((c) => JSON.parse(String(c.body)));
    expect(bodies[0]).toMatchObject({ roles: ["write"], retainInheritedPermissions: false, sendInvitation: false });
    expect(bodies[0].recipients).toEqual([{ email: "lead@firm.example" }, { email: "assoc@firm.example" }]);
    expect(bodies[1]).toMatchObject({ roles: ["read"], recipients: [{ email: "clerk@firm.example" }] });
    expect(bodies[1].retainInheritedPermissions).toBeUndefined();
  });

  it("deletes the folder if it cannot be restricted", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ error: { code: "accessDenied", message: "no" } }, 403), new Response(null, { status: 204 })]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [{ email: "a@firm.example", role: "write" }] })).rejects.toMatchObject({ status: 403 });
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "DELETE"]);
  });

  it("also rolls back when only some members were granted", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }, { error: { code: "x", message: "unknown user" } }] }, 207), new Response(null, { status: 204 })]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [{ email: "a@firm.example", role: "write" }, { email: "b@firm.example", role: "write" }] })).rejects.toMatchObject({ code: "teamGrantFailed" });
    expect(calls.at(-1)!.method).toBe("DELETE");
  });

  it("raises a loud error when rollback itself fails", async () => {
    const { graph } = graphWith([json(folder(), 201), json({}, 403), json({}, 403)]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [{ email: "a@firm.example", role: "write" }] })).rejects.toMatchObject({ code: "matterLeftOpen" });
  });
});

describe("creator access (MATTER-6)", () => {
  it("adds the creator with write access to the first grant when missing from the team", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), json({ value: [{ id: "p2" }] })]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "Creator@firm.example", team: [{ email: "clerk@firm.example", role: "read" }] });
    const bodies = calls.slice(1).map((c) => JSON.parse(String(c.body)));
    expect(bodies[0]).toMatchObject({ roles: ["write"], retainInheritedPermissions: false, recipients: [{ email: "creator@firm.example" }] });
    expect(bodies[1]).toMatchObject({ roles: ["read"], recipients: [{ email: "clerk@firm.example" }] });
  });

  it("upgrades a creator listed as read to write", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] })]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [{ email: "A@firm.example", role: "read" }] });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1]!.body))).toMatchObject({ roles: ["write"], recipients: [{ email: "a@firm.example" }] });
  });

  it("refuses an invalid creator before creating anything", async () => {
    const { graph, calls } = graphWith([]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "", team: [] })).rejects.toThrow("Invalid email");
    expect(calls).toHaveLength(0);
  });
});

describe("tenant issuer (AUTH-4)", () => {
  it("builds a single-tenant issuer", () => {
    expect(tenantIssuer("0f6c5a8e-1b2c-4d3e-8f90-123456789abc")).toBe("https://login.microsoftonline.com/0f6c5a8e-1b2c-4d3e-8f90-123456789abc/v2.0");
    expect(tenantIssuer("contoso.onmicrosoft.com")).toBe("https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0");
  });

  it.each([undefined, "", "common", "organizations", "Consumers", "undefined", "a/b", "x?y"])("refuses %j", (value) => {
    expect(() => tenantIssuer(value)).toThrow();
  });
});
