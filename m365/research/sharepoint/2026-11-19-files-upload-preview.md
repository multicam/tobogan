# SharePoint files: browse, upload, preview, edit

**Question:** how do we list, upload, preview and edit SharePoint documents reliably from Next.js?

Implemented in `m365/spike/lib/m365/drive.ts` and `app/api/upload/route.ts`.

## Decisions

1. **Page folder listings.** Graph returns 200 children per page by default; the guide drops the rest. `listChildren` returns a cursor.
2. **Sort in code.** `$orderby` on SharePoint drives is unreliable beyond `name`, with community reports of errors, so the spike sorts each page (folders first, then natural name order). For exact ordering across pages, load all pages first.
3. **Never overwrite by default.** A plain `PUT .../content` defaults to `replace`. The spike always sends `@microsoft.graph.conflictBehavior` (`fail` for user uploads to a named file, `rename` for the streaming route and saved attachments).
4. **Two upload paths.** Up to 4 MiB: one PUT. Above: an upload session, streamed 5 MiB at a time.
5. **Uploads do not go through a Server Action.** The browser PUTs the raw file to a route handler, which pipes it to the upload session without buffering the file.
6. **Validate names and ids before building URLs.** `assertValidFileName` applies SharePoint's rules; ids from the browser must be a single path segment.
7. **Preview in an iframe, edit in a new tab.**
8. **Create documents from a template, not from an empty file.**

## Verified facts

**Upload**

- Simple PUT supports files up to 250 MB. The spike uses 4 MiB as its own threshold, because a session is resumable and avoids holding a large body in memory.
- `conflictBehavior` values are `fail`, `replace`, `rename`. On PUT it goes in the query string; in `createUploadSession` it goes in the body as `{"item": {"@microsoft.graph.conflictBehavior": "rename"}}`.
- Upload session fragments must be a multiple of 320 KiB (327,680 bytes), each request under 60 MiB, 5 to 10 MiB recommended. The spike uses 16 x 320 KiB.
- PUTs to the `uploadUrl` must **not** carry the `Authorization` header. `GET uploadUrl` returns `nextExpectedRanges` for resuming; `DELETE uploadUrl` cancels.
- The session needs the exact total size, so the browser must send `Content-Length`.

**Names**

- Not allowed: `" * : < > ? / \ |`, leading or trailing spaces, a trailing period, names starting `~$`, `_vti_` anywhere, reserved device names. The decoded path is limited to 400 characters.

**Preview**

- `POST /drives/{id}/items/{id}/preview` returns `getUrl`, `postUrl` and `postParameters`; either URL may be missing. The spike raises an error when `getUrl` is absent.
- The URL is short-lived and acts with the caller's permissions: never cache, log or share it.
- It is a read-only preview. It is not an editor.
- `createLink` with `type: "embed"` works only on OneDrive personal, so it is not an option for SharePoint.

**Editing**

- `webUrl` opens the item in the browser; for Office files that is Office for the web, where co-authoring and saving are handled by SharePoint. Graph's documentation says only that it opens the resource in a browser.
- SharePoint blocks most cross-origin framing of its own pages, so an embedded editor is not a supported path. Open `webUrl` in a new tab.

## What the spike adds beyond the guide

| Guide | Spike |
| --- | --- |
| Whole file buffered through a Server Action (1 MB default limit) | Streaming route handler, memory use independent of file size |
| Silent overwrite | Explicit conflict behaviour on every write |
| First 200 items only | Cursor paging |
| Two Graph lookups per operation for site and drive | Cached per process, optional named library |
| File name passed straight into the URL | Validated; path traversal through ids rejected |
| No retry of a failed fragment | Per-fragment retry, handles "already received" (416), cancels the session on failure |

## Blank Office documents

The guide uploads a zero-byte `.docx` and states that this "initializes an editable Office Online file". No documentation supports that, and reports are mixed. Use one of:

- Keep real blank templates (`.docx`, `.xlsx`, `.pptx`) in a templates folder and copy one: `POST /drives/{id}/items/{templateId}/copy` (asynchronous, returns 202 with a monitor URL). Implemented as `createFromTemplate`; the spike does not yet poll the monitor URL.
- Ship the template bytes with the app and upload them.

## Unverified, to test on a tenant

- That the preview `getUrl` frames from the app's origin on the target tenant. `next.config.ts` allows `*.sharepoint.com` and `*.officeapps.live.com` in `frame-src`; the list may need another host.
- That `$select=folder` always returns `childCount`.
- Maximum file size (250 GB is widely quoted; not confirmed from a fetched page).
- A zero-byte Office file, if that shortcut is still wanted.
- The streaming route under the real host's request duration and body limits.

## Sources

`microsoftgraph/microsoft-graph-docs-contrib`, `api-reference/v1.0/api/`: `driveitem-list-children.md`, `driveitem-put-content.md`, `driveitem-createuploadsession.md`, `driveitem-preview.md`, `driveitem-createlink.md`; `resources/driveitem.md`.
