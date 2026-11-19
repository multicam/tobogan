import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeMatterFormAction,
  createLinkFormAction,
  createMatterFormAction,
  inviteFormAction,
  revokeFormAction,
  saveAttachmentAction,
} from "../app/workspace/actions";
import { clearDriveCache } from "../lib/m365/drive";
import { ForbiddenError } from "../lib/m365/roles";
import type { Call } from "./helpers";
import {
  ADMIN_GROUP,
  bearer,
  graphJson,
  graphUrl,
  LEADERS_GROUP,
  libraryRoutes,
  redirectOf,
  resetProcessState,
  routeFetch,
  signInAs,
  stubBaseEnv,
  type Route,
} from "./next-harness";
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
  vi.restoreAllMocks();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.body)) as Record<string, unknown>;
const find = (calls: Call[], method: string, fragment: string) => calls.find((c) => c.method === method && c.url.includes(fragment));
const graphError = (status: number, code: string, message: string) => graphJson({ error: { code, message } }, status);

describe("the redirect back to the workspace", () => {
  it("keeps folderId and shareId, and reports the result", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    routeFetch([["POST", graphUrl("/drives/drive-1/items/d1/invite"), () => graphJson({ value: [{ id: "p1", roles: ["read"] }] })], ...libraryRoutes()]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: " d1 ", folderId: "m1", email: "bob@firm.example" })));
    expect(url.pathname).toBe("/workspace");
    expect(Object.fromEntries(url.searchParams)).toEqual({ folderId: "m1", shareId: "d1", msg: "Shared with bob@firm.example (read)." });
  });

  it("omits empty fields and logs unexpected errors behind a generic message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await signInAs({ uid: "u1", roles: ["Associate"] });
    routeFetch([["POST", graphUrl("/drives/drive-1/items/d1/invite"), () => new Response("not json", { status: 200 })], ...libraryRoutes()]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example" })));
    expect(Object.fromEntries(url.searchParams)).toEqual({ shareId: "d1", err: "Something went wrong. Try again." });
    expect(log).toHaveBeenCalledWith(expect.any(SyntaxError));
  });

  it("reports a missing session as an error instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const url = await redirectOf(() => revokeFormAction(form({ shareId: "d1", permissionId: "p1" })));
    expect(url.searchParams.get("err")).toBe("Something went wrong. Try again.");
  });
});

describe("inviteFormAction", () => {
  const inviteRoute = (reply: () => Response): Route => ["POST", graphUrl("/drives/drive-1/items/(d1|m1)/invite"), reply];

  it("lets any matter member share inside the firm, as the app, with an invitation", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch([inviteRoute(() => graphJson({ value: [{ id: "p1", roles: ["write"] }] })), ...libraryRoutes()]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example", role: "write" })));
    expect(url.searchParams.get("msg")).toBe("Shared with bob@firm.example (write).");
    const invite = find(calls, "POST", "/invite")!;
    expect(bearer(invite)).toBe("app-token");
    expect(bodyOf(invite)).toMatchObject({ recipients: [{ email: "bob@firm.example" }], roles: ["write"], sendInvitation: true, requireSignIn: true });
  });

  it("defaults any other role value to read", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch([inviteRoute(() => graphJson({ value: [] })), ...libraryRoutes()]);
    await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example", role: "owner" })));
    expect(bodyOf(find(calls, "POST", "/invite"))).toMatchObject({ roles: ["read"] });
  });

  it("refuses external sharing to an associate (POLICY-4)", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch([inviteRoute(() => graphJson({ value: [] })), ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "client@elsewhere.example" })));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: share.external");
    expect(find(calls, "POST", "/invite")).toBeUndefined();
  });

  it("lets the matter lead share outside the firm", async () => {
    await signInAs({ uid: "u1", email: LEAD, roles: ["TeamLeader"] });
    routeFetch([inviteRoute(() => graphJson({ value: [{ id: "p1" }] })), ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "client@elsewhere.example" })));
    expect(url.searchParams.get("msg")).toBe("Shared with client@elsewhere.example (read).");
  });

  it("treats every address as external when no firm domain is configured", async () => {
    vi.stubEnv("FIRM_EMAIL_DOMAINS", "");
    await signInAs({ uid: "u1", roles: ["Associate"] });
    routeFetch(libraryRoutes());
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example" })));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: share.external");
  });

  it("reports recipients Graph rejected in a 207 response", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    routeFetch([
      inviteRoute(() => graphJson({ value: [{ error: { code: "notAllowed", message: "Guest blocked" } }, { error: { code: "x", message: "Mailbox full" } }] }, 207)),
      ...libraryRoutes(),
    ]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example" })));
    expect(url.searchParams.get("err")).toBe("Not shared: Guest blocked; Mailbox full");
  });

  it("rejects an invalid email address", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    const { calls } = routeFetch([inviteRoute(() => graphJson({ value: [] })), ...libraryRoutes()]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "not-an-email" })));
    expect(url.searchParams.get("err")).toBe("Invalid email address.");
    expect(find(calls, "POST", "/invite")).toBeUndefined();
  });

  it("keeps Graph's wording and code for Graph errors (SHARE-7)", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    routeFetch([inviteRoute(() => graphError(403, "accessDenied", "Sharing is disabled for this site.")), ...libraryRoutes()]);
    const url = await redirectOf(() => inviteFormAction(form({ shareId: "d1", email: "bob@firm.example" })));
    expect(url.searchParams.get("err")).toBe("Sharing is disabled for this site. (accessDenied)");
  });
});

