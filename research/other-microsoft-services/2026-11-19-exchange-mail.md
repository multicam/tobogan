# Exchange mail: read, render, attachments, send

**Question:** how do we show a user's mail, render message bodies safely, and move attachments into SharePoint?

Implemented in `spikes/nextjs-m365/lib/m365/mail.ts` and `lib/m365/email-html.ts`.

## Decisions

1. **Use immutable ids on every mail call.** Default message ids change when a message is moved, which breaks ids held in URLs and Server Actions. The spike sends `Prefer: IdType="ImmutableId"` on each request.
2. **Render bodies in a sandboxed iframe, never in the app's DOM.** See below.
3. **Fetch attachment bytes with `/$value`, after checking the type and size.**
4. **Sanitise attachment names and never overwrite when saving to SharePoint.**
5. **Treat a sent message as queued, not delivered.**
6. **Page the inbox** and clamp the page size.

## Rendering message bodies

The guide installs `isomorphic-dompurify` but never uses it, and has no message view.

The spike does not sanitise on the server. It puts the body into `<iframe sandbox srcDoc>` without `allow-scripts` or `allow-same-origin`, which gives the content a unique origin with scripts and forms disabled. A Content Security Policy inside that document blocks every network load, so remote images and CSS cannot report that the message was opened. Remote images can be turned on per message (`allowRemoteImages`).

Why not `isomorphic-dompurify` on the server:

- It depends on jsdom. Its README documents `ERR_REQUIRE_ESM` failures on Next.js on Vercel from version 3, with a workaround of pinning jsdom to 25.0.1, and a memory leak in long-running processes unless `clearWindow()` is called.
- DOMPurify removes script-based attacks only. It allows `<style>` and remote resources by default, so it does not stop tracking images on its own.

If email HTML ever has to be placed in the app's own DOM, sanitise in the browser with plain `dompurify` and still block remote loads.

Exchange already strips unsafe HTML such as JavaScript from `body` by default (`Prefer: outlook.allow-unsafe-html` turns that off; never send it). That is a service-side filter, not a guarantee to rely on.

## Verified facts

**Listing**

- Default page size is 10; `$top` accepts 1 to 1000. Follow the whole `@odata.nextLink`.
- When `$filter` and `$orderby` are combined, the `$orderby` properties must also appear first in `$filter`, in the same order, or the call fails with `InefficientFilter`.
- `$search` returns at most 1,000 results.
- `hasAttachments` is `false` for messages that contain only inline images.

**Ids**

- The immutable-id header applies only to the request that carries it. The id stays stable within the mailbox and changes if the item moves to an archive mailbox.

**Attachments**

- `fileAttachment` has bytes. `itemAttachment` (an attached message, event or contact) and `referenceAttachment` (a cloud link) do not; `/$value` on a reference attachment returns 405.
- `GET .../attachments/{id}/$value` returns raw bytes, avoiding the base64 `contentBytes` field that inflates the payload by a third.
- Attachment `name` is free text from the sender and need not be a valid file name.
- Inline images are referenced from the body as `cid:` and matched by the attachment's `contentId`.

**Sending**

- `POST /me/sendMail` returns 202, which means accepted for delivery. `saveToSentItems` defaults to true.
- Attachments under 3 MB can be included in the JSON. From 3 to 150 MB: create a draft, `POST .../attachments/createUploadSession`, PUT ranges under 4 MB without the `Authorization` header, then `POST .../send`.
- Reply and forward have their own endpoints (`reply`, `replyAll`, `forward`, and the `createReply` draft variants).

**Permissions and limits**

- Reading needs `Mail.Read`. `Mail.ReadWrite` is needed only to change messages (mark as read, drafts, moves). The guide requests `Mail.ReadWrite` for reading.
- Per app and mailbox: 10,000 requests per 10 minutes and 4 concurrent requests.

## What the spike adds beyond the guide

| Guide | Spike |
| --- | --- |
| Raw HTML body returned, no viewer | Sandboxed viewer document with network loads blocked |
| Ids break when mail is moved | Immutable ids |
| Attachment read as base64 JSON, any type | Type and size checked, raw bytes |
| Sender-chosen name used as the SharePoint path | `toSafeFileName`, conflict behaviour `rename` |
| First page only | Cursor paging, page size capped at 100 |
| Comma-joined or malformed recipients pass through | Each address validated, recipient count capped |

## Not yet in the spike

- **Inline images.** `cid:` images show as broken. To support them, serve attachment bytes from an authenticated route and rewrite `cid:` references to it (the viewer's CSP then needs that route in `img-src`).
- **Outgoing attachments**, reply and forward.
- **Shared mailboxes.** Calls use `/me`. A shared mailbox uses `/users/{id}/...` with the `.Shared` scopes and Send As or Send on Behalf rights.
- **Attached items.** Saving an attached email (`itemAttachment`) is refused; `/$value` would return it as MIME if wanted.
- **Large attachments.** Bytes are held in memory, capped at 150 MB. Streaming would need a client change.

## Unverified

- Exchange sending limits (30 messages per minute, 10,000 recipients per day, 500 recipients per message by default) come from search summaries of the service description.
- That `Mail.ReadBasic` excludes `bodyPreview` and attachments (search summary).
- `$select` on the attachments list is used by the spike and is common practice, but the page read does not document it; confirm on a tenant.

## Sources

- `microsoftgraph/microsoft-graph-docs-contrib`: `api-reference/v1.0/api/user-list-messages.md`, `message-get.md`, `message-update.md`, `message-delta.md`, `attachment-get.md`, `attachment-createuploadsession.md`, `user-sendmail.md`; `concepts/outlook-immutable-id.md`, `outlook-create-send-messages.md`, `outlook-large-attachments.md`, `outlook-share-messages-folders.md`; `includes/throttling-outlook.md`
- https://raw.githubusercontent.com/cure53/DOMPurify/main/README.md
- https://raw.githubusercontent.com/kkomelin/isomorphic-dompurify/master/README.md
