import { describe, expect, it } from "vitest";
import { getMessage, listInbox, markRead, MAX_ATTACHMENT_BYTES, saveAttachmentToDrive, sendMail, toSafeFileName } from "../lib/m365/mail";
import { InvalidInputError } from "../lib/m365/names";
import { graphWith, json } from "./helpers";

const IMMUTABLE = 'IdType="ImmutableId"';
const driveItem = { id: "f1", name: "saved.pdf", size: 3, webUrl: "https://x", lastModifiedDateTime: "t", file: {} };

describe("listInbox", () => {
  it("fills defaults for sparse messages", async () => {
    const { graph } = graphWith([json({ value: [{ id: "m1", receivedDateTime: "t" }] })]);
    const page = await listInbox(graph);
    expect(page.items[0]).toEqual({
      id: "m1",
      subject: "(No subject)",
      fromName: undefined,
      fromAddress: undefined,
      receivedDateTime: "t",
      bodyPreview: "",
      isRead: false,
      hasAttachments: false,
      conversationId: undefined,
    });
  });

  it("requests 25 newest messages by default", async () => {
    const { graph, calls } = graphWith([json({ value: [] })]);
    await listInbox(graph);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1.0/me/mailFolders/inbox/messages");
    expect(url.searchParams.get("$top")).toBe("25");
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime desc");
  });

  it("follows a cursor with immutable ids", async () => {
    const cursor = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=25";
    const { graph, calls } = graphWith([json({ value: [{ id: "m26", subject: "Hi", receivedDateTime: "t", isRead: true, from: { emailAddress: { name: "A", address: "a@x.com" } } }] })]);
    const page = await listInbox(graph, { cursor });
    expect(calls[0]!.url).toBe(cursor);
    expect(calls[0]!.headers.get("prefer")).toBe(IMMUTABLE);
    expect(page.items[0]).toMatchObject({ subject: "Hi", fromName: "A", fromAddress: "a@x.com", isRead: true });
  });

  it("refuses a cursor that points away from Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(listInbox(graph, { cursor: "https://evil.example/me/messages" })).rejects.toMatchObject({ code: "invalidCursor" });
    expect(calls).toHaveLength(0);
  });

  it("surfaces a 401 from Graph", async () => {
    const { graph } = graphWith([json({ error: { code: "InvalidAuthenticationToken", message: "expired" } }, 401)]);
    await expect(listInbox(graph)).rejects.toMatchObject({ isAuth: true });
  });
});

describe("getMessage", () => {
  it("drops recipients without addresses, defaults to text, and classifies attachment kinds", async () => {
    const { graph } = graphWith([
      json({
        id: "m1",
        receivedDateTime: "t",
        toRecipients: [{ emailAddress: { address: "a@x.com" } }, { emailAddress: { name: "No address" } }, {}],
        body: { contentType: "Text", content: "plain" },
      }),
      json({
        value: [
          { "@odata.type": "#microsoft.graph.itemAttachment", id: "a1" },
          { "@odata.type": "#microsoft.graph.referenceAttachment", id: "a2", name: "link", size: 0 },
          { id: "a3", name: "doc.pdf", size: 10, isInline: true, contentType: "application/pdf" },
        ],
      }),
    ]);
    const message = await getMessage(graph, "m1");
    expect(message.to).toEqual(["a@x.com"]);
    expect(message.body).toEqual({ contentType: "text", content: "plain" });
    expect(message.attachments).toEqual([
      { id: "a1", name: "attachment", contentType: undefined, size: 0, isInline: false, kind: "item" },
      { id: "a2", name: "link", contentType: undefined, size: 0, isInline: false, kind: "reference" },
      { id: "a3", name: "doc.pdf", contentType: "application/pdf", size: 10, isInline: true, kind: "file" },
    ]);
  });

  it("treats HTML case-insensitively and tolerates a missing body and recipients", async () => {
    const { graph } = graphWith([json({ id: "m1", receivedDateTime: "t", body: { contentType: "HTML" } }), json({ value: [] })]);
    const message = await getMessage(graph, "m1");
    expect(message.body).toEqual({ contentType: "html", content: "" });
    expect(message.to).toEqual([]);

    const bare = graphWith([json({ id: "m2", receivedDateTime: "t" }), json({ value: [] })]);
    expect((await getMessage(bare.graph, "m2")).body).toEqual({ contentType: "text", content: "" });
  });

  it("rejects a malformed message id before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(getMessage(graph, "a/b")).rejects.toThrow("Invalid message id.");
    expect(calls).toHaveLength(0);
  });

  it("fails when the message is gone", async () => {
    const { graph } = graphWith([json({ error: { code: "ErrorItemNotFound", message: "not found" } }, 404), json({ value: [] })]);
    await expect(getMessage(graph, "m1")).rejects.toMatchObject({ isNotFound: true, code: "ErrorItemNotFound" });
  });
});

