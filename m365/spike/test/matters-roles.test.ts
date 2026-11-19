import { beforeEach, describe, expect, it } from "vitest";
import { clearListCache, closeMatter, createMatter, ensureMatterColumns, isMatterLead, listMatters, matterFolderName, matterOfItem } from "../lib/m365/matters";
import { assertCan, can, roleFromClaims, type Action } from "../lib/m365/roles";
import { tenantIssuer } from "../lib/m365/tenant";
import { graphWith, json } from "./helpers";

beforeEach(() => clearListCache());

/** Replies for recording the matter columns after the grants. */
const fieldReplies = () => [json({ id: "L", parentReference: { siteId: "S" } }), json({ id: "7" }), json({})];

const folder = (over: object = {}) => ({ id: "m1", name: "2026-0042 - Acme v Bolt", webUrl: "https://sp/m1", lastModifiedDateTime: "x", folder: { childCount: 0 }, ...over });

describe("roles", () => {
  it("takes the highest role from the claim and none when absent", () => {
    expect(roleFromClaims(["Associate", "TeamLeader"])).toBe("teamLeader");
    expect(roleFromClaims(["Admin"])).toBe("admin");
    expect(roleFromClaims(["SomethingElse"])).toBeUndefined();
    expect(roleFromClaims(undefined)).toBeUndefined();
    expect(roleFromClaims("Admin")).toBeUndefined();
  });

  const all: Action[] = ["matter.create", "matter.read", "matter.manageTeam", "matter.close", "document.write", "mail.file", "share.internal", "share.external"];

  it("applies the policy matrix", () => {
    expect(all.every((a) => can("admin", a))).toBe(true);
    expect(all.filter((a) => can("teamLeader", a))).toEqual(["matter.create", "matter.read", "document.write", "mail.file", "share.internal"]);
    expect(all.every((a) => can("teamLeader", a, { isMatterLead: true }))).toBe(true);
    expect(all.filter((a) => can("associate", a, { isMatterLead: true }))).toEqual(["matter.read", "document.write", "mail.file", "share.internal"]);
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
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), json({ value: [{ id: "p2" }] }), ...fieldReplies()]);
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
    const bodies = calls.slice(1, 3).map((c) => JSON.parse(String(c.body)));
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
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), json({ value: [{ id: "p2" }] }), ...fieldReplies()]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "Creator@firm.example", team: [{ email: "clerk@firm.example", role: "read" }] });
    const bodies = calls.slice(1, 3).map((c) => JSON.parse(String(c.body)));
    expect(bodies[0]).toMatchObject({ roles: ["write"], retainInheritedPermissions: false, recipients: [{ email: "creator@firm.example" }] });
    expect(bodies[1]).toMatchObject({ roles: ["read"], recipients: [{ email: "clerk@firm.example" }] });
  });

  it("upgrades a creator listed as read to write", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), ...fieldReplies()]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [{ email: "A@firm.example", role: "read" }] });
    expect(calls.filter((c) => c.url.endsWith("/invite"))).toHaveLength(1);
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

