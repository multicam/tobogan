import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, isRole, roleFromClaims, type Action, type Role } from "../lib/m365/roles";

const ACTIONS: Action[] = [
  "matter.create",
  "matter.read",
  "matter.manageTeam",
  "matter.close",
  "document.write",
  "mail.file",
  "share.internal",
  "share.external",
];

describe("roleFromClaims", () => {
  it("picks the highest role present", () => {
    expect(roleFromClaims(["Associate", "Admin"])).toBe("admin");
    expect(roleFromClaims(["Associate", "TeamLeader"])).toBe("teamLeader");
    expect(roleFromClaims(["Associate"])).toBe("associate");
  });

  it("returns undefined for no known role or a malformed claim", () => {
    expect(roleFromClaims([])).toBeUndefined();
    expect(roleFromClaims(["admin", "Reader"])).toBeUndefined(); // claim values are case-sensitive
    expect(roleFromClaims("Admin")).toBeUndefined();
    expect(roleFromClaims(undefined)).toBeUndefined();
    expect(roleFromClaims({ 0: "Admin" })).toBeUndefined();
  });
});

describe("isRole", () => {
  it("accepts only the three app roles", () => {
    for (const role of ["admin", "teamLeader", "associate"]) expect(isRole(role)).toBe(true);
    for (const value of ["Admin", "owner", "", undefined, null, 1]) expect(isRole(value)).toBe(false);
  });
});

describe("can", () => {
  const allowed = (role: Role | undefined, isMatterLead?: boolean) =>
    ACTIONS.filter((action) => can(role, action, isMatterLead === undefined ? undefined : { isMatterLead }));

  it("lets admins do everything", () => {
    expect(allowed("admin")).toEqual(ACTIONS);
  });

  it("gives team leaders lead-only actions only on matters they lead", () => {
    const always = ["matter.create", "matter.read", "document.write", "mail.file", "share.internal"];
    expect(allowed("teamLeader")).toEqual(always);
    expect(allowed("teamLeader", false)).toEqual(always);
    expect(allowed("teamLeader", true)).toEqual(ACTIONS);
  });

  it("keeps associates to reading, writing, filing and internal sharing, even as lead", () => {
    const expected = ["matter.read", "document.write", "mail.file", "share.internal"];
    expect(allowed("associate")).toEqual(expected);
    expect(allowed("associate", true)).toEqual(expected);
  });

  it("denies everything without a role, and unknown actions to team leaders", () => {
    expect(allowed(undefined, true)).toEqual([]);
    expect(can("teamLeader", "matter.delete" as Action, { isMatterLead: true })).toBe(false);
    expect(can("bogus" as Role, "matter.read")).toBe(false);
  });
});

describe("assertCan", () => {
  it("passes silently when allowed and throws ForbiddenError naming the action otherwise", () => {
    expect(() => assertCan("teamLeader", "matter.close", { isMatterLead: true })).not.toThrow();
    const error = (() => {
      try {
        assertCan("associate", "share.external");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).name).toBe("ForbiddenError");
    expect((error as ForbiddenError).message).toBe("Your role does not allow: share.external");
  });
});
