# MAIL: Exchange mail

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** how do we show a user's mail, render message bodies safely, and move attachments into SharePoint?

## Doctrines

**MAIL-1. Every mail call asks for immutable ids.**
Send `Prefer: IdType="ImmutableId"` on each request.
- Why: default message ids change when a message is moved, which breaks ids held in URLs and Server Actions.
- Evidence: the header applies only to the request that carries it; the id stays stable within the mailbox and changes on a move to an archive mailbox (`outlook-immutable-id.md`).
- Basis: Verified, Tested

**MAIL-2. Email HTML never enters the app's DOM.**
The body goes into `<iframe sandbox srcDoc>` without `allow-scripts` or `allow-same-origin`, which gives it a unique origin with scripts and forms disabled. Links may open in a new tab; nothing else is allowed.
- Why: email HTML is written by outsiders. Server-side sanitising with `isomorphic-dompurify` brings jsdom, whose README documents `ERR_REQUIRE_ESM` failures on Next.js on Vercel and a memory leak in long-running processes. If HTML must ever enter the DOM, sanitise in the browser with plain `dompurify`.
- Evidence: DOMPurify and isomorphic-dompurify READMEs. Exchange strips unsafe HTML such as JavaScript by default (`outlook-create-send-messages.md`); that is a service-side filter, not something to rely on, and `Prefer: outlook.allow-unsafe-html` must never be sent.
- Basis: Verified, Tested
- Code: `buildEmailDocument`, `EMAIL_IFRAME_SANDBOX` in `spike/lib/m365/email-html.ts`

**MAIL-3. Remote content in email is blocked by default.**
A Content Security Policy inside the viewer document blocks every network load; remote images can be enabled per message.
- Why: remote images and CSS report to the sender that the message was opened. DOMPurify does not prevent this: it allows `<style>` and remote resources.
- Basis: Tested
- Code: `allowRemoteImages` option

**MAIL-4. Copy only file attachments, as raw bytes, after checking type and size.**
- Why: `itemAttachment` (an attached message, event or contact) and `referenceAttachment` (a cloud link) have no file bytes, and `/$value` on a reference attachment returns 405. Base64 `contentBytes` inflates the payload by a third.
- Evidence: `attachment-get.md`
- Basis: Verified, Tested
- Code: `saveAttachmentToDrive` (capped at 150 MB, held in memory)

**MAIL-5. Sanitise sender-supplied names, and never overwrite when filing into SharePoint.**
- Why: an attachment's `name` is free text from the sender and need not be a valid file name; two attachments with the same name must both survive.
- Basis: Tested
- Code: `toSafeFileName`; conflict behaviour `rename`

**MAIL-6. A sent message is queued, not delivered.**
- Why: `POST /me/sendMail` returns 202, which only means accepted.
- Evidence: `user-sendmail.md`
- Basis: Verified, Tested

**MAIL-7. Read with `Mail.Read`; request `Mail.ReadWrite` only to change messages.**
- Why: the guide requests `Mail.ReadWrite` for reading. Write access is needed only to mark as read, draft or move.
- Basis: Verified
- Code: the spike requests `Mail.ReadWrite` because it includes `markRead`.

**MAIL-8. Page the inbox and cap the page size.**
- Why: the default page is 10 messages; `$top` accepts 1 to 1000.
- Basis: Verified, Tested
- Code: `listInbox` caps at 100.

## Open

- **Not built:**
  - Inline images: `cid:` images show as broken. To fix, serve attachment bytes from an authenticated route, rewrite `cid:` references to it and allow that route in the viewer's `img-src`.
  - Outgoing attachments, reply and forward.
  - Shared mailboxes: `/users/{id}/...` with the `.Shared` scopes and Send As or Send on Behalf rights.
  - Filing an attached email (`itemAttachment`), which `/$value` would return as MIME.
  - Streaming large attachments.
- **Unverified:** Exchange sending limits (30 messages per minute, 10,000 recipients per day, 500 recipients per message by default) come from search summaries.
- **Unverified:** that `Mail.ReadBasic` excludes `bodyPreview` and attachments.
- **Unverified:** `$select` on the attachments list is undocumented on the page read; confirm on a tenant.

## Reference

- Combining `$filter` and `$orderby`: the `$orderby` properties must appear first in `$filter`, in the same order, or the call fails with `InefficientFilter`.
- `$search` returns at most 1,000 results.
- `hasAttachments` is `false` for messages with only inline images. Inline images are referenced as `cid:` and matched by the attachment's `contentId`.
- Attachments under 3 MB can be sent in the JSON; from 3 to 150 MB, create a draft, `POST .../attachments/createUploadSession`, PUT ranges under 4 MB without the `Authorization` header, then `POST .../send`.
- Reply and forward: `reply`, `replyAll`, `forward`, and the `createReply` draft variants.

## Sources

- `microsoftgraph/microsoft-graph-docs-contrib`: `api-reference/v1.0/api/user-list-messages.md`, `message-get.md`, `message-update.md`, `message-delta.md`, `attachment-get.md`, `attachment-createuploadsession.md`, `user-sendmail.md`; `concepts/outlook-immutable-id.md`, `outlook-create-send-messages.md`, `outlook-large-attachments.md`, `outlook-share-messages-folders.md`; `includes/throttling-outlook.md`
- https://raw.githubusercontent.com/cure53/DOMPurify/main/README.md
- https://raw.githubusercontent.com/kkomelin/isomorphic-dompurify/master/README.md