describe("matter columns and lead (POLICY-4)", () => {
  it("records number, lead and status after the grants", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), ...fieldReplies()]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "admin@firm.example", leadEmail: "Lead@firm.example", team: [] });
    const invite = JSON.parse(String(calls[1]!.body));
    expect(invite.recipients).toEqual([{ email: "admin@firm.example" }, { email: "lead@firm.example" }]);
    const patch = calls.at(-1)!;
    expect(patch.method).toBe("PATCH");
    expect(patch.url).toBe("https://graph.microsoft.com/v1.0/sites/S/lists/L/items/7/fields");
    expect(JSON.parse(String(patch.body))).toEqual({ MatterNumber: "2026-0042", MatterLead: "lead@firm.example", MatterStatus: "Open" });
  });

  it("grants the admin group in the first, inheritance-cutting grant", async () => {
    const group = "0f6c5a8e-1b2c-4d3e-8f90-123456789abc";
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }, { id: "p2" }] }), ...fieldReplies()]);
    await createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [], firmWideGroupIds: [group] });
    expect(JSON.parse(String(calls[1]!.body))).toMatchObject({ retainInheritedPermissions: false, recipients: [{ email: "a@firm.example" }, { objectId: group }] });
  });

  it("deletes the folder when the columns cannot be written", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }] }), json({ id: "L", parentReference: { siteId: "S" } }), json({ id: "7" }), json({ error: { code: "invalidRequest", message: "Field MatterLead not recognized" } }, 400), new Response(null, { status: 204 })]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", creatorEmail: "a@firm.example", team: [] })).rejects.toMatchObject({ status: 400 });
    expect(calls.at(-1)!.method).toBe("DELETE");
  });

  it("compares the recorded lead case-insensitively and denies when none is recorded", async () => {
    const lead = graphWith([json({ id: "L", parentReference: { siteId: "S" } }), json({ id: "7" }), json({ MatterLead: "Lead@Firm.example", MatterStatus: "Open" })]);
    expect(await isMatterLead(lead.graph, "d", "m1", "lead@firm.example")).toBe(true);
    const none = graphWith([json({ id: "7" }), json({})]);
    expect(await isMatterLead(none.graph, "d", "m1", "lead@firm.example")).toBe(false);
    expect(await isMatterLead(none.graph, "d", "m1", undefined)).toBe(false);
  });

  it("creates only the missing columns, indexed", async () => {
    const { graph, calls } = graphWith([json({ id: "L", parentReference: { siteId: "S" } }), json({ value: [{ name: "Title" }, { name: "MatterNumber" }] }), json({}), json({})]);
    expect(await ensureMatterColumns(graph, "d")).toEqual(["MatterLead", "MatterStatus"]);
    const bodies = calls.filter((c) => c.method === "POST").map((c) => JSON.parse(String(c.body)));
    expect(bodies.every((b) => b.indexed === true)).toBe(true);
    expect(bodies[1].choice.choices).toEqual(["Open", "Closed"]);
  });
});

describe("closing a matter", () => {
  it("downgrades write to read, removes links, keeps inherited and owner entries, records Closed and labels", async () => {
    const { graph, calls } = graphWith([
      json({ value: [
        { id: "w1", roles: ["write"], grantedToV2: { user: { displayName: "Ada" } } },
        { id: "r1", roles: ["read"], grantedToV2: { user: { displayName: "Bob" } } },
        { id: "o1", roles: ["owner"] },
        { id: "i1", roles: ["write"], inheritedFrom: { id: "root" } },
        { id: "l1", roles: ["read"], link: { scope: "organization" } },
      ] }),
      new Response(null, { status: 204 }),
      json({ id: "l1", roles: ["read"], link: { scope: "organization" } }),
      new Response(null, { status: 204 }),
      json({ id: "L", parentReference: { siteId: "S" } }),
      json({ id: "7" }),
      json({}),
      json({ name: "Matter closed" }),
    ]);
    expect(await closeMatter(graph, "d", "m1", { retentionLabel: "Matter closed" })).toEqual({ downgraded: 1, linksRemoved: 1 });
    const writes = calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(writes).toEqual([
      "PATCH /v1.0/drives/d/items/m1/permissions/w1",
      "DELETE /v1.0/drives/d/items/m1/permissions/l1",
      "PATCH /v1.0/sites/S/lists/L/items/7/fields",
      "PATCH /v1.0/drives/d/items/m1/retentionLabel",
    ]);
  });
});

describe("matterOfItem", () => {
  it("walks up to the folder directly under the drive root", async () => {
    const { graph } = graphWith([
      json({ id: "doc", parentReference: { id: "sub" } }),
      json({ id: "root1" }),
      json({ id: "sub", parentReference: { id: "m1" } }),
      json({ id: "m1", parentReference: { id: "root1" } }),
    ]);
    expect(await matterOfItem(graph, "d", "doc")).toBe("m1");
  });

  it("returns undefined for the drive root", async () => {
    const { graph } = graphWith([json({ id: "root1" })]);
    expect(await matterOfItem(graph, "d2", "root1")).toBeUndefined();
  });
});
