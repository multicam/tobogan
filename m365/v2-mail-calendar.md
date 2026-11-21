# MAILCAL: Mail and calendar through Microsoft Graph in cub v2

**Track:** m365 · **Type:** research · **Date:** 2026-11-22

**Question:** what would cub need to add mail and calendar access through Microsoft Graph in v2, and what would cub v1's E50 deferral have to change?

cub v1's rulings govern. This document describes the v2 direction and the spec wording it would touch. The owner changes the specs. All cub paths are at cub master `9aee5f63` (`/media/ssdev/tg-pro/cub`, read-only). Mail reading, rendering, filing and sending are already covered by MAIL-1 to MAIL-8 and sign-in and tokens by AUTH-1 to AUTH-6; this document cites them and does not restate them.

## Doctrines

**MAILCAL-1. Split E50 into separate rulings before any build.**
E50 today bundles three readings of "email access" (read a matter's mail, compose and send, file sent mail) with the v2 route choice, and calendar writes ride along in the same row. v2 needs one ruling per workload: read mail, send mail, file a message, read events, create events. The wording that would change:
  - `specs/v1/09_deferred.md` §23 (`#e50-email-access-v2`) and its at-a-glance row: "email access via Office 365, and the v2 mail/calendar route choice", "route not chosen". It names no workload split and no route.
  - `specs/v1/07_open_questions.md` E50 ("What does 'email access via Office 365' mean, and what Graph auth model does it need?"): its three readings become separate questions, each with an owner and an answer.
  - Trim R2 in `decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md` ("Which v2 route ... is not chosen here") needs a successor record, not an edit.
  - Trim R1 ("v1 mints no delegated Graph token") stays true for v1. A v2 record must say it is superseded for the named workloads only.
  - `factory/work-orders/WO-214.md` "Out of scope" lists mail and calendar by E50 and R2; its M12 check ("a reference search over `src/` for `/messages`, `mailFolders`, `/events`, `calendarView` and `sendMail` finds zero") must be retired or narrowed when the first Graph mail call lands.
- Why: a single deferred row cannot carry three permission models. The firm has not said which reading it means (09 §23 revival trigger).
- Evidence: cub files above, read at `9aee5f63`. The revival triggers are "drafter's suggestion, not ruled" (09 §23).
- Basis: Decision (owner: JM)
- Code: cub v1 has no Graph mail or calendar call (trim R2 evidence; WO-214 M12). Gap: nothing in cub; tobogan has `spike/lib/m365/mail.ts` for mail only.

**MAILCAL-2. Choose delegated or app-only per workload, not once for the product.**
Anything a lawyer does for themself (read, file, add a date to their own calendar) fits delegated access. Anything that runs with no user present (a poller reading a shared filing mailbox) needs app-only access. Both can live on one registration; they are separate grants.
- Why: v1 runs app-only with `Sites.Selected` because two of three workloads have no user present (decision of 2026-09-18, cited in trim R1). A delegated token dies with its person. A single choice for mail would repeat that trade-off wrongly for either side.
- Evidence: Microsoft's permissions reference lists `Calendars.Read` and `Calendars.ReadWrite` as both delegated (admin consent not required) and application (admin consent required). Get message: delegated `Mail.ReadBasic`, `Mail.Read`; application `Mail.ReadBasic.All`, `Mail.Read` (the page's own spelling). Create event: delegated and application `Calendars.ReadWrite`. Event delta: `Calendars.Read` for both types. The mail rows of the permissions reference (including consent for the delegated mail scopes) were not read.
- Basis: Verified (calendar consent, the three API permission tables); Unverified (consent requirement for the delegated mail scopes)
- Code: `graphScope` in `m365/spike/lib/m365/scopes.ts` requests `Mail.ReadWrite` and `Mail.Send` (delegated, per AUTH-5 and MAIL-7). cub: `src/lib/sharepoint/graph.ts` mints only an app-only token. Gap: cub has no delegated mail scope.

