# HOOK: Graph change notifications for SharePoint in v2

**Track:** m365 · **Type:** research · **Date:** 2026-11-22

**Question:** what would cub need to receive Microsoft Graph change notifications (webhooks) for SharePoint in v2, and what would cub v1's S7 deferral have to change?

cub paths below are read at master `9aee5f63`. cub v1's rulings govern; this document describes the v2 direction and changes no ruling. GRAPH-8 already records the spike mechanics (lifetimes, handshake, `clientState`, delta pairing); it is cited here, not restated.

## Doctrines

**HOOK-1. Change S7's "Webhooks are deferred" only by an owner ruling, and keep its second half.**
S7 (`research/integrations/microsoft-365/sharepoint-sync-index.md`, row S7) says: freshness within 5 minutes, delta polled every 2 minutes per drive, "Webhooks are deferred. When they come, they are triggers only … and delta remains the truth", and a `410` runs a full resync. Lifting the deferral changes only the first sentence. The trigger-only rule, the 2-minute poll as backstop and the 410 resync stay as written.
- Why: the sync section (§Q1–Q2) already states the future shape ("a notification only triggers an immediate run of the same job"), so v2 needs a ruling that a trigger is wanted, not a redesign. S7's own reopen trigger is the nearest stated one: R3 lists "a list read must reflect SharePoint faster than the poll". Without a ruling, WO-214 keeps the item out of scope ("deferred by accepted row S7 and trim R3"; its drafter flags that no `decisions/` record rules this, so S7 is the only basis).
- Evidence: cub `research/integrations/microsoft-365/sharepoint-sync-index.md` rows S7 and §Q1–Q2 (alternative "Webhooks as primary. Rejected"); cub `factory/work-orders/WO-214.md` "Out of scope"; cub `decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md` R3 (documents mirror stays; reopen trigger).
- Basis: Decision (owner)
- Code: v1 has none: `src/lib/jobs/handlers/sharepoint.handler.ts` only schedules the poll (`*/2 * * * *`, one per tenant and drive). Gap: a ruling that supersedes the "deferred" wording, and a work order.

**HOOK-2. Treat every notification as a trigger to run delta, never as data.**
The handler validates, queues and returns. A queued run calls the existing per-drive delta job, which reads the stored `deltaLink`, applies the batch and stores the new link in one transaction. Nothing is applied from the notification body.
- Why: a basic notification carries no item detail, and notifications can be lost, so applying their content would make the index depend on delivery. The delta checkpoint is the only source that is complete under concurrent writes.
- Evidence: Microsoft: "Basic notifications: change notifications that don't contain resource data other than the id of the resource that changed" ([overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)); dropped notifications "can't be recovered" ([webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)). cub v1 `pollDrive` (`src/lib/sharepoint/delta-indexer.ts`) already is that job; `tests/m365-interop/delta-poller.test.ts` (README row M10) covers replaying the `deltaLink` verbatim and the 410 rebuild. Spike: `handleNotificationRequest` passes on only `subscriptionId`, `resource`, `changeType`, `lifecycleEvent`.
- Basis: Verified, Tested
- Code: cub `pollDrive` and `applyDelta` in `src/lib/sharepoint/delta-indexer.ts`; spike `m365/spike/lib/m365/changes.ts` (tests in `m365/spike/test/changes.test.ts`). Gap: nothing in cub enqueues `pollDrive` from outside the schedule; v2 needs an enqueue entry point that shares the per-drive singleton.

**HOOK-3. Subscribe to the drive root, one subscription per bound drive, with `updated` only.**
The resource is `/drives/{id}/root`. Lists are a separate resource (`/sites/{site-id}/lists/{list-id}`) and v2 needs them only if cub tracks list items; cub v1 indexes document-library files through drive delta, so the drive root is enough.
- Why: on OneDrive for Business and SharePoint document libraries, only the root folder can be subscribed, and drive-root and list subscriptions accept only `updated`. A second subscription with the same `changeType` and `resource` fails with `409 Conflict`.
- Evidence: Microsoft: "On OneDrive for Business, you can subscribe to only the root folder"; "Drive root item and list change notifications support only the `updated` changeType"; duplicate subscriptions return 409 ([create subscription](https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions?view=graph-rest-1.0), [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0), [overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)). Spike `subscribe` builds the drive-root resource (test "creates a drive subscription on the drive root").
- Basis: Verified, Tested
- Code: spike `subscribe` in `m365/spike/lib/m365/changes.ts`. cub: Gap, no `sp_subscriptions` state; a per-drive row (subscription id, expiry, secret reference) would sit beside `sp_sync_state` (`migrations/tenant/0024_sp-delta-index.sql`).

