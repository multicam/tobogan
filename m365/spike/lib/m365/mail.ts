import { GraphError, seg, type GraphClient, type GraphPage } from "./graph-client";
import { upload, type ConflictBehavior, type DriveItemSummary } from "./drive";
import { assertEmail, assertId, assertValidFileName, InvalidInputError } from "./names";

/** Ids that survive the message being moved between folders. */
const IMMUTABLE_ID = { Prefer: 'IdType="ImmutableId"' };

export interface MessageSummary {
  id: string;
  subject: string;
  fromName?: string;
  fromAddress?: string;
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  conversationId?: string;
}

export interface AttachmentSummary {
  id: string;
  name: string;
  contentType?: string;
  size: number;
  isInline: boolean;
  /** file | item | reference. Only "file" has downloadable bytes. */
  kind: "file" | "item" | "reference";
}

export interface MessageDetail extends MessageSummary {
  to: string[];
  /** Untrusted HTML or text. Render only inside the sandboxed viewer. */
  body: { contentType: "html" | "text"; content: string };
  attachments: AttachmentSummary[];
}

interface RawRecipient {
  emailAddress?: { name?: string; address?: string };
}
interface RawMessage {
  id: string;
  subject?: string;
  from?: RawRecipient;
  toRecipients?: RawRecipient[];
  receivedDateTime: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  conversationId?: string;
  body?: { contentType?: string; content?: string };
}
interface RawAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

const LIST_SELECT = "id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,conversationId";

function toSummary(m: RawMessage): MessageSummary {
  return {
    id: m.id,
    subject: m.subject || "(No subject)",
    fromName: m.from?.emailAddress?.name,
    fromAddress: m.from?.emailAddress?.address,
    receivedDateTime: m.receivedDateTime,
    bodyPreview: m.bodyPreview ?? "",
    isRead: Boolean(m.isRead),
    hasAttachments: Boolean(m.hasAttachments),
    conversationId: m.conversationId,
  };
}

function toAttachment(a: RawAttachment): AttachmentSummary {
  const type = a["@odata.type"] ?? "";
  return {
    id: a.id,
    name: a.name ?? "attachment",
    contentType: a.contentType,
    size: a.size ?? 0,
    isInline: Boolean(a.isInline),
    kind: type.endsWith("itemAttachment") ? "item" : type.endsWith("referenceAttachment") ? "reference" : "file",
  };
}

export async function listInbox(
  graph: GraphClient,
  options: { cursor?: string; pageSize?: number } = {},
): Promise<GraphPage<MessageSummary>> {
  const page = options.cursor
    ? await graph.getPage<RawMessage>(options.cursor, { headers: IMMUTABLE_ID })
    : await graph.getPage<RawMessage>("/me/mailFolders/inbox/messages", {
        headers: IMMUTABLE_ID,
        query: { $select: LIST_SELECT, $orderby: "receivedDateTime desc", $top: Math.min(options.pageSize ?? 25, 100) },
      });
  return { items: page.items.map(toSummary), nextLink: page.nextLink };
}

export async function getMessage(graph: GraphClient, messageId: string): Promise<MessageDetail> {
  const base = `/me/messages/${seg(assertId(messageId, "message id"))}`;
  const [message, attachments] = await Promise.all([
    graph.request<RawMessage>("GET", base, {
      headers: IMMUTABLE_ID,
      query: { $select: `${LIST_SELECT},toRecipients,body` },
    }),
    // Listed separately with $select so attachment bytes are never pulled here.
    graph.getAll<RawAttachment>(`${base}/attachments`, {
      headers: IMMUTABLE_ID,
      query: { $select: "id,name,contentType,size,isInline" },
      maxItems: 200,
    }),
  ]);
  return {
    ...toSummary(message),
    to: (message.toRecipients ?? []).map((r) => r.emailAddress?.address).filter((v): v is string => Boolean(v)),
    body: {
      contentType: message.body?.contentType?.toLowerCase() === "html" ? "html" : "text",
      content: message.body?.content ?? "",
    },
    attachments: attachments.map(toAttachment),
  };
}

export async function markRead(graph: GraphClient, messageId: string, isRead = true): Promise<void> {
  await graph.request("PATCH", `/me/messages/${seg(assertId(messageId, "message id"))}`, {
    headers: IMMUTABLE_ID,
    json: { isRead },
    responseType: "none",
  });
}

/** Largest attachment this helper will buffer in memory. */
export const MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024;

/** Replace characters SharePoint rejects so any attachment name can be saved. */
export function toSafeFileName(name: string): string {
  let safe = name.replace(/["*:<>?/\\|\u0000-\u001f]/g, "_").trim().replace(/\.+$/, "");
  if (safe.startsWith("~$")) safe = `_${safe.slice(2)}`;
  safe = safe.replace(/_vti_/gi, "_vti-");
  if (!safe) safe = "attachment";
  if (safe.length > 255) {
    const dot = safe.lastIndexOf(".");
    const ext = dot > 0 && safe.length - dot <= 16 ? safe.slice(dot) : "";
    safe = safe.slice(0, 255 - ext.length) + ext;
  }
  try {
    return assertValidFileName(safe);
  } catch {
    return `attachment-${safe}`.slice(0, 255);
  }
}

/** Copy one file attachment into a SharePoint folder. Never overwrites by default. */
export async function saveAttachmentToDrive(
  graph: GraphClient,
  input: { messageId: string; attachmentId: string; driveId: string; folderId?: string; conflictBehavior?: ConflictBehavior },
): Promise<DriveItemSummary> {
  const base = `/me/messages/${seg(assertId(input.messageId, "message id"))}/attachments/${seg(assertId(input.attachmentId, "attachment id"))}`;
  const meta = toAttachment(
    await graph.request<RawAttachment>("GET", base, {
      headers: IMMUTABLE_ID,
      query: { $select: "id,name,contentType,size,isInline" },
    }),
  );
  if (meta.kind !== "file") {
    throw new GraphError(422, "unsupportedAttachment", "Only file attachments can be saved (not attached items or cloud links).");
  }
  if (meta.size > MAX_ATTACHMENT_BYTES) {
    throw new GraphError(413, "attachmentTooLarge", "Attachment is too large to copy.");
  }
  // $value returns the raw bytes; avoids base64 inflating memory by a third.
  const bytes = await graph.request<Uint8Array>("GET", `${base}/$value`, { headers: IMMUTABLE_ID, responseType: "bytes" });
  return upload(graph, input.driveId, input.folderId ?? "root", toSafeFileName(meta.name), bytes, {
    conflictBehavior: input.conflictBehavior ?? "rename",
  });
}

export async function sendMail(
  graph: GraphClient,
  input: { to: string[]; subject: string; htmlBody: string; cc?: string[]; saveToSentItems?: boolean },
): Promise<void> {
  if (input.to.length === 0) throw new InvalidInputError("At least one recipient is required.");
  if (input.to.length + (input.cc?.length ?? 0) > 100) throw new InvalidInputError("Too many recipients.");
  const recipients = (list: string[] = []) => list.map((address) => ({ emailAddress: { address: assertEmail(address) } }));
  // 202 Accepted: queued for delivery, not confirmation that it was delivered.
  await graph.request("POST", "/me/sendMail", {
    json: {
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.htmlBody },
        toRecipients: recipients(input.to),
        ccRecipients: recipients(input.cc),
      },
      saveToSentItems: input.saveToSentItems ?? true,
    },
    responseType: "none",
  });
}