**MAILCAL-3. Scope app-only mailbox access with RBAC for Applications, and remove the unscoped Entra consent.**
For app-only mail or calendar, give the app a role such as `Application Mail.Read` or `Application Calendars.ReadWrite` in Exchange Online, bound to a management scope or administrative unit that covers only the intended mailboxes. Then remove the same permission from Entra consent. Test with `Test-ServicePrincipalAuthorization`.
- Why: an unscoped Entra grant of `Mail.Read` lets the app read every mailbox. The Exchange page says the two authorities are a union, so a scoped assignment plus an unscoped consent "results in no effective resource scoping". Role changes take 30 minutes to 2 hours to take effect.
- Evidence: the page states RBAC for Applications "replaces Application Access Policies", and that Application Access Policies constrain only permissions assigned in Entra. Both are supported for Microsoft Graph and EWS. It lists the roles `Application Mail.Read`, `Application Mail.ReadBasic`, `Application Mail.ReadWrite`, `Application Mail.Send`, `Application Calendars.Read`, `Application Calendars.ReadWrite`. Access policies still work and remain documented for migration (the page gives migration steps). The Graph permissions reference still carries a note that admins "can configure application access policy" for the calendar permissions.
- Basis: Verified
- Code: Gap: cub's app-only scoping today is the SharePoint site grant (`Sites.Selected`, per-site role). Nothing for Exchange. cub would need an operator runbook step, not application code. Open: who runs it (see Open).

**MAILCAL-4. A delegated mail or calendar scope changes the sign-in contract, so it needs its own ruling.**
cub signs in with direct Entra OIDC and `scope: "openid profile email"`, and reads only `id_token` from the token response. A delegated Graph scope means adding the scope, asking for `offline_access`, holding the refresh token server-side, and handling "sign in again". AUTH-1, AUTH-2 and AUTH-3 already specify the pattern; cub has not adopted it.
- Why: v1's rule is "the two never mix: sign-in does not widen the Graph grant" (`specs/v1/03_api_auth_and_tenancy.md` lines 132-136, per trim R1). Adding a scope breaks that sentence for the named workloads. Without a token store the token ends up in a cookie or the browser (AUTH-1).
- Evidence: cub `src/lib/session/entra-oidc.ts` line 249 and lines 344-348 (cited in trim R1). Delegated Outlook subscriptions only cover the signed-in user's own mailbox (see MAILCAL-8). AUTH-1 to AUTH-3 are the tobogan pattern.
- Basis: Decision (owner: JM); the AUTH patterns are Verified, Tested (cite AUTH-1 to AUTH-3, `m365/spike/test/auth.test.ts`)
- Code: `createTokenManager` in `m365/spike/lib/m365/tokens.ts`. cub: `src/lib/session/entra-oidc.ts` (the scope string). Gap: no per-user token store in cub, and no consent screen or consent-failure handling.

**MAILCAL-5. A matter email stays a Document: file the message as `.eml` into the matter's SharePoint folder.**
Reading mail in cub does not create a second email collection. Filing a message means fetching its MIME with `GET .../messages/{id}/$value`, uploading those bytes to the matter folder, and letting the existing indexer pick it up.
- Why: matter email is a Document (`decisions/2026-08-10-matter-email-is-a-document.md`, E48, trim R2 and R3). Two stores for one message would reintroduce the split that decision removed. The indexer already parses `.eml` headers into the `email` sub-object.
- Evidence: Microsoft's get-message page: `$value` returns "the message content in MIME format, and not a message resource", via `/me/...` or `/users/{id}/...`. Today filing is by hand: the firm drags or saves `.eml` or `.msg` into the folder, and cub indexes what arrives (E48 resolution, JM answer "c").
- Basis: Verified (`$value` returns MIME); Decision (owner: JM) for keeping the document model
- Code: cub `src/lib/sharepoint/email-indexer.ts` (`enrichEmailRows`) and `src/lib/sharepoint/email-headers.ts` (`parseEmailHeaders`) read the filed file. `readEmailContent` in `src/lib/sharepoint/graph.ts` reads it back. Gap: no code fetches `$value` or writes the `.eml`. tobogan has `saveAttachmentToDrive` in `m365/spike/lib/m365/mail.ts` for attachments, not whole messages (MAIL Open: "Filing an attached email").