**HOOK-4. Prove the app-only permission with `Sites.Selected` in a test tenant before committing to it.**
cub v1 reaches SharePoint app-only with a certificate and `Sites.Selected` (R1 in the trim rulings, decision `2026-09-18-sharepoint-access-is-app-only-with-sites-selected`). Microsoft's subscription permission table does not list `Sites.Selected`.
- Why: the table gives, for OneDrive for Business driveItem, `Files.Read.All` (delegated and application), and for list `Sites.Read.All`. Both are tenant-wide read, which cub's model avoids. Whether `Sites.Selected` (with a read grant on the site) is accepted for `POST /subscriptions` on a drive root is not stated in the pages fetched. If it is refused, v2 must either ask the firm for a broader permission or stay on polling for that firm.
- Evidence: [create subscription](https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions?view=graph-rest-1.0) permissions table (what it lists is Verified; that `Sites.Selected` works is not). cub S7-adjacent row on `Sites.Selected` needing a per-site grant: `research/integrations/microsoft-365/sharepoint-sync-index.md` (Selected permissions overview).
- Basis: Unverified (the listed permissions are Verified)
- Code: Gap: no live test. Test belongs beside cub `tests/m365-interop/app-only-graph.live.test.ts` or a tobogan tenant test.

**HOOK-5. Renew subscriptions on a schedule, well before the 42,300-minute limit.**
A driveItem or list subscription lives at most 42,300 minutes (under 30 days). Renew with `PATCH /subscriptions/{id}` and a new `expirationDateTime`, from a recurring job, with a margin of days. Any expiry under 45 minutes is silently raised to 45.
- Why: an expired subscription is deleted and notifications stop silently; v1's poll would hide that, which is acceptable only because HOOK-9 keeps the poll. Microsoft warns that requests beyond the maximum will in future fail, so the margin must not be pushed to the limit.
- Evidence: [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) ("Subscription lifetime" table, 45-minute floor, "should not exceed the supported value"); [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) ("Renew a subscription"). Spike `renewSubscription` and `MAX_SUBSCRIPTION_MINUTES` (tests "renews with a new expiry" and "surfaces 404 for a removed subscription").
- Basis: Verified, Tested
- Code: spike `renewSubscription` in `m365/spike/lib/m365/changes.ts`. cub: Gap. The pattern to copy is `boss.schedule` in `src/lib/jobs/handlers/sharepoint.handler.ts` (per tenant and drive key). The spike has no renewal timer (GRAPH-8).

**HOOK-6. Answer the validation handshake first, within 10 seconds, as plain text, on a route that bypasses cub's API auth.**
Graph POSTs `?validationToken=…` to the notification URL when a subscription is created. Respond `200`, `text/plain`, body the URL-decoded token. The same applies to the lifecycle URL. If it fails, no subscription is created.
- Why: creation is the only moment the endpoint is probed; a route that demands an API key or a session answers 401 and every subscribe fails.
- Evidence: [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) ("notificationUrl validation": 10 seconds, `200 OK`, `text/plain`, decoded token; "validate both lifecycleNotificationUrl and notificationUrl"); [lifecycle events](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events). Spike test "echoes the validation token as plain text without calling the handler". How cub's `with-auth` (`src/lib/auth/with-auth.ts`) would exempt such a route was not read for this document.
- Basis: Verified, Tested
- Code: spike `handleNotificationRequest`, route `m365/spike/app/api/graph/notifications/route.ts`. cub: Gap, no such route; cub's `/v1/webhook-endpoints` routes are a different feature (see Reference).

**HOOK-7. Check `clientState` on every notification, with a per-subscription secret that is stored encrypted and never logged.**
Set a random `clientState` (up to 128 characters) at creation, compare it in constant time on every item in a delivery, drop mismatches, and answer 202 for the rest. Matching a `subscriptionId` to a stored subscription row is the second check.
- Why: the endpoint is public, so anyone can POST to it. Without the check, a forged body could trigger delta runs for any drive (cost, not data, but still a denial vector against the Graph budget).
- Evidence: Microsoft: validate `clientState` on each notification; if it mismatches "don't consider the change notification as valid" ([webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)); maximum length 128 ([subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0)). Spike tests "passes on only notifications with the right clientState" and "validates the URL, clientState and drive id before calling Graph" (the spike rejects under 16 characters; that floor is the spike's, not Microsoft's). cub already stores signing secrets encrypted for its own outbound webhooks (`decisions/2026-10-14-webhook-signing-secret-is-encrypted-and-single-in-v1-dual-secret-rotation-moves-to-v2.md`), which is a precedent for the storage, not a shared implementation.
- Basis: Verified, Tested
- Code: spike `handleNotificationRequest` (`sameSecret`). cub: Gap, secret storage for subscriptions.

