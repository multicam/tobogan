import { describe, expect, it } from "vitest";
import { GraphError } from "../lib/m365/graph-client";
import { InvalidInputError } from "../lib/m365/names";
import { createLink, invite, listPermissions, revokePermission, setPermissionRole, type ShareRole } from "../lib/m365/sharing";
import { graphWith, json } from "./helpers";

const GROUP = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PERMS = "https://graph.microsoft.com/v1.0/drives/d1/items/i1/permissions";
const bodyOf = (call: { body?: unknown }) => JSON.parse(call.body as string);

describe("listPermissions", () => {
  it("summarises every identity kind, links and inheritance across pages", async () => {
    const next = `${PERMS}?$skiptoken=2`;
    const { graph, calls } = graphWith([
      json({
        value: [
          { id: "p1", roles: ["write"], grantedToV2: { user: { displayName: "Jane", email: "jane@firm.example" } } },
          { id: "p2", roles: ["read"], grantedToV2: { group: { email: "team@firm.example" } }, inheritedFrom: { id: "parent" } },
          { id: "p3", grantedToV2: { siteUser: { loginName: "i:0#", email: "x@firm.example" } }, inheritedFrom: null },
        ],
        "@odata.nextLink": next,
      }),
      json({
        value: [
          { id: "p4", roles: ["read"], grantedToV2: { siteGroup: { displayName: "Owners" } }, inheritedFrom: {} },
          {
            id: "p5",
            roles: ["read"],
            link: { type: "view", scope: "organization", webUrl: "https://share/x" },
            grantedToIdentitiesV2: [{ user: { displayName: "A" } }, {}, { user: {} }],
            expirationDateTime: "2026-02-01T00:00:00Z",
          },
        ],
      }),
    ]);
    const perms = await listPermissions(graph, "d1", "i1");
    expect(calls[0]!.url).toBe(PERMS);
    expect(perms).toEqual([
      { id: "p1", roles: ["write"], grantedTo: ["Jane"], link: undefined, inherited: false, expirationDateTime: undefined },
      { id: "p2", roles: ["read"], grantedTo: ["team@firm.example"], link: undefined, inherited: true, expirationDateTime: undefined },
      { id: "p3", roles: [], grantedTo: ["x@firm.example"], link: undefined, inherited: false, expirationDateTime: undefined },
      { id: "p4", roles: ["read"], grantedTo: ["Owners"], link: undefined, inherited: false, expirationDateTime: undefined },
      {
        id: "p5",
        roles: ["read"],
        grantedTo: ["A"],
        link: { type: "view", scope: "organization", webUrl: "https://share/x" },
        inherited: false,
        expirationDateTime: "2026-02-01T00:00:00Z",
      },
    ]);
  });

  it("validates the item id and surfaces 404", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "itemNotFound", message: "gone" } }, 404)]);
    await expect(listPermissions(graph, "d1", "a/b")).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
    const error = (await listPermissions(graph, "d1", "i1").catch((e) => e)) as GraphError;
    expect(error.isNotFound).toBe(true);
  });
});

describe("invite", () => {
  it("sends people and groups, requires sign-in, and defaults to read with an invitation", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "p1", roles: ["read"], grantedToV2: { user: { email: "a@x.example" } } }] })]);
    const result = await invite(graph, "d1", "i1", { emails: ["a@x.example"], groupIds: [GROUP] });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d1/items/i1/invite");
    expect(bodyOf(calls[0]!)).toEqual({
      recipients: [{ email: "a@x.example" }, { objectId: GROUP }],
      requireSignIn: true,
      sendInvitation: true,
      roles: ["read"],
    });
    expect(result).toEqual({ granted: [expect.objectContaining({ id: "p1", grantedTo: ["a@x.example"] })], failed: [] });
  });

  it("passes role, message, silent invite and inheritance cut through", async () => {
    const { graph, calls } = graphWith([json({ value: [] })]);
    await invite(graph, "d1", "i1", {
      emails: ["a@x.example"],
      role: "write",
      message: "see this",
      sendInvitation: false,
      retainInheritedPermissions: false,
    });
    expect(bodyOf(calls[0]!)).toMatchObject({ roles: ["write"], message: "see this", sendInvitation: false, retainInheritedPermissions: false });
  });

  it("reports per-recipient failures from a 207 Multi-Status", async () => {
    const { graph } = graphWith([
      json(
        {
          value: [
            { id: "p1", roles: ["read"] },
            { id: "", error: { code: "notAllowed", message: "external sharing is off" } },
            { id: "", error: {} },
          ],
        },
        207,
      ),
    ]);
    const result = await invite(graph, "d1", "i1", { emails: ["a@x.example", "b@y.example", "c@z.example"] });
    expect(result.granted.map((g) => g.id)).toEqual(["p1"]);
    expect(result.failed).toEqual([
      { code: "notAllowed", message: "external sharing is off" },
      { code: "unknown", message: "" },
    ]);
  });

  it("treats an empty response as nothing granted", async () => {
    const { graph } = graphWith([new Response(null, { status: 200 })]);
    expect(await invite(graph, "d1", "i1", { emails: ["a@x.example"] })).toEqual({ granted: [], failed: [] });
  });

  it("validates recipients, role, message and ids before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@x.example`);
    await expect(invite(graph, "d1", "i1", { emails: [] })).rejects.toThrow("Provide 1 to 50 recipients.");
    await expect(invite(graph, "d1", "i1", { emails: many })).rejects.toThrow("Provide 1 to 50 recipients.");
    await expect(invite(graph, "d1", "i1", { emails: many.slice(0, 50), groupIds: [GROUP] })).rejects.toThrow("Provide 1 to 50");
    await expect(invite(graph, "d1", "i1", { emails: ["a@x.example"], role: "owner" as ShareRole })).rejects.toThrow("Role must be read or write.");
    await expect(invite(graph, "d1", "i1", { emails: ["a@x.example"], message: "x".repeat(2001) })).rejects.toThrow("longer than 2000");
    await expect(invite(graph, "d1", "i1", { emails: ["not-an-email"] })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(invite(graph, "d1", "i1", { emails: [], groupIds: ["not-a-guid"] })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(invite(graph, "d1", "../x", { emails: ["a@x.example"] })).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a 403 from tenant sharing policy", async () => {
    const { graph } = graphWith([json({ error: { code: "accessDenied", message: "policy" } }, 403)]);
    await expect(invite(graph, "d1", "i1", { emails: ["a@x.example"] })).rejects.toMatchObject({ status: 403, code: "accessDenied" });
  });
});

