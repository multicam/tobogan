# GRAPH: The Graph client

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** what should sit between the app and Microsoft Graph so that throttling, paging and failures are handled once?

## Doctrines

**GRAPH-1. All Graph traffic goes through one client.**
A thin client over `fetch`, about 200 lines, that takes a `getAccessToken()` function.
- Why: retry, paging and error handling done once instead of at every call site. No SDK: `@microsoft/microsoft-graph-client` 3.1.0 now needs Node 22 and a fetch polyfill import, and it was not verified whether `Client.init` includes retry. Its successor `@microsoft/msgraph-sdk` is still pre-release (`1.0.0-preview.92`).
- Basis: Tested
- Code: `spike/lib/m365/graph-client.ts`. If the existing app already uses the v3 SDK, keep it and add GRAPH-2 to GRAPH-6 around it.

**GRAPH-2. Retry 429 for every verb, honouring `Retry-After`. Retry 502, 503, 504 and network errors only for GET, HEAD, PUT and DELETE.**
Waits are capped at 30 seconds, with at most four retries.
- Why: a 429 was not processed, so repeating it is always safe. A failed POST may have been processed, and repeating `sendMail` or `invite` would send twice.
- Evidence: Graph and SharePoint signal throttling with 429 (SharePoint also 503), both with `Retry-After`. Throttled requests still count against the limit, so retrying early makes throttling worse (`throttling.md`, SharePoint throttling guidance).
- Basis: Verified, Tested

**GRAPH-3. Page everything; never treat one response as the whole set.**
`getPage` returns items plus the `@odata.nextLink` cursor; `getAll` follows it up to a cap.
- Why: folder listings stop at 200 items and the inbox at 10 by default; the guide silently drops the rest.
- Basis: Verified, Tested

**GRAPH-4. The bearer token is sent only to `https://graph.microsoft.com`.**
Absolute URLs are accepted only as paging cursors, and only for that host over HTTPS.
- Why: a cursor that travels through the browser can be tampered with to redirect the token to another host.
- Basis: Tested

**GRAPH-5. Errors keep Graph's status, error code and `request-id`.**
- Why: callers branch on status and code (403, 404, 409); support tickets with Microsoft need the request id.
- Basis: Tested
- Code: `GraphError`

**GRAPH-6. Identify the app and never cache per-user responses.**
Send a `User-Agent` of the form `NONISV|Company|App/Version`; every request uses `cache: "no-store"`.
- Why: SharePoint asks apps to identify themselves; a cached response could be served to another user.
- Basis: Verified, Tested

**GRAPH-7. Stay under four concurrent Outlook requests per mailbox.**
- Why: Outlook allows 4 concurrent requests and 10,000 requests per 10 minutes per app and mailbox.
- Evidence: `includes/throttling-outlook.md`
- Basis: Verified
- Code: Gap: the spike's page makes at most three Outlook calls at once, but there is no general limiter for screens that fan out further.

**GRAPH-8. Track changes with delta queries, not by refetching.**
- Files: `GET /drives/{id}/root/delta`; `410 Gone` means resync. SharePoint subscriptions work only on the drive root with `changeType: "updated"`, last under 30 days and carry no item detail, so each notification is followed by a delta call.
- Mail: per-folder `messages/delta`; subscriptions last under 7 days and need the immutable-id header when created.
- Webhooks must echo `validationToken` as `text/plain` within 10 seconds and answer notifications within 3 seconds.
- Basis: Verified
- Code: Gap: not built.

## Open

- **Unverified:** that site and drive ids never change. The spike caches them per process; treat a 404 on a cached id as a signal to clear the cache, or configure the ids directly.
- **Unverified:** SharePoint `RateLimit-*` headers. The documentation contradicts itself, so the client does not rely on them.
- JSON batching (up to 20 requests) is not used yet; consider it for screens with many small reads.

## Reference

- SharePoint resource-unit cost: 1 for a single-item read, 2 for list, create or upload, 5 for any permission operation.
- Outlook: 150 MB of upload per 5 minutes per app and mailbox.
- JSON batches: at most 20 requests, at most 4 at a time to Outlook. The batch returns 200 while individual entries can be 429.
- Site and drive lookup: `GET /sites/{hostname}:/{path}`, then `/sites/{id}/drive` (default library) or `/sites/{id}/drives` (all libraries).

## Sources

- `microsoftgraph/microsoft-graph-docs-contrib`: `concepts/throttling.md`, `concepts/throttling-limits.md`, `includes/throttling-outlook.md`, `concepts/json-batching.md`, `api-reference/v1.0/api/site-getbypath.md`, `drive-get.md`, `drive-list.md`, `driveitem-delta.md`, `resources/subscription.md`
- `SharePoint/sp-dev-docs`: `docs/general-development/how-to-avoid-getting-throttled-or-blocked-in-sharepoint-online.md`
- npm registry: `@microsoft/microsoft-graph-client`, `@microsoft/msgraph-sdk`