describe("createLinkFormAction", () => {
  const linkRoute = (reply: (call: Call) => Response): Route => ["POST", graphUrl("/drives/drive-1/items/d1/createLink"), reply];

  it("creates an organisation-scoped view link by default", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch([linkRoute(() => graphJson({ id: "p9", link: { webUrl: "https://share/x" } })), ...libraryRoutes()]);
    const url = await redirectOf(() => createLinkFormAction(form({ shareId: "d1", type: "bogus", scope: "anonymous" })));
    expect(url.searchParams.get("msg")).toBe("Link (view, organization): https://share/x");
    expect(bodyOf(find(calls, "POST", "/createLink"))).toEqual({ type: "view", scope: "organization" });
  });

  it("creates an edit link for specific people, never an anonymous one (SHARE-2)", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch([linkRoute(() => graphJson({ id: "p9", link: { webUrl: "https://share/y" } })), ...libraryRoutes()]);
    const url = await redirectOf(() => createLinkFormAction(form({ shareId: "d1", type: "edit", scope: "users" })));
    expect(url.searchParams.get("msg")).toBe("Link (edit, users): https://share/y");
    expect(bodyOf(find(calls, "POST", "/createLink"))).toEqual({ type: "edit", scope: "users" });
  });

  it("refuses users without a role", async () => {
    await signInAs({ uid: "u1" });
    routeFetch(libraryRoutes());
    const url = await redirectOf(() => createLinkFormAction(form({ shareId: "d1" })));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: share.internal");
  });

  it("reports a Graph response without a link", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    routeFetch([linkRoute(() => graphJson({ id: "p9" })), ...libraryRoutes()]);
    const url = await redirectOf(() => createLinkFormAction(form({ shareId: "d1" })));
    expect(url.searchParams.get("err")).toBe("Graph returned no sharing link. (noLink)");
  });
});

describe("revokeFormAction", () => {
  const permissionRoutes = (inherited: boolean): Route[] => [
    ["GET", graphUrl("/drives/drive-1/items/d1/permissions/p1"), () => graphJson({ id: "p1", inheritedFrom: inherited ? { id: "m1" } : null })],
    ["DELETE", graphUrl("/drives/drive-1/items/d1/permissions/p1"), () => new Response(null, { status: 204 })],
  ];

  it("lets the matter lead remove access", async () => {
    await signInAs({ uid: "u1", email: LEAD, roles: ["TeamLeader"] });
    const { calls } = routeFetch([...permissionRoutes(false), ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => revokeFormAction(form({ shareId: "d1", permissionId: "p1" })));
    expect(url.searchParams.get("msg")).toBe("Access removed.");
    expect(bearer(find(calls, "DELETE", "/permissions/p1")!)).toBe("app-token");
  });

  it("refuses a team leader who does not lead the matter", async () => {
    await signInAs({ uid: "u1", email: "other@firm.example", roles: ["TeamLeader"] });
    const { calls } = routeFetch([...permissionRoutes(false), ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => revokeFormAction(form({ shareId: "d1", permissionId: "p1" })));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: matter.manageTeam");
    expect(find(calls, "DELETE", "/permissions")).toBeUndefined();
  });

  it("explains that inherited access must be removed on the parent", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    routeFetch([...permissionRoutes(true), ...libraryRoutes()]);
    const url = await redirectOf(() => revokeFormAction(form({ shareId: "d1", permissionId: "p1" })));
    expect(url.searchParams.get("err")).toMatch(/inherited from a parent folder.*\(inheritedPermission\)$/);
  });

  it("rejects a missing permission id", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    routeFetch(libraryRoutes());
    const url = await redirectOf(() => revokeFormAction(form({ shareId: "d1" })));
    expect(url.searchParams.get("err")).toBe("Invalid permission id.");
  });
});

