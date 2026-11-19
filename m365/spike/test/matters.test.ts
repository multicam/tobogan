import { beforeEach, describe, expect, it } from "vitest";
import { GraphError } from "../lib/m365/graph-client";
import {
  addMatterMembers,
  clearListCache,
  closeMatter,
  createMatter,
  ensureMatterColumns,
  getListRef,
  getMatterFields,
  isMatterLead,
  listMatters,
  listMatterTeam,
  MATTER_COLUMNS,
  matterFolderName,
  matterOfItem,
  removeMatterMember,
  setMatterFields,
} from "../lib/m365/matters";
import { InvalidInputError } from "../lib/m365/names";
import { graphWith, json, type Call } from "./helpers";

const G = "https://graph.microsoft.com/v1.0";
const ADMINS = "0f8fad5b-d9cb-469f-a165-70867728950e";
const LEADERS = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const bodyOf = (call: Call) => JSON.parse(call.body as string);
const route = (call: Call) => `${call.method} ${call.url.replace(G, "").split("?")[0]}`;
const noContent = () => new Response(null, { status: 204 });
const list = (siteId = "s1") => json({ id: "l1", parentReference: { siteId } });

beforeEach(() => clearListCache());

describe("matterFolderName", () => {
  it("joins number and trimmed title", () => {
    expect(matterFolderName("M-2026-001", "  Acme v Bloggs ")).toBe("M-2026-001 - Acme v Bloggs");
  });

  it.each([["m-1"], ["A"], ["-AB"], ["AB_1"], ["A".repeat(32)]])("rejects matter number %j", (number) => {
    expect(() => matterFolderName(number, "Title")).toThrow(InvalidInputError);
  });

  it("requires a title", () => {
    expect(() => matterFolderName("AB", "   ")).toThrow("Matter title is required.");
  });
});

