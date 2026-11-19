import { describe, expect, it } from "vitest";
import { createMatter, listMatters, matterFolderName } from "../lib/m365/matters";
import { assertCan, can, roleFromClaims, type Action } from "../lib/m365/roles";
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
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", team: [{ email: "a@firm.example", role: "write" }] })).rejects.toMatchObject({ status: 403 });
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "DELETE"]);
  });

  it("also rolls back when only some members were granted", async () => {
    const { graph, calls } = graphWith([json(folder(), 201), json({ value: [{ id: "p1" }, { error: { code: "x", message: "unknown user" } }] }, 207), new Response(null, { status: 204 })]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", team: [{ email: "a@firm.example", role: "write" }, { email: "b@firm.example", role: "write" }] })).rejects.toMatchObject({ code: "teamGrantFailed" });
    expect(calls.at(-1)!.method).toBe("DELETE");
  });

  it("raises a loud error when rollback itself fails", async () => {
    const { graph } = graphWith([json(folder(), 201), json({}, 403), json({}, 403)]);
    await expect(createMatter(graph, "d", { number: "2026-0042", title: "T", team: [{ email: "a@firm.example", role: "write" }] })).rejects.toMatchObject({ code: "matterLeftOpen" });
  });
});