describe("closeMatterFormAction", () => {
  const closeRoutes: Route[] = [
    [
      "GET",
      graphUrl("/drives/drive-1/items/m1/permissions"),
      () =>
        graphJson({
          value: [
            { id: "owner", roles: ["owner"] },
            { id: "inh", roles: ["write"], inheritedFrom: { id: "root-id" } },
            { id: "w1", roles: ["write"], grantedToV2: { user: { email: "a@firm.example" } } },
            { id: "w2", roles: ["write"], grantedToV2: { user: { email: "b@firm.example" } } },
            { id: "r1", roles: ["read"], grantedToV2: { user: { email: "c@firm.example" } } },
            { id: "l1", roles: ["read"], link: { type: "view", scope: "organization" } },
          ],
        }),
    ],
    ["GET", graphUrl("/drives/drive-1/items/m1/permissions/l1"), () => graphJson({ id: "l1" })],
    ["DELETE", graphUrl("/drives/drive-1/items/m1/permissions/l1"), () => new Response(null, { status: 204 })],
    ["PATCH", graphUrl("/drives/drive-1/items/m1/permissions/(w1|w2)"), () => graphJson({})],
    ["PATCH", graphUrl("/sites/site-1/lists/list-1/items/7/fields"), () => graphJson({})],
    ["PATCH", graphUrl("/drives/drive-1/items/m1/retentionLabel"), () => graphJson({})],
  ];

  it("downgrades writers, removes links and marks the matter Closed", async () => {
    await signInAs({ uid: "u1", email: LEAD, roles: ["TeamLeader"] });
    const { calls } = routeFetch([...closeRoutes, ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => closeMatterFormAction(form({ shareId: "m1" })));
    expect(url.searchParams.get("msg")).toBe("Matter closed: 2 people set to read-only, 1 links removed.");
    expect(bodyOf(find(calls, "PATCH", "/fields"))).toEqual({ MatterStatus: "Closed" });
    expect(find(calls, "PATCH", "/retentionLabel")).toBeUndefined();
  });

  it("applies the configured retention label", async () => {
    vi.stubEnv("MATTER_CLOSED_RETENTION_LABEL", "Closed matter - 7 years");
    await signInAs({ uid: "u1", roles: ["Admin"] });
    const { calls } = routeFetch([...closeRoutes, ...libraryRoutes()]);
    await redirectOf(() => closeMatterFormAction(form({ shareId: "m1" })));
    expect(bodyOf(find(calls, "PATCH", "/retentionLabel"))).toEqual({ name: "Closed matter - 7 years" });
  });

  it("only closes the matter folder itself, not a document inside it", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    const { calls } = routeFetch([...closeRoutes, ...libraryRoutes()]);
    const url = await redirectOf(() => closeMatterFormAction(form({ shareId: "d1" })));
    expect(url.searchParams.get("err")).toBe("Only a matter folder can be closed.");
    expect(find(calls, "PATCH", "/fields")).toBeUndefined();
  });

  it("refuses an associate", async () => {
    await signInAs({ uid: "u1", email: LEAD, roles: ["Associate"] });
    routeFetch([...closeRoutes, ...libraryRoutes({ lead: LEAD })]);
    const url = await redirectOf(() => closeMatterFormAction(form({ shareId: "m1" })));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: matter.close");
  });
});