describe("createLink", () => {
  it("always sends an explicit scope and returns the link", async () => {
    const { graph, calls } = graphWith([json({ id: "p9", link: { webUrl: "https://share/abc" } })]);
    const link = await createLink(graph, "d1", "i1", { type: "edit", scope: "users", expirationDateTime: "2026-03-01T00:00:00Z" });
    expect(link).toEqual({ permissionId: "p9", webUrl: "https://share/abc" });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d1/items/i1/createLink");
    expect(bodyOf(calls[0]!)).toEqual({ type: "edit", scope: "users", expirationDateTime: "2026-03-01T00:00:00Z" });
  });

  it("rejects a response without a link URL", async () => {
    const noUrl = graphWith([json({ id: "p9", link: {} })]);
    await expect(createLink(noUrl.graph, "d1", "i1", { type: "view", scope: "organization" })).rejects.toMatchObject({ code: "noLink" });
    const empty = graphWith([new Response(null, { status: 200 })]);
    await expect(createLink(empty.graph, "d1", "i1", { type: "view", scope: "organization" })).rejects.toMatchObject({ code: "noLink" });
  });

  it("surfaces a tenant refusal of anonymous links", async () => {
    const { graph } = graphWith([json({ error: { code: "accessDenied", message: "anonymous links disabled" } }, 403)]);
    await expect(createLink(graph, "d1", "i1", { type: "view", scope: "anonymous" })).rejects.toMatchObject({
      status: 403,
      message: "anonymous links disabled",
    });
  });
});

describe("revokePermission", () => {
  it("deletes a direct permission after checking it", async () => {
    const { graph, calls } = graphWith([json({ id: "p1", roles: ["read"] }), new Response(null, { status: 204 })]);
    await revokePermission(graph, "d1", "i1", "p1");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${PERMS}/p1`, `DELETE ${PERMS}/p1`]);
  });

  it("refuses to delete an inherited permission", async () => {
    const { graph, calls } = graphWith([json({ id: "p1", inheritedFrom: { id: "parent" } })]);
    await expect(revokePermission(graph, "d1", "i1", "p1")).rejects.toMatchObject({ status: 409, code: "inheritedPermission" });
    expect(calls).toHaveLength(1);
  });

  it("validates the permission id and surfaces 404 for a missing one", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "itemNotFound" } }, 404)]);
    await expect(revokePermission(graph, "d1", "i1", "p 1")).rejects.toThrow("Invalid permission id.");
    expect(calls).toHaveLength(0);
    await expect(revokePermission(graph, "d1", "i1", "p1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("setPermissionRole", () => {
  it("patches the roles of a permission", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 204 })]);
    await setPermissionRole(graph, "d1", "i1", "p1", "read");
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe(`${PERMS}/p1`);
    expect(bodyOf(calls[0]!)).toEqual({ roles: ["read"] });
  });

  it("validates the role and id, and surfaces Graph's refusal for links", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "invalidRequest", message: "not for links" } }, 400)]);
    await expect(setPermissionRole(graph, "d1", "i1", "p1", "owner" as ShareRole)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(setPermissionRole(graph, "d1", "i1", "", "read")).rejects.toThrow("Invalid permission id.");
    expect(calls).toHaveLength(0);
    await expect(setPermissionRole(graph, "d1", "i1", "p1", "write")).rejects.toMatchObject({ status: 400, message: "not for links" });
  });
});