describe("markRead", () => {
  it("patches isRead with immutable ids, defaulting to true", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 200 }), new Response(null, { status: 204 })]);
    await markRead(graph, "m1");
    await markRead(graph, "m1", false);
    expect(calls.map((c) => [c.method, c.url, JSON.parse(String(c.body))])).toEqual([
      ["PATCH", "https://graph.microsoft.com/v1.0/me/messages/m1", { isRead: true }],
      ["PATCH", "https://graph.microsoft.com/v1.0/me/messages/m1", { isRead: false }],
    ]);
    expect(calls[0]!.headers.get("prefer")).toBe(IMMUTABLE);
  });

  it("rejects a bad id", async () => {
    const { graph } = graphWith([]);
    await expect(markRead(graph, "")).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("toSafeFileName", () => {
  it.each([
    ['a:b*c?.pdf', "a_b_c_.pdf"],
    ["report...", "report"],
    ["~$draft.docx", "_draft.docx"],
    ["x_vti_y.txt", "x_vti-y.txt"],
    ["   ", "attachment"],
    ["...", "attachment"],
    ["CON", "attachment-CON"],
  ])("maps %j to %j", (input, expected) => {
    expect(toSafeFileName(input)).toBe(expected);
  });

  it("truncates long names without an extension, or with an over-long one", () => {
    expect(toSafeFileName("x".repeat(300))).toBe("x".repeat(255));
    const longExt = `name.${"e".repeat(20)}`.padStart(300, "n");
    expect(toSafeFileName(longExt)).toHaveLength(255);
    expect(toSafeFileName(longExt).endsWith("e".repeat(20))).toBe(false);
  });
});

describe("saveAttachmentToDrive", () => {
  const meta = (over: object = {}) => json({ id: "a1", name: "Invoice.pdf", size: 3, ...over });

  it("defaults to the drive root and rename", async () => {
    const { graph, calls } = graphWith([meta(), new Response(new Uint8Array([1, 2, 3])), json(driveItem, 201)]);
    await saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d" });
    expect(calls[1]!.url).toBe("https://graph.microsoft.com/v1.0/me/messages/m1/attachments/a1/$value");
    expect(calls[2]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/root:/Invoice.pdf:/content?%40microsoft.graph.conflictBehavior=rename");
  });

  it("passes an explicit folder and conflict behaviour", async () => {
    const { graph, calls } = graphWith([meta(), new Response(new Uint8Array([1, 2, 3])), json(driveItem, 201)]);
    await saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d", folderId: "f9", conflictBehavior: "fail" });
    expect(calls[2]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/f9:/Invoice.pdf:/content?%40microsoft.graph.conflictBehavior=fail");
  });

  it("refuses attachments over the size limit before downloading", async () => {
    const { graph, calls } = graphWith([meta({ size: MAX_ATTACHMENT_BYTES + 1 })]);
    await expect(saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d" })).rejects.toMatchObject({ status: 413, code: "attachmentTooLarge" });
    expect(calls).toHaveLength(1);
  });

  it("rejects a malformed attachment id before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a b", driveId: "d" })).rejects.toThrow("Invalid attachment id.");
    expect(calls).toHaveLength(0);
  });

  it("propagates a throttled download after retries are exhausted", async () => {
    const throttled = Array.from({ length: 5 }, () => json({ error: { code: "ApplicationThrottled", message: "slow" } }, 429));
    const { graph } = graphWith([meta(), ...throttled]);
    await expect(saveAttachmentToDrive(graph, { messageId: "m1", attachmentId: "a1", driveId: "d" })).rejects.toMatchObject({ status: 429, code: "ApplicationThrottled" });
  });
});

describe("sendMail", () => {
  it("sends cc recipients and can skip Sent Items", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 202 })]);
    await sendMail(graph, { to: ["a@x.com"], cc: ["b@x.com"], subject: "S", htmlBody: "<p>x</p>", saveToSentItems: false });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({
      message: {
        subject: "S",
        body: { contentType: "HTML", content: "<p>x</p>" },
        toRecipients: [{ emailAddress: { address: "a@x.com" } }],
        ccRecipients: [{ emailAddress: { address: "b@x.com" } }],
      },
      saveToSentItems: false,
    });
  });

  it("requires at least one recipient", async () => {
    const { graph, calls } = graphWith([]);
    await expect(sendMail(graph, { to: [], cc: ["b@x.com"], subject: "S", htmlBody: "" })).rejects.toThrow("At least one recipient is required.");
    expect(calls).toHaveLength(0);
  });

  it("refuses more than 100 recipients across to and cc", async () => {
    const { graph, calls } = graphWith([]);
    const many = Array.from({ length: 60 }, (_, i) => `u${i}@x.com`);
    await expect(sendMail(graph, { to: many, cc: many, subject: "S", htmlBody: "" })).rejects.toThrow("Too many recipients.");
    await expect(sendMail(graph, { to: [...many, ...many], subject: "S", htmlBody: "" })).rejects.toThrow("Too many recipients.");
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid cc address", async () => {
    const { graph, calls } = graphWith([]);
    await expect(sendMail(graph, { to: ["a@x.com"], cc: ["not-an-email"], subject: "S", htmlBody: "" })).rejects.toThrow("Invalid email address.");
    expect(calls).toHaveLength(0);
  });

  it("does not retry a 503 on send, so the message cannot be sent twice", async () => {
    const { graph, calls } = graphWith([json({ error: { code: "ServiceUnavailable", message: "down" } }, 503)]);
    await expect(sendMail(graph, { to: ["a@x.com"], subject: "S", htmlBody: "" })).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });
});