**HOOK-8. Handle `reauthorizationRequired` and do not rely on `missed` or `subscriptionRemoved` for drive roots.**
Give each subscription a `lifecycleNotificationUrl`; it cannot be added later, only at creation. On `reauthorizationRequired`, answer 202, then do one `PATCH` that renews and reauthorizes (never `/reauthorize` and `PATCH` within 10 minutes of each other). Treat the other two events as extra signals only: Microsoft documents them for Outlook and Teams resources, not for driveItem.
- Why: reauthorizationRequired is documented for all resources, and ignoring it pauses delivery. Because `subscriptionRemoved` and `missed` are not documented for drive roots, a removed or throttled drive subscription may produce no event at all, so the renewal job (HOOK-5) and the poll (HOOK-9) are the real safety nets.
- Evidence: [lifecycle events](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events) (supported-resources list; response steps; 10-minute warning; "Any notifications … that happen when the change notification delivery pauses … are lost … fetch those changes … using the delta query"); [subscription resource](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0) (`lifecycleNotificationUrl` must be HTTPS). Spike `subscribe` accepts `lifecycleNotificationUrl` and `handleNotificationRequest` surfaces `lifecycleEvent`; no test exercises acting on it.
- Basis: Verified
- Code: spike `Notification.lifecycleEvent` in `m365/spike/lib/m365/changes.ts` (surfaced only). Gap: no handler that renews, recreates or schedules a delta run on a lifecycle event.

**HOOK-9. Make the poll the safety net: keep delta polling on, and run it on `missed`, on a removed subscription and when a subscription is absent.**
The 2-minute poll stays until the owner sets a longer interval. A notification only brings a run forward. A run after a `410` still rebuilds as S7 says.
- Why: notifications are late by up to 6 hours at worst, can be dropped when the endpoint is slow, and a lapsed subscription is silent for drive roots (HOOK-8). Polling is the only path that is complete, and v1's budget calculation (about 720 cheap calls a day per firm) shows the poll is not the cost that justifies webhooks.
- Evidence: [overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview) (driveItem latency: average under 1 minute, maximum 6 hours); [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) (an endpoint is marked "slow" past 10% of responses over 3 seconds and "drop" past 15% over 10 seconds, each in a 10-minute window; dropped notifications are unrecoverable). cub S7 rationale and §Q1–Q2 backstop; cub test `tests/m365-interop/delta-poller.test.ts` ("410 requires resync…"). Microsoft's scan guidance on a delta backstop "no more than once per day" is quoted from cub's research index, not fetched here.
- Basis: Verified, Tested; any change to the poll interval is Decision (owner)
- Code: cub `pollDrive` / `rebuildDrive` in `src/lib/sharepoint/delta-indexer.ts`. Gap: no switch to lengthen the interval per drive while a subscription is healthy.