**MAILCAL-6. Filing must record who filed, name the file safely and never overwrite.**
The upload uses `conflictBehavior: rename` (MAIL-5), a sanitised name built from the message and not from the sender's free text, and sets `filed_by` only through the existing rule (an existing user whose email matches, otherwise null).
- Why: two messages with the same subject must both survive. v1 already ruled how `filed_by` is set (`decisions/2026-10-14-sharepoint-filed-by-is-set-only-from-an-existing-users-email-match-otherwise-null.md`).
- Evidence: MAIL-5 (Tested); the 2026-10-14 decision, cited in trim R2's overlap list.
- Basis: Tested (naming and conflict behaviour, `m365/spike/test/mail.test.ts`, `names.test.ts`); Decision (owner: JM) for the `filed_by` rule
- Code: `toSafeFileName` in `m365/spike/lib/m365/mail.ts`. cub: the 2026-10-14 record. Gap: no file-email action in cub; WO-164 stays parked.

**MAILCAL-7. Create calendar events with an explicit time zone on both ends and a `transactionId`.**
Send `start` and `end` as `dateTimeTimeZone` with a named zone, and ask for the zone you want back with `Prefer: outlook.timezone="<zone>"`. Set `transactionId` so a retry does not create a second event. Take zone names only from the mailbox's supported list.
- Why: an event with a bare local time is read in whatever zone the reader assumes; for a court date that is wrong silently. Delta responses assume UTC when no `Prefer` zone is sent. A retry after a timeout otherwise double-books.
- Evidence: Create event: "start and end properties are of dateTimeTimeZone type"; "find the supported time zones ... to make sure you set only time zones that have been configured for the user's mailbox server"; the example sets `Prefer: outlook.timezone="Pacific Standard Time"` and `transactionId` "to reduce unnecessary retries on the server". Required permission `Calendars.ReadWrite` (delegated and application). Event delta: "Prefer ... {Time zone}. Optional, UTC assumed if absent".
- Basis: Verified
- Code: Gap: tobogan has no calendar code (`rg -i 'calendar|timeZone' m365/spike` finds none). cub has no calendar write; the critical-dates projection is named in trim R2's research list (`research/integrations/microsoft-365/critical-dates-calendar-projection.md`) and was not read here.

**MAILCAL-8. Track mailbox and calendar changes with delta first; add subscriptions only for latency.**
Mail: delta per folder (`mailDelta`, immutable ids per MAIL-1). Calendar: `calendarView/delta` needs `startDateTime` and `endDateTime`, accepts no `$select`, `$filter`, `$orderby`, `$expand` or `$search`, and can return `@removed` entries for events outside the window, which the caller must filter. Notifications (webhooks) are a hint to run delta, not the source of truth.
- Why: v1 already treats delta as the truth and defers webhooks (`S7`, trim R3, WO-214 out of scope). A delegated subscription only works on the signed-in user's own mailbox, so a user-token design cannot watch a shared filing mailbox.
- Evidence: Event delta page (parameters, unsupported OData options, `@removed` behaviour). Outlook change notifications page: "Delegated permission supports subscribing to items in folders in only the signed-in user's mailbox"; the Outlook sharing scopes "do not support subscribing to change notifications on items in shared or delegated folders"; use the application permission for another user's mailbox; at most 1,000 active Outlook subscriptions per mailbox across all apps; identify the user by object id, not UPN. Subscription lifetime: cub's R2 record quotes under 7 days (10,080 minutes), and 1,440 minutes with resource data; that page's lifetime table was not read here.
- Basis: Verified (delta behaviour, delegated limit, per-mailbox cap); Tested (`mailDelta` URL, folder allow-list, immutable-id header: `m365/spike/test/changes.test.ts`, `gaps.test.ts`); Unverified (lifetime figures)
- Code: `mailDelta`, `subscribe`, `renewSubscription`, `handleNotificationRequest`, `MAX_SUBSCRIPTION_MINUTES` in `m365/spike/lib/m365/changes.ts`. The companion change-notifications document is `m365/v2-change-notifications.md` (written in parallel, not read here); defer to it on subscriptions and re-check this doctrine against it. Gap: `mailDelta` reads `/me/...` only (delegated); no `/users/{id}/...` form and no `calendarView/delta` function.