describe("createMatterFormAction", () => {
  const folder = { id: "m2", name: "M-2 - Jones", webUrl: "https://x/M-2", folder: {}, lastModifiedDateTime: "2026-01-01T00:00:00Z" };

  function matterRoutes(options: { columns?: string[]; drives?: { id: string; name: string }[]; invite?: () => Response } = {}): Route[] {
    return [
      ["GET", graphUrl("/sites/site-1/drives"), () => graphJson({ value: options.drives ?? [] })],
      ["POST", graphUrl("/sites/site-1/lists"), () => graphJson({ id: "list-new" })],
      ["GET", graphUrl("/sites/site-1/lists/list-new/drive"), () => graphJson({ id: "drive-1" })],
      ["GET", graphUrl("/sites/site-1/lists/list-1/columns"), () => graphJson({ value: (options.columns ?? []).map((name) => ({ name })) })],
      ["POST", graphUrl("/sites/site-1/lists/list-1/columns"), () => graphJson({})],
      ["POST", graphUrl("/drives/drive-1/root/children"), () => graphJson(folder, 201)],
      ["POST", graphUrl("/drives/drive-1/items/m2/invite"), options.invite ?? (() => graphJson({ value: [{ id: "p" }] }))],
      ["GET", graphUrl("/drives/drive-1/items/m2/listItem"), () => graphJson({ id: "9" })],
      ["PATCH", graphUrl("/sites/site-1/lists/list-1/items/9/fields"), () => graphJson({})],
      ["DELETE", graphUrl("/drives/drive-1/items/m2"), () => new Response(null, { status: 204 })],
      ...libraryRoutes(),
    ];
  }

  const matterForm = (extra: Record<string, string> = {}) =>
    form({ number: "M-2", title: "Jones", writers: "w1@firm.example, w2@firm.example", readers: "r1@firm.example;\nr2@firm.example", ...extra });

  it("creates the matter as the app, restricted to its team and the firm-wide groups", async () => {
    await signInAs({ uid: "u1", email: "Leader@Firm.Example", roles: ["TeamLeader"] });
    const { calls } = routeFetch(matterRoutes());
    const url = await redirectOf(() => createMatterFormAction(matterForm({ lead: "someone@firm.example" })));
    expect(url.searchParams.get("msg")).toBe("Matter M-2 created.");

    // Default library, columns created on first use.
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/columns")).map((c) => bodyOf(c).name)).toEqual([
      "MatterNumber",
      "MatterLead",
      "MatterStatus",
    ]);
    const [writeGrant, readGrant] = calls.filter((c) => c.url.endsWith("/m2/invite")).map(bodyOf);
    expect(writeGrant).toMatchObject({
      roles: ["write"],
      retainInheritedPermissions: false,
      sendInvitation: false,
      recipients: [
        { email: "leader@firm.example" },
        { email: "w1@firm.example" },
        { email: "w2@firm.example" },
        { objectId: ADMIN_GROUP },
        { objectId: LEADERS_GROUP },
      ],
    });
    expect(readGrant).toMatchObject({ roles: ["read"], recipients: [{ email: "r1@firm.example" }, { email: "r2@firm.example" }] });
    // A team leader leads what they create; the lead field is ignored.
    expect(bodyOf(find(calls, "PATCH", "/items/9/fields"))).toEqual({ MatterNumber: "M-2", MatterLead: "leader@firm.example", MatterStatus: "Open" });
    expect(calls.filter((c) => c.url.includes("/m2") || c.url.includes("/columns")).every((c) => bearer(c) === "app-token")).toBe(true);
  });

  it("lets an admin name another lead", async () => {
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes({ columns: ["MatterNumber", "MatterLead", "MatterStatus"] }));
    await redirectOf(() => createMatterFormAction(matterForm({ lead: "Lead@Firm.Example" })));
    expect(find(calls, "POST", "/columns")).toBeUndefined();
    expect(bodyOf(find(calls, "PATCH", "/items/9/fields"))).toMatchObject({ MatterLead: "lead@firm.example" });
  });

  it("makes the admin the lead when none is named", async () => {
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes());
    await redirectOf(() => createMatterFormAction(form({ number: "M-2", title: "Jones" })));
    expect(bodyOf(find(calls, "PATCH", "/items/9/fields"))).toMatchObject({ MatterLead: "admin@firm.example" });
    expect(calls.filter((c) => c.url.endsWith("/m2/invite"))).toHaveLength(1);
  });

  it("uses this year's library, creating it on first use (MATTER-10)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    vi.stubEnv("SHAREPOINT_LIBRARY_NAME", "Matters {year}");
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes({ drives: [{ id: "old", name: "Matters 2025" }] }));
    const url = await redirectOf(() => createMatterFormAction(matterForm()));
    vi.useRealTimers();
    expect(url.searchParams.get("msg")).toBe("Matter M-2 created.");
    expect(bodyOf(find(calls, "POST", "/sites/site-1/lists"))).toEqual({ displayName: "Matters 2026", list: { template: "documentLibrary" } });
  });

  it("reuses this year's library when it exists", async () => {
    vi.stubEnv("SHAREPOINT_LIBRARY_NAME", "Matters");
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes({ drives: [{ id: "drive-1", name: "matters" }] }));
    await redirectOf(() => createMatterFormAction(matterForm()));
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/sites/site-1/lists"))).toHaveLength(0);
  });

  it("refuses an associate before touching SharePoint", async () => {
    await signInAs({ uid: "u1", email: "a@firm.example", roles: ["Associate"] });
    const { calls } = routeFetch(matterRoutes());
    const url = await redirectOf(() => createMatterFormAction(matterForm()));
    expect(url.searchParams.get("err")).toBe("Your role does not allow: matter.create");
    expect(calls).toHaveLength(0);
  });

  it("refuses an account without an email address", async () => {
    await signInAs({ uid: "u1", roles: ["Admin"] });
    const url = await redirectOf(() => createMatterFormAction(matterForm()));
    expect(url.searchParams.get("err")).toMatch(/^Your account has no email address/);
  });

  it("refuses to start without the firm-wide groups (POLICY-7, POLICY-8)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("MATTER_LEADERS_GROUP_ID", "");
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes());
    const url = await redirectOf(() => createMatterFormAction(matterForm()));
    expect(url.searchParams.get("err")).toBe("Something went wrong. Try again.");
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid matter number", async () => {
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes());
    const url = await redirectOf(() => createMatterFormAction(matterForm({ number: "m 2" })));
    expect(url.searchParams.get("err")).toMatch(/^Matter number must be/);
    expect(find(calls, "POST", "/children")).toBeUndefined();
  });

  it("deletes the half-made folder when a team grant fails", async () => {
    await signInAs({ uid: "u1", email: "admin@firm.example", roles: ["Admin"] });
    const { calls } = routeFetch(matterRoutes({ invite: () => graphJson({ value: [{ error: { code: "invalidRequest", message: "Unknown user" } }] }) }));
    const url = await redirectOf(() => createMatterFormAction(matterForm()));
    expect(url.searchParams.get("err")).toBe("Could not grant access to every team member: Unknown user (teamGrantFailed)");
    expect(find(calls, "DELETE", "/items/m2")).toBeDefined();
  });
});