describe("getListRef", () => {
  it("looks the list up once per drive", async () => {
    const { graph, calls } = graphWith([list()]);
    expect(await getListRef(graph, "d1")).toEqual({ siteId: "s1", listId: "l1" });
    expect(await getListRef(graph, "d1")).toEqual({ siteId: "s1", listId: "l1" });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("$select")).toBe("id,parentReference");
  });

  it("looks it up again after the cache is cleared", async () => {
    const { graph, calls } = graphWith([list(), list("s2")]);
    await getListRef(graph, "d1");
    clearListCache();
    expect(await getListRef(graph, "d1")).toEqual({ siteId: "s2", listId: "l1" });
    expect(calls).toHaveLength(2);
  });

  it("fails when Graph returns no site id, and does not cache the failure", async () => {
    const { graph } = graphWith([json({ id: "l1" }), json({ id: "l1", parentReference: {} }), list()]);
    await expect(getListRef(graph, "d1")).rejects.toMatchObject({ status: 502, code: "noSite" });
    await expect(getListRef(graph, "d1")).rejects.toMatchObject({ code: "noSite" });
    expect(await getListRef(graph, "d1")).toEqual({ siteId: "s1", listId: "l1" });
  });

  it("surfaces a 403 when the user cannot read the list", async () => {
    const { graph } = graphWith([json({ error: { code: "accessDenied" } }, 403)]);
    await expect(getListRef(graph, "d1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("ensureMatterColumns", () => {
  it("creates only the missing columns, indexed, with Open as the status default", async () => {
    const { graph, calls } = graphWith([list(), json({ value: [{ name: "MatterNumber" }, { name: "Title" }] }), json({}), json({})]);
    expect(await ensureMatterColumns(graph, "d1")).toEqual(["MatterLead", "MatterStatus"]);
    expect(calls.map(route)).toEqual([
      "GET /drives/d1/list",
      "GET /sites/s1/lists/l1/columns",
      "POST /sites/s1/lists/l1/columns",
      "POST /sites/s1/lists/l1/columns",
    ]);
    expect(bodyOf(calls[2]!)).toEqual({ name: "MatterLead", text: {}, indexed: true });
    expect(bodyOf(calls[3]!)).toEqual({
      name: "MatterStatus",
      choice: { choices: ["Open", "Closed"] },
      indexed: true,
      defaultValue: { value: "Open" },
    });
  });

  it("does nothing when every column exists", async () => {
    const { graph, calls } = graphWith([list(), json({ value: Object.values(MATTER_COLUMNS).map((name) => ({ name })) })]);
    expect(await ensureMatterColumns(graph, "d1")).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("surfaces a 403 when the caller cannot manage the list", async () => {
    const { graph } = graphWith([list(), json({ value: [] }), json({ error: { code: "accessDenied", message: "no" } }, 403)]);
    await expect(ensureMatterColumns(graph, "d1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("matter fields", () => {
  it("writes only the given fields, lower-casing the lead", async () => {
    const { graph, calls } = graphWith([list(), json({ id: "42" }), noContent()]);
    await setMatterFields(graph, "d1", "m1", { lead: "Jane@Firm.Example", status: "Closed" });
    expect(calls.map(route)).toEqual(["GET /drives/d1/list", "GET /drives/d1/items/m1/listItem", "PATCH /sites/s1/lists/l1/items/42/fields"]);
    expect(bodyOf(calls[2]!)).toEqual({ MatterLead: "jane@firm.example", MatterStatus: "Closed" });
  });

  it("writes the number alone", async () => {
    const { graph, calls } = graphWith([list(), json({ id: "42" }), noContent()]);
    await setMatterFields(graph, "d1", "m1", { number: "AB-1" });
    expect(bodyOf(calls[2]!)).toEqual({ MatterNumber: "AB-1" });
  });

  it("rejects an invalid lead or item id before writing", async () => {
    const { graph, calls } = graphWith([list()]);
    await expect(setMatterFields(graph, "d1", "m1", { lead: "nobody" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(getMatterFields(graph, "d1", "a/b")).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("reads the fields, lower-casing the lead and ignoring unknown status values and non-strings", async () => {
    const ok = graphWith([list(), json({ id: "42" }), json({ MatterNumber: "AB-1", MatterLead: "Jane@Firm.Example", MatterStatus: "Open" })]);
    expect(await getMatterFields(ok.graph, "d1", "m1")).toEqual({ number: "AB-1", lead: "jane@firm.example", status: "Open" });
    expect(new URL(ok.calls[2]!.url).searchParams.get("$select")).toBe("MatterNumber,MatterLead,MatterStatus");

    const odd = graphWith([list(), json({ id: "42" }), json({ MatterNumber: 7, MatterStatus: "Archived" })]);
    expect(await getMatterFields(odd.graph, "d1", "m1")).toEqual({ number: undefined, lead: undefined, status: undefined });

    const empty = graphWith([list(), json({ id: "42" }), new Response(null, { status: 200 })]);
    expect(await getMatterFields(empty.graph, "d1", "m1")).toEqual({ number: undefined, lead: undefined, status: undefined });
  });

  it("surfaces 404 for an item with no list item", async () => {
    const { graph } = graphWith([list(), json({ error: { code: "itemNotFound" } }, 404)]);
    await expect(getMatterFields(graph, "d1", "m1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("isMatterLead", () => {
  const fields = (lead?: string) => [list(), json({ id: "42" }), json(lead ? { MatterLead: lead } : {})];

  it("compares the recorded lead case-insensitively", async () => {
    expect(await isMatterLead(graphWith(fields("jane@firm.example")).graph, "d1", "m1", "JANE@firm.example")).toBe(true);
    clearListCache();
    expect(await isMatterLead(graphWith(fields("jane@firm.example")).graph, "d1", "m1", "bob@firm.example")).toBe(false);
  });

  it("is false with no recorded lead or no email, without asking Graph for the latter", async () => {
    expect(await isMatterLead(graphWith(fields()).graph, "d1", "m1", "jane@firm.example")).toBe(false);
    const { graph, calls } = graphWith([]);
    expect(await isMatterLead(graph, "d1", "m1", undefined)).toBe(false);
    expect(await isMatterLead(graph, "d1", "m1", "")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("listMatters", () => {
  it("returns only folders, split into number and title, with the cursor", async () => {
    const next = `${G}/drives/d1/root/children?$skiptoken=2`;
    const { graph, calls } = graphWith([
      json({
        value: [
          { id: "f1", name: "AB-1 - Acme", folder: { childCount: 1 }, webUrl: "https://sp/f1" },
          { id: "x", name: "readme.txt", file: {}, webUrl: "https://sp/x" },
          { id: "f2", name: "Loose folder", folder: {}, webUrl: "https://sp/f2" },
          { id: "f3", name: " - no number", folder: {}, webUrl: "https://sp/f3" },
        ],
        "@odata.nextLink": next,
      }),
    ]);
    const page = await listMatters(graph, "d1");
    expect(calls[0]!.url).toContain("/drives/d1/root/children");
    expect(page).toEqual({
      items: [
        { id: "f3", number: " - no number", title: "", webUrl: "https://sp/f3" },
        { id: "f1", number: "AB-1", title: "Acme", webUrl: "https://sp/f1" },
        { id: "f2", number: "Loose folder", title: "", webUrl: "https://sp/f2" },
      ],
      nextLink: next,
    });
  });

  it("continues from a cursor under a matters folder", async () => {
    const cursor = `${G}/drives/d1/items/mf/children?$skiptoken=3`;
    const { graph, calls } = graphWith([json({ value: [] })]);
    expect(await listMatters(graph, "d1", "mf", { cursor })).toEqual({ items: [], nextLink: undefined });
    expect(calls[0]!.url).toBe(cursor);
  });
});

describe("createMatter", () => {
  const input = {
    number: "AB-1",
    title: "Acme",
    creatorEmail: "Creator@Firm.Example",
    leadEmail: "lead@firm.example",
    team: [
      { email: "w@firm.example", role: "write" as const },
      { email: "r@firm.example", role: "read" as const },
      { email: "LEAD@firm.example", role: "read" as const }, // the higher role wins
    ],
    firmWideGroupIds: [ADMINS, LEADERS],
  };
  const folder = () => json({ id: "m1", name: "AB-1 - Acme", folder: {}, webUrl: "https://sp/m1" }, 201);
  const granted = () => json({ value: [{ id: "p" }] });

  it("creates the folder, cuts inheritance in the first write grant, then records the fields", async () => {
    const { graph, calls } = graphWith([folder(), granted(), granted(), list(), json({ id: "42" }), noContent()]);
    const matter = await createMatter(graph, "d1", input);
    expect(matter).toEqual({ id: "m1", number: "AB-1", title: "Acme", webUrl: "https://sp/m1" });
    expect(calls.map(route)).toEqual([
      "POST /drives/d1/root/children",
      "POST /drives/d1/items/m1/invite",
      "POST /drives/d1/items/m1/invite",
      "GET /drives/d1/list",
      "GET /drives/d1/items/m1/listItem",
      "PATCH /sites/s1/lists/l1/items/42/fields",
    ]);
    expect(bodyOf(calls[0]!)).toMatchObject({ name: "AB-1 - Acme", "@microsoft.graph.conflictBehavior": "fail" });
    expect(bodyOf(calls[1]!)).toMatchObject({
      recipients: [{ email: "creator@firm.example" }, { email: "lead@firm.example" }, { email: "w@firm.example" }, { objectId: ADMINS }, { objectId: LEADERS }],
      roles: ["write"],
      sendInvitation: false,
      retainInheritedPermissions: false,
    });
    const second = bodyOf(calls[2]!);
    expect(second).toMatchObject({ recipients: [{ email: "r@firm.example" }], roles: ["read"] });
    expect(second.retainInheritedPermissions).toBeUndefined();
    expect(bodyOf(calls[5]!)).toEqual({ MatterNumber: "AB-1", MatterLead: "lead@firm.example", MatterStatus: "Open" });
  });

  it("defaults the lead to the creator and works without groups, under a matters folder", async () => {
    const { graph, calls } = graphWith([folder(), granted(), list(), json({ id: "42" }), noContent()]);
    await createMatter(graph, "d1", { number: "AB-1", title: "Acme", creatorEmail: "c@firm.example", team: [], mattersFolderId: "mf" });
    expect(route(calls[0]!)).toBe("POST /drives/d1/items/mf/children");
    const grant = bodyOf(calls[1]!);
    expect(grant.recipients).toEqual([{ email: "c@firm.example" }]);
    expect(bodyOf(calls[4]!).MatterLead).toBe("c@firm.example");
  });

  it("does not send an empty group list", async () => {
    const { graph, calls } = graphWith([folder(), granted(), list(), json({ id: "42" }), noContent()]);
    await createMatter(graph, "d1", { number: "AB-1", title: "Acme", creatorEmail: "c@firm.example", team: [], firmWideGroupIds: [] });
    expect(bodyOf(calls[1]!).recipients).toEqual([{ email: "c@firm.example" }]);
  });

  it("validates everything before creating anything", async () => {
    const { graph, calls } = graphWith([]);
    await expect(createMatter(graph, "d1", { ...input, number: "bad" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(createMatter(graph, "d1", { ...input, creatorEmail: "x" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(createMatter(graph, "d1", { ...input, leadEmail: "x" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(createMatter(graph, "d1", { ...input, firmWideGroupIds: ["admins"] })).rejects.toThrow("Invalid group id.");
    expect(calls).toHaveLength(0);
  });

  it("surfaces a name conflict without any rollback", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "nameAlreadyExists", message: "exists" } }, 409)]);
    const error = (await createMatter(graph, "d1", input).catch((e) => e)) as GraphError;
    expect(error.isConflict).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("deletes the folder when a team member cannot be granted", async () => {
    const { graph, calls } = graphWith([
      folder(),
      json({ value: [{ id: "p" }, { error: { code: "invalidRequest", message: "w@firm.example not found" } }] }, 207),
      noContent(),
    ]);
    await expect(createMatter(graph, "d1", input)).rejects.toMatchObject({
      status: 424,
      code: "teamGrantFailed",
      message: "Could not grant access to every team member: w@firm.example not found",
    });
    expect(route(calls[2]!)).toBe("DELETE /drives/d1/items/m1");
  });

  it("deletes the folder when recording the fields fails, and rethrows the original error", async () => {
    const { graph, calls } = graphWith([folder(), granted(), granted(), list(), json({ id: "42" }), json({ error: { code: "generalException" } }, 500), noContent()]);
    await expect(createMatter(graph, "d1", input)).rejects.toMatchObject({ status: 500, code: "generalException" });
    expect(route(calls.at(-1)!)).toBe("DELETE /drives/d1/items/m1");
  });

  it("reports a matter left open when the rollback delete also fails", async () => {
    const { graph } = graphWith([folder(), json({ error: { code: "serviceNotAvailable" } }, 503), json({ error: { code: "accessDenied" } }, 403)]);
    await expect(createMatter(graph, "d1", input)).rejects.toMatchObject({ status: 500, code: "matterLeftOpen" });
  });
});

describe("team changes", () => {
  it("lists the matter's permissions", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "p1", roles: ["write"], grantedToV2: { user: { displayName: "Jane" } } }] })]);
    expect(await listMatterTeam(graph, "d1", "m1")).toEqual([expect.objectContaining({ id: "p1", grantedTo: ["Jane"] })]);
    expect(route(calls[0]!)).toBe("GET /drives/d1/items/m1/permissions");
  });

  it("adds members grouped by role, de-duplicated, and collects failures", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "p1" }] }),
      json({ value: [{ error: { code: "notFound", message: "r@x.example" } }] }, 207),
    ]);
    const result = await addMatterMembers(graph, "d1", "m1", [
      { email: "r@x.example", role: "read" },
      { email: "W@x.example", role: "read" },
      { email: "w@x.example", role: "write" },
    ]);
    expect(result).toEqual({ failed: [{ code: "notFound", message: "r@x.example" }] });
    expect(bodyOf(calls[0]!)).toMatchObject({ recipients: [{ email: "w@x.example" }], roles: ["write"], sendInvitation: false });
    expect(bodyOf(calls[1]!)).toMatchObject({ recipients: [{ email: "r@x.example" }], roles: ["read"] });
  });

  it("adds nobody for an empty list", async () => {
    const { graph, calls } = graphWith([]);
    expect(await addMatterMembers(graph, "d1", "m1", [])).toEqual({ failed: [] });
    expect(calls).toHaveLength(0);
  });

  it("removes a member's direct permission", async () => {
    const { graph, calls } = graphWith([json({ id: "p1" }), noContent()]);
    await removeMatterMember(graph, "d1", "m1", "p1");
    expect(calls.map(route)).toEqual(["GET /drives/d1/items/m1/permissions/p1", "DELETE /drives/d1/items/m1/permissions/p1"]);
  });
});

describe("closeMatter", () => {
  const permissions = json({
    value: [
      { id: "owner", roles: ["owner"] },
      { id: "inh", roles: ["write"], inheritedFrom: { id: "root" } },
      { id: "link", roles: ["read"], link: { scope: "organization" } },
      { id: "writer", roles: ["write"] },
      { id: "reader", roles: ["read"] },
    ],
  });

  it("downgrades writers, removes links, keeps owners/inherited/readers, and marks it Closed", async () => {
    const { graph, calls } = graphWith([
      permissions,
      json({ id: "link" }),
      noContent(),
      noContent(),
      list(),
      json({ id: "42" }),
      noContent(),
    ]);
    expect(await closeMatter(graph, "d1", "m1")).toEqual({ downgraded: 1, linksRemoved: 1 });
    expect(calls.map(route)).toEqual([
      "GET /drives/d1/items/m1/permissions",
      "GET /drives/d1/items/m1/permissions/link",
      "DELETE /drives/d1/items/m1/permissions/link",
      "PATCH /drives/d1/items/m1/permissions/writer",
      "GET /drives/d1/list",
      "GET /drives/d1/items/m1/listItem",
      "PATCH /sites/s1/lists/l1/items/42/fields",
    ]);
    expect(bodyOf(calls[3]!)).toEqual({ roles: ["read"] });
    expect(bodyOf(calls[6]!)).toEqual({ MatterStatus: "Closed" });
  });

  it("applies a retention label when given", async () => {
    const { graph, calls } = graphWith([json({ value: [] }), list(), json({ id: "42" }), noContent(), json({ name: "Closed matter" })]);
    expect(await closeMatter(graph, "d1", "m1", { retentionLabel: "Closed matter" })).toEqual({ downgraded: 0, linksRemoved: 0 });
    expect(route(calls[4]!)).toBe("PATCH /drives/d1/items/m1/retentionLabel");
    expect(bodyOf(calls[4]!)).toEqual({ name: "Closed matter" });
  });

  it("stops at the first Graph failure", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "writer", roles: ["write"] }] }), json({ error: { code: "accessDenied" } }, 403)]);
    await expect(closeMatter(graph, "d1", "m1")).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(2);
  });
});

describe("matterOfItem", () => {
  const item = (id: string, parent?: string) => json({ id, parentReference: parent ? { id: parent } : {} });

  it("walks up to the folder directly under the drive root, caching the root id per drive", async () => {
    const { graph, calls } = graphWith([
      item("doc", "sub"),
      json({ id: "ROOT" }),
      item("sub", "m1"),
      item("m1", "ROOT"),
      item("m1", "ROOT"),
    ]);
    expect(await matterOfItem(graph, "walk-drive", "doc")).toBe("m1");
    expect(calls.map(route)).toEqual([
      "GET /drives/walk-drive/items/doc",
      "GET /drives/walk-drive/root",
      "GET /drives/walk-drive/items/sub",
      "GET /drives/walk-drive/items/m1",
    ]);
    expect(await matterOfItem(graph, "walk-drive", "m1")).toBe("m1");
    expect(calls).toHaveLength(5);
  });

  it("returns undefined for the drive root itself", async () => {
    const { graph } = graphWith([item("ROOT")]);
    expect(await matterOfItem(graph, "root-drive", "ROOT")).toBeUndefined();
  });

  it("compares with an explicit matters folder without asking for the root", async () => {
    const { graph, calls } = graphWith([item("doc", "m1"), item("m1", "mf")]);
    expect(await matterOfItem(graph, "mf-drive", "doc", "mf")).toBe("m1");
    expect(calls).toHaveLength(2);
  });

  it("returns undefined for an item outside the matters folder", async () => {
    const { graph } = graphWith([item("doc", "other"), item("other", "ROOT"), item("ROOT")]);
    expect(await matterOfItem(graph, "mf-drive2", "doc", "mf")).toBeUndefined();
  });

  it("gives up beyond 64 levels", async () => {
    const replies = Array.from({ length: 64 }, (_, i) => item(`n${i}`, `n${i + 1}`));
    const { graph } = graphWith(replies);
    await expect(matterOfItem(graph, "deep-drive", "n0", "mf")).rejects.toMatchObject({ status: 508, code: "tooDeep" });
  });

  it("rejects a bad item id and surfaces 404 for an item the user cannot see", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "itemNotFound" } }, 404)]);
    await expect(matterOfItem(graph, "d1", "a?b")).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
    await expect(matterOfItem(graph, "d1", "doc")).rejects.toMatchObject({ status: 404 });
  });
});