**MAILCAL-9. Ask for the least that works, and keep no message body unless the message is filed.**
Prefer `Mail.ReadBasic` for lists and pickers, `Mail.Read` only when a body or attachment is needed, and write scopes only for the action that writes. cub stores metadata for a filed message (the `email` sub-object) and nothing for an unfiled one. Notifications are created without resource data.
- Why: a law firm's mailbox holds privileged material. Anything cub copies, caches or logs becomes cub's to protect. Scope and storage are the two places to cut exposure.
- Evidence: the Exchange role table says `Application Mail.ReadBasic` reads email "except the body, previewBody, attachments, and any extended properties". That confirms the exclusion for the application role; the delegated scope is assumed the same. MAIL-7 (read with `Mail.Read`, write only to change messages). Subscriptions without resource data need no encryption certificate (Outlook notifications page). v1 has no per-matter walls (`decisions/2026-10-14-information-barriers-off-in-v1.md`, E45/E46 open), so a mailbox read is firm-wide in effect.
- Basis: Verified (application role description, notification option); Unverified (delegated `Mail.ReadBasic` exclusions); Decision (owner: JM) for the no-storage rule and for who may read whose mail
- Code: cub `06_data_contracts.md` `res-documents` (the `email` sub-object holds `from`, `to[]`, `subject`, `thread_id`). Gap: cub has no "do not store the body" check; a test over any future mail module should assert no body field is written to the database.

## Open

- **Owner (JM):** which readings of E50 the firm wants first (read, send, file, calendar), and whether the filing mailbox is shared (app-only, MAILCAL-3) or each lawyer's own (delegated, MAILCAL-4).
- **Owner (JM):** whether trim R1 is lifted for named workloads, with the token-store design (AUTH-1 to AUTH-3) as the condition.
- **Owner (JM, firm admin):** who runs the Exchange role and scope step. It needs the Organization Management role group and the Entra Exchange Administrator role (Exchange page).
- **Unverified, test on a tenant:** `Test-ServicePrincipalAuthorization` results against a real scoped role; the 30 minute to 2 hour propagation delay.
- **Unverified:** consent requirements of the delegated and application mail scopes (the mail rows of the permissions reference were not read; only the calendar rows were).
- **Unverified:** subscription lifetime limits for Outlook resources (cub's R2 record cites them; this document did not fetch that table).
- **Unverified:** that the delegated `Mail.ReadBasic` excludes the same properties as the application role (MAIL Open already lists this).
- **Not covered:** shared and delegated mailboxes and calendars (`.Shared` scopes), room and resource calendars, meeting invitations to attendees, recurring-event edits, free/busy lookups, contacts, Outlook add-in, on-behalf-of flow, sending (MAIL-6), and `Mail.ReadWrite` flows.
- **Test:** `$value` MIME on a message with an attached message, and the size limit of that download. Not tested here.

## Reference

- Microsoft's Exchange RBAC page says Autodiscover cannot be used with RBAC application roles, and RBAC for Applications supports up to 10,000 applications per organization.
- Event create takes `Calendars.ReadWrite`; event delta takes `Calendars.Read` as the least privileged.
- Tobogan prior code: `spike/lib/m365/mail.ts`, `spike/lib/m365/email-html.ts`, `spike/lib/m365/changes.ts`.

## Sources

- cub master `9aee5f63`: `specs/v1/09_deferred.md` (§23), `specs/v1/07_open_questions.md` (E50), `specs/v1/07_resolved.md` (E48), `decisions/2026-08-10-matter-email-is-a-document.md`, `decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md`, `factory/work-orders/WO-214.md`
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac (updated 2026-10-27)
- https://learn.microsoft.com/en-us/graph/permissions-reference (calendar rows only)
- https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
- tobogan: `m365/mail.md` (MAIL-1 to MAIL-8), `m365/auth.md` (AUTH-1 to AUTH-6)