describe("saveAttachmentAction", () => {
  const ATTACHMENT = "/me/messages/msg-1/attachments/att-1";
  const attachmentRoutes = (meta: Record<string, unknown>): Route[] => [
    ["GET", graphUrl(`${ATTACHMENT}/\\$value`), () => new Response(new Uint8Array([7, 8, 9]))],
    ["GET", graphUrl(ATTACHMENT), () => graphJson({ id: "att-1", name: "scan.pdf", size: 3, "@odata.type": "#microsoft.graph.fileAttachment", ...meta })],
    [
      "PUT",
      graphUrl("/drives/drive-1/items/m1:/scan\\.pdf:/content"),
      () => graphJson({ id: "f1", name: "scan.pdf", size: 3, webUrl: "https://x/scan.pdf", file: {}, lastModifiedDateTime: "2026-01-01T00:00:00Z" }, 201),
    ],
    ...libraryRoutes(),
  ];

  it("copies a file attachment into the folder with the user's token", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    const { calls } = routeFetch(attachmentRoutes({}));
    expect(await saveAttachmentAction("msg-1", "att-1", "m1")).toEqual({ id: "f1", name: "scan.pdf" });
    const put = find(calls, "PUT", "/content")!;
    expect(Array.from(put.body as Uint8Array)).toEqual([7, 8, 9]);
    expect(put.url).toContain("conflictBehavior=rename");
    expect(new Set(calls.map(bearer))).toEqual(new Set(["access-u1"]));
  });

  it("is refused to users without a role", async () => {
    await signInAs({ uid: "u1" });
    const { calls } = routeFetch(attachmentRoutes({}));
    await expect(saveAttachmentAction("msg-1", "att-1", "m1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.some((c) => c.url.includes("/attachments/"))).toBe(false);
  });

  it("refuses attached items, which have no bytes to copy", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    routeFetch(attachmentRoutes({ "@odata.type": "#microsoft.graph.itemAttachment" }));
    await expect(saveAttachmentAction("msg-1", "att-1", "m1")).rejects.toMatchObject({ status: 422, code: "unsupportedAttachment" });
  });

  it("rejects malformed ids from the browser", async () => {
    await signInAs({ uid: "u1", roles: ["Associate"] });
    routeFetch(attachmentRoutes({}));
    await expect(saveAttachmentAction("msg/../1", "att-1", "m1")).rejects.toThrow("Invalid message id.");
  });
});