**HOOK-10. Expose a public HTTPS endpoint that acknowledges within 3 seconds, and decide where it lives.**
Return 202 only after validating the delivery and enqueuing a job; never run delta inside the request. Return 5xx if the job could not be queued, so Graph retries.
- Why: Graph treats a 2xx within 3 seconds as delivery, retries failures for up to 4 hours with the timeout raised to 10 seconds, and throttles then drops endpoints that are slow. A private-network or localhost deployment receives nothing, so every on-premises or VPN-only firm falls back to polling.
- Evidence: [webhooks](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks) ("publicly accessible, HTTPS-secured endpoint … If your endpoint isn't publicly accessible, Microsoft Graph doesn't send notifications"; 3-second window; 4-hour retry; slow/drop thresholds; firewall may allow Microsoft's published IP ranges). cub's `.env.example` carries `CUB_PUBLIC_BASE_URL` (line 78); its use for this was not checked. Spike handler acknowledges without awaiting the handler (test "still answers 202 when the handler fails").
- Basis: Verified (the 3-second acknowledgement and HTTPS requirement); Tested (the spike answers 202 without awaiting the handler, `m365/spike/test/changes.test.ts`; no test measures a time bound); where cub's endpoint sits is Decision (owner)
- Code: spike route `m365/spike/app/api/graph/notifications/route.ts`. cub: Gap. Open design: one global route that maps `subscriptionId` to a tenant and drive, versus one route per tenant. The delivery body does carry a `tenantId` field in Microsoft's example, but cub's tenant routing from a subscription id was not designed here.

**HOOK-11. Deduplicate by running the same idempotent job, and never depend on delivery order or count.**
Collapse many notifications per drive into one pending delta run; a second notification during a run schedules at most one more. The apply path stays an idempotent upsert guarded by the stored link.
- Why: a delivery can batch several subscriptions, and retries can repeat a notification. Microsoft's pages fetched here promise no ordering and no exactly-once delivery, so the design must work without either.
- Evidence: cub S7 §Q1–Q2: replay from an old link is safe "because every apply is an idempotent upsert"; the delta job is a singleton per drive (`singletonKey` in `sharepoint.handler.ts`); `applyDelta` checks `state.deltaLink !== expectedLink` before writing (`delta-indexer.ts`). Microsoft's documents fetched are silent on duplicates and ordering (the create-subscription page says Graph sends "at least one" notification per change).
- Basis: Unverified (Graph's ordering and duplicate behaviour); cub's idempotent apply is described in the cited source but its test was not re-read here
- Code: cub `applyDelta`, `pollDrive` in `src/lib/sharepoint/delta-indexer.ts`; `src/lib/sharepoint/delta-indexer.test.ts`. Gap: coalescing of queued runs per drive and any dedupe on the notification `id`.

## Open

- **Owner:** whether v2 lifts S7's deferral at all, and which trigger justifies it (R3's reopen trigger is "a list read must reflect SharePoint faster than the poll"). (HOOK-1)
- **Owner:** whether the public endpoint is acceptable for the deployment model (firms behind a private network cannot receive notifications). (HOOK-10)
- **Owner:** whether a firm that refuses a broader permission than `Sites.Selected` stays poll-only. (HOOK-4)
- **Unverified, test in a test tenant:** a `Sites.Selected` app can create a drive-root subscription. Also what the first `validationToken` call carries for cub's tenant mapping. (HOOK-4, 6)
- **Unverified:** that `subscriptionRemoved` and `missed` are never sent for drive roots (the docs only list other resources), and Graph's duplicate and ordering behaviour. (HOOK-8, 11)
- **Unverified:** Microsoft's scan-guidance wording on the delta backstop; fetch `learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/scan-guidance` before citing it as Verified. (HOOK-9)
- Not built in the spike: renewal timer, lifecycle handler, per-drive job queue (GRAPH-8).

## Reference

- WO-197 ("Narrow the webhook subscription allow-list") is not this feature. It concerns cub's outbound webhooks: customers' endpoints subscribe to cub events, and the allow-list `WEBHOOK_EVENT_TYPES` narrows to `cub.matter.created` and `cub.conflict.hit_found`. The code lives in `src/lib/v1/webhooks.ts` and `src/lib/db/webhook-endpoints.ts` with `/v1/webhook-endpoints` routes. Microsoft Graph subscriptions are inbound and share nothing with it; the shared word "subscription" is the only link. Do not widen that allow-list for Graph.
- Subscription counts and quotas that apply to Teams resources do not apply to drive roots in the pages fetched; per-drive subscription state is the only cardinality cub would hold.
- Delta `410 Gone` behaviour and the 6-hour latency figure are already tabulated in cub's sync index; this document relies on them as cited there.

## Sources

- Microsoft Learn, subscription resource: https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0 (fetched 2026-11-22)
- Microsoft Learn, create subscription: https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions?view=graph-rest-1.0 (fetched 2026-11-22)
- Microsoft Learn, change notifications overview: https://learn.microsoft.com/en-us/graph/change-notifications-overview (fetched 2026-11-22)
- Microsoft Learn, receive change notifications through webhooks: https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks (fetched 2026-11-22)
- Microsoft Learn, lifecycle notifications: https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events (fetched 2026-11-22)
- cub at `9aee5f63`: `research/integrations/microsoft-365/sharepoint-sync-index.md` (S7, §Q1–Q2); `factory/work-orders/WO-214.md`; `factory/work-orders/WO-197.md`; `decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md` (R1, R3, R8); `src/lib/sharepoint/delta-indexer.ts`; `src/lib/jobs/handlers/sharepoint.handler.ts`; `tests/m365-interop/delta-poller.test.ts`; `tests/m365-interop/README.md` (M10); `migrations/tenant/0024_sp-delta-index.sql`; `.env.example`
- tobogan: `m365/graph-client.md` (GRAPH-8); `m365/spike/lib/m365/changes.ts`; `m365/spike/test/changes.test.ts`; `m365/spike/app/api/graph/notifications/route.ts`
