# Graph client: retries, paging and errors

**Question:** what should sit between the app and Microsoft Graph so that throttling, paging and failures are handled once?

## Decision

A thin client over `fetch` (`spikes/nextjs-m365/lib/m365/graph-client.ts`, about 200 lines) that takes a `getAccessToken()` function. It has no SDK dependency and is covered by unit tests.

Why not an SDK:

- `@microsoft/microsoft-graph-client` 3.1.0 works and has no deprecation notice, but its README now requires Node 22 and a fetch polyfill import, and whether `Client.init` (as the guide uses it) includes the retry middleware was not verified.
- `@microsoft/msgraph-sdk` (the Kiota-based successor) is still pre-release (`1.0.0-preview.92`).

If the existing repo already uses the v3 SDK, keeping it is fine provided the behaviours below are added around it.

## Behaviours the client guarantees

| Behaviour | Detail |
| --- | --- |
| Throttling | On 429, waits for `Retry-After` (seconds or HTTP date), capped at 30 s, up to 4 retries. Safe for every verb because a 429 was not processed. |
| Server errors | 502, 503, 504 and network errors are retried only for GET, HEAD, PUT, DELETE, so a POST such as `sendMail` or `invite` is never sent twice. |
| Paging | `getPage` returns items plus the `@odata.nextLink` cursor; `getAll` follows it up to a cap. |
| Cursor safety | Absolute URLs are accepted only for `https://graph.microsoft.com`. A cursor that went through the browser cannot redirect the bearer token to another host. |
| Errors | `GraphError` with `status`, Graph `code`, message and `request-id` for support tickets. |
| Identification | Sends a `User-Agent` in the `NONISV|Company|App/Version` form SharePoint asks for. |
| No caching | Every request uses `cache: "no-store"`; responses are per user. |

## Verified facts

- Graph and SharePoint signal throttling with 429 (SharePoint also 503), both with `Retry-After`. Throttled requests still count against the limit, so retrying early makes it worse.
- SharePoint resource-unit cost: 1 for a single-item read, 2 for list, create or upload, 5 for any permission operation.
- Outlook limits per app and mailbox: 10,000 requests per 10 minutes, 4 concurrent requests, 150 MB of upload per 5 minutes.
- JSON batching takes at most 20 requests (4 at a time to Outlook). The batch returns 200 while individual entries can be 429.
- Site and drive lookups: `GET /sites/{hostname}:/{path}` then `/sites/{id}/drive` (default library) or `/sites/{id}/drives` (all libraries).

## Still to add when needed

- **Concurrency limit per user.** One page render in the spike makes at most three concurrent Outlook calls. A screen that fans out further should queue to stay under Outlook's four concurrent requests.
- **Batching** for screens that need many small reads.
- **Change tracking** instead of refetching:
  - Files: `GET /drives/{id}/root/delta`; `410 Gone` means resync. Subscriptions on SharePoint are only supported on the drive root with `changeType: "updated"`, last under 30 days, and carry no item detail, so each notification is followed by a delta call.
  - Mail: per-folder `messages/delta`; subscriptions last under 7 days and need the immutable-id header at creation.
  - Webhook endpoints must echo `validationToken` as `text/plain` within 10 seconds and answer notifications within 3 seconds.

## Unverified

- No official statement was found that site and drive ids never change. The spike caches them per process; treat a 404 on a cached id as a signal to clear the cache, or configure the ids directly.
- SharePoint `RateLimit-*` headers: the documentation is contradictory, so the client does not rely on them.

## Sources

- `microsoftgraph/microsoft-graph-docs-contrib`: `concepts/throttling.md`, `concepts/throttling-limits.md`, `includes/throttling-outlook.md`, `concepts/json-batching.md`, `api-reference/v1.0/api/site-getbypath.md`, `drive-get.md`, `drive-list.md`, `driveitem-delta.md`, `resources/subscription.md`
- `SharePoint/sp-dev-docs`: `docs/general-development/how-to-avoid-getting-throttled-or-blocked-in-sharepoint-online.md`
- npm registry: `@microsoft/microsoft-graph-client`, `@microsoft/msgraph-sdk`
