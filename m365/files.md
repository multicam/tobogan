# FILES: SharePoint files

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** how do we list, upload, preview and edit SharePoint documents reliably from Next.js?

## Doctrines

**FILES-1. Page folder listings and sort them in code.**
`listChildren` returns a cursor. Each page is sorted folders first, then by natural name order; load every page first when exact order across pages matters.
- Why: Graph returns 200 children per page by default. `$orderby` on SharePoint drives is unreliable beyond `name`, with community reports of errors.
- Evidence: `driveitem-list-children.md`; Microsoft tech community thread on `$orderby` for SharePoint drive items.
- Basis: Verified, Tested

**FILES-2. Never overwrite unless the caller asks for it.**
Every write sends `@microsoft.graph.conflictBehavior`: `fail` for a named upload, `rename` for the streaming route and saved attachments.
- Why: a plain `PUT .../content` defaults to `replace`, so the guide silently overwrites files.
- Evidence: values are `fail`, `replace`, `rename`; on PUT the value goes in the query string, in `createUploadSession` in the body (`resources/driveitem.md`, `driveitem-createuploadsession.md`).
- Basis: Verified, Tested

**FILES-3. Upload files up to 4 MiB in one PUT and everything larger through a resumable upload session.**
Fragments are 16 × 320 KiB (5 MiB). A failed fragment is retried; a fragment the server already has (416) is skipped after checking `nextExpectedRanges`; any failure cancels the session.
- Why: a session is resumable and never holds the whole file in memory. The 4 MiB threshold is ours; simple PUT itself accepts up to 250 MB.
- Evidence: fragments must be multiples of 320 KiB (327,680 bytes), each request under 60 MiB, 5 to 10 MiB recommended. PUTs to `uploadUrl` must not carry the `Authorization` header (`driveitem-createuploadsession.md`, `driveitem-put-content.md`).
- Basis: Verified, Tested
- Code: `uploadSmall`, `uploadLarge`, `upload` in `spike/lib/m365/drive.ts`

**FILES-4. File bytes never pass through a Server Action.**
The browser PUTs the raw file to a route handler, which streams it into an upload session. See NEXT-2.
- Why: Server Actions accept 1 MB by default and buffer the whole body.
- Basis: Verified, Tested
- Code: `spike/app/api/upload/route.ts`

**FILES-5. Validate file names and ids before they become part of a URL.**
Names follow SharePoint's rules; ids from the browser must be a single path segment.
- Why: a crafted id such as `abc/../../users` would change which Graph resource is called.
- Evidence: SharePoint rejects `" * : < > ? / \ |`, leading or trailing spaces, a trailing period, names starting `~$`, `_vti_` anywhere and reserved device names; decoded paths are limited to 400 characters (Microsoft support "Restrictions and limitations", search summary).
- Basis: Tested (name rules Unverified against a fetched page)
- Code: `spike/lib/m365/names.ts`

**FILES-6. Preview in an iframe; edit in a new tab.**
Preview with `POST .../preview` and frame its `getUrl`; edit by opening the item's `webUrl` in a new tab.
- Why: the preview is read-only and short-lived, and acts with the caller's permissions, so it must never be cached, logged or shared. SharePoint blocks most cross-origin framing of its own pages, so an embedded editor is not a supported path. `createLink` type `embed` works only on OneDrive personal.
- Evidence: `driveitem-preview.md` (either `getUrl` or `postUrl` may be missing); `driveitem-createlink.md`; Microsoft troubleshooting article on cross-domain iframe requests blocked in SharePoint Online (search summary).
- Basis: Verified (framing Unverified)
- Code: `getPreviewUrl` raises an error when `getUrl` is missing.

**FILES-7. Create documents from templates, never from empty files.**
Keep real blank `.docx`, `.xlsx` and `.pptx` files in a templates folder and copy one, or upload template bytes shipped with the app.
- Why: the guide's zero-byte upload has no documentation behind it and community reports are mixed.
- Basis: Decision (in the absence of evidence for the shortcut), Tested
- Code: `createFromTemplate` returns the monitor URL from the 202; `waitForCopy` polls it without a token, only on Microsoft hosts, and returns the new item's id. Unverified: the monitor's response shape (`status`, `resourceId`) is taken from Graph's long-running operations pattern and must be checked on a tenant.

**FILES-8. Resolve the site and library once, not on every operation.**
`resolveDrive` caches ids per process and accepts a named library.
- Why: the guide makes two extra Graph calls per operation and only reaches the site's default library.
- Basis: Tested (id stability Unverified, see GRAPH Open)

## Open

Test on a tenant:
- that the preview `getUrl` frames from the app's origin (`next.config.ts` allows `*.sharepoint.com` and `*.officeapps.live.com`; another host may be needed);
- that `$select=folder` always returns `childCount`;
- the streaming route under the real host's request duration and body limits, with a file over 100 MB;
- the maximum file size (250 GB is widely quoted, not confirmed from a fetched page).

## Sources

`microsoftgraph/microsoft-graph-docs-contrib`, `api-reference/v1.0/api/`: `driveitem-list-children.md`, `driveitem-put-content.md`, `driveitem-createuploadsession.md`, `driveitem-preview.md`, `driveitem-createlink.md`; `resources/driveitem.md`.
