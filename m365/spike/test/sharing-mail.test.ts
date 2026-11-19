import { describe, expect, it } from "vitest";
import { buildEmailDocument } from "../lib/m365/email-html";
import { getMessage, listInbox, saveAttachmentToDrive, sendMail, toSafeFileName } from "../lib/m365/mail";
import { createLink, invite, listPermissions, revokePermission } from "../lib/m365/sharing";
import { graphWith, json } from "./helpers";

describe("sharing", () => {
  it("invite sends only the invite and reports partial failures", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "p1", roles: ["read"], grantedToV2: { user: { displayName: "Ada" } } }, { error: { code: "accessDenied", message: "external sharing off" } }] }, 207),
    ]);
    const result = await invite(graph, "d", "i1", { emails: ["ada@contoso.com", "bob@external.example"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/drives\/d\/items\/i1\/invite$/);
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({ requireSignIn: true, roles: ["read"] });
    expect(result.granted[0]).toMatchObject({ id: "p1", grantedTo: ["Ada"] });
    expect(result.failed).toEqual([{ code: "accessDenied", message: "external sharing off" }]);
  });

  it("rejects bad recipients and roles before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(invite(graph, "d", "i1", { emails: ["not-an-email"] })).rejects.toThrow("Invalid email");
    await expect(invite(graph, "d", "i1", { emails: [] })).rejects.toThrow();
    await expect(invite(graph, "d", "i1", { emails: ["a@b.co"], role: "owner" as never })).rejects.toThrow("Role");
    expect(calls).toHaveLength(0);
  });

  it("createLink always sends an explicit scope", async () => {
    const { graph, calls } = graphWith([json({ id: "p9", link: { webUrl: "https://share" } }, 201)]);
    expect(await createLink(graph, "d", "i1", { type: "view", scope: "organization" })).toEqual({ permissionId: "p9", webUrl: "https://share" });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ type: "view", scope: "organization" });
  });

  it("flags inherited permissions and refuses to revoke them", async () => {
    const inherited = { id: "p1", roles: ["write"], inheritedFrom: { id: "parent" } };
    const list = graphWith([json({ value: [inherited, { id: "p2", roles: ["read"], link: { scope: "organization" } }] })]);
    expect((await listPermissions(list.graph, "d", "i1")).map((p) => p.inherited)).toEqual([true, false]);

    const revoke = graphWith([json(inherited)]);
    await expect(revokePermission(revoke.graph, "d", "i1", "p1")).rejects.toMatchObject({ code: "inheritedPermission" });
    expect(revoke.calls.map((c) => c.method)).toEqual(["GET"]);

    const ok = graphWith([json({ id: "p2", roles: ["read"] }), new Response(null, { status: 204 })]);
    await revokePermission(ok.graph, "d", "i1", "p2");
    expect(ok.calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });
});

describe("mail", () => {
  it("lists the inbox with immutable ids and a clamped page size", async () => {
    const { graph, calls } = graphWith([json({ value: [{ id: "m1", receivedDateTime: "2026-01-01T00:00:00Z", from: { emailAddress: { name: "Ada" } } }] })]);
    const page = await listInbox(graph, { pageSize: 5000 });
    expect(page.items[0]).toMatchObject({ id: "m1", subject: "(No subject)", fromName: "Ada", isRead: false });
    expect(calls[0]!.headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(new URL(calls[0]!.url).searchParams.get("$top")).toBe("100");
  });

  it("getMessage fetches attachment metadata without content", async () => {
    const { graph, calls } = graphWith([
      (c) => (c.url.includes("/attachments") ? json({ value: [{ "@odata.type": "#microsoft.graph.referenceAttachment", id: "a2", name: "link" }] }) : json({ id: "m1", receivedDateTime: "x", body: { contentType: "html", content: "<p>hi</p>" } })),
      (c) => (c.url.includes("/attachments") ? json({ value: [{ "@odata.type": "#microsoft.graph.referenceAttachment", id: "a2", name: "link" }] }) : json({ id: "m1", receivedDateTime: "x", body: { contentType: "html", content: "<p>hi</p>" } })),
    ]);
    const message = await getMessage(graph, "m1");
    expect(message.body).toEqual({ contentType: "html", content: "<p>hi</p>" });
    expect(message.attachments[0]).toMatchObject({ kind: "reference" });
    expect(calls.find((c) => c.url.includes("/attachments"))!.url).not.toContain("contentBytes");
  });

  it("saves a file attachment under a safe name without overwriting", async () => {
    const { graph, calls } = graphWith([
      json({ "@odata.type": "#microsoft.graph.fileAttachment", id: "a1", name: "Q3: plan?.pdf", size: 3, contentType: "application/pdf" }),
      new Response(new Uint8Array([1, 2, 3])),
      json({ id: "i9", name: "Q3_ plan_.pdf", webUrl: "u", lastModifiedDateTime: "x", file: {} }, 201),
    ]);
    const saved = await saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d", folderId: "f1" });
    expect(saved.id).toBe("i9");
    expect(calls[1]!.url).toMatch(/\/attachments\/a1\/\$value$/);
    expect(calls[2]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/f1:/Q3_%20plan_.pdf:/content?%40microsoft.graph.conflictBehavior=rename");
  });

  it("refuses attachments that have no file content", async () => {
    const { graph, calls } = graphWith([json({ "@odata.type": "#microsoft.graph.itemAttachment", id: "a1", name: "Fwd", size: 9 })]);
    await expect(saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d" })).rejects.toMatchObject({ code: "unsupportedAttachment" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["../../etc/passwd", ".._.._etc_passwd"],
    ["report.", "report"],
    ["  ", "attachment"],
    ["CON", "attachment-CON"],
    ["~$draft.docx", "_draft.docx"],
  ])("toSafeFileName(%j) -> %j", (input, expected) => {
    expect(toSafeFileName(input)).toBe(expected);
  });

  it("keeps the extension when truncating long names", () => {
    const name = toSafeFileName(`${"x".repeat(400)}.pdf`);
    expect(name).toHaveLength(255);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("sendMail validates recipients and treats 202 as queued", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 202 })]);
    await sendMail(graph, { to: ["ada@contoso.com"], subject: "Hi", htmlBody: "<p>x</p>" });
    expect(JSON.parse(String(calls[0]!.body)).message.toRecipients).toEqual([{ emailAddress: { address: "ada@contoso.com" } }]);
    await expect(sendMail(graph, { to: ["a@b.co, c@d.co"], subject: "", htmlBody: "" })).rejects.toThrow("Invalid email");
  });
});

describe("email document", () => {
  it("blocks all network loads by default and escapes plain text", () => {
    const html = buildEmailDocument({ contentType: "html", content: '<img src="https://tracker.example/p.gif">' });
    expect(html).toContain("default-src 'none'; img-src data:;");
    expect(buildEmailDocument({ contentType: "html", content: "" }, { allowRemoteImages: true })).toContain("img-src https: data:");
    expect(buildEmailDocument({ contentType: "text", content: "<script>alert(1)</script>" })).toContain("&lt;script&gt;");
  });
});
