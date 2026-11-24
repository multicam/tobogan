# PLAN: Integration plan

**Track:** m365 · **Type:** planning · **Date:** 2026-11-19

**Question:** how do we get from this research to a robust integration in the existing cub app?

## Doctrines

**PLAN-1. Nothing counts as working until it has run on a test tenant; tenant tests come first.**
Environment: first runs went against the `cub-staging` registration in the dev tenant (2026-11-23, `probe-results.md`); the owner's staging setup (EC2, AWS Secrets Manager, Redis on the instance) is still to be connected. Each test runs as a converging loop with a budget of 3 attempts (LADDER-6 in csf-research, `tracks/factory`); irreversible steps follow LADDER-5 there. Run these, in order:
1. Sign-in, token refresh after expiry, sign-out (AUTH-1 to AUTH-3) — sign-in measured 2026-11-23; refresh and sign-out have no recorded result yet.
2. What restricting a matter folder leaves behind, and whether it works at all on folders (MATTER-3, MATTER-6).
3. App-only `invite` with `Sites.Selected` (MATTER-7).
4. Preview framing from the app's origin (FILES-6).
5. Upload of a file over 100 MB through the streaming route (FILES-3, NEXT-2).
6. Sharing per link scope under the firm's tenant policy (SHARE-2, SHARE-7) — measured 2026-11-23: organization link created, listed, revoked; anonymous link refused by the tenant; invite by email not run (needs a recipient named by the owner).
7. Mail: inline images, attachment `$select`, filing an attachment into a matter (MAIL-4) — delegated send with attachment, arrival and save-to-drive measured 2026-11-23; the three named parts are not yet.
8. App-only: the site grant, then matter creation, columns, team changes and closing as the app (AUTH-5, MATTER-7 to MATTER-9).
9. Token store against a real Redis, including restart and a second instance (AUTH-7).
10. Change notifications: create a drive and an inbox subscription, receive a notification, run the delta (GRAPH-8).
11. Template copy and its monitor URL (FILES-7).
- Why: items 2 and 3 decide the matter provisioning design. The rest is order and budget.
- Evidence: first tenant run 2026-11-23 on `cub-staging` (dev tenant): read-only 5 of 5; app-only writes 9 of 10 (one test-pattern bug, fixed, not rerun); delegated mail and files 9 of 9; organization link round trip OK, anonymous link refused by the tenant; invite by email not run. Prerequisites found: two delegated mail permissions (`Mail.ReadWrite`, `Mail.Send`), an Exchange license, site membership (`probe-results.md`).
- Basis: Decision

**PLAN-2. Port the Graph layer, not the spike app.**
Copy `spike/lib/m365/` (without `server.ts` and `config.ts`) into the existing app with its tests, and connect it through `createGraphClient({ getAccessToken })` to the app's own auth.
- Why: the spike's pages are a test harness; the library is the tested part and is independent of the auth library (AUTH-6).
- Basis: Decision

**PLAN-3. Answer the fit questions against the existing repo before porting.**
1. Auth: which library signs users in, and is the access token copied onto the session (AUTH-1)? Owner does not know yet (2026-11-19).
2. Session storage: answered 2026-11-19: Redis on the EC2 instance for staging (AUTH-7), app secrets in AWS Secrets Manager (AUTH-8).
3. Graph access: is `@microsoft/microsoft-graph-client` in use? Keep it and wrap it, or move call sites to the thin client (GRAPH-1).
4. Next.js version: on 14 or 15, `proxy.ts` is `middleware.ts` and `searchParams` may be synchronous.
5. Which features already exist, compared against the doctrines in `files.md`, `sharing.md`, `mail.md`.
6. Hosting: staging is a long-running Node process on EC2, so the streaming upload route (NEXT-2) has no serverless duration or body limits; check any load balancer or reverse proxy in front of it.
7. Tenant policy: external sharing, anonymous links, user consent.
- Why: the existing repo has not been read from this workspace.
- Basis: Decision

**PLAN-4. Facts come from primary sources, and weaker sources are marked.**
`learn.microsoft.com`, `authjs.dev` and `nextjs.org` are blocked from the research environment, so facts were checked against the Markdown sources those sites are built from (`microsoftgraph/microsoft-graph-docs-contrib`, `MicrosoftDocs/entra-docs`, `SharePoint/sp-dev-docs`, `nextauthjs/next-auth`, `vercel/next.js`) and the npm registry, on 2026-11-19. Anything resting on search summaries is marked Unverified.
- Basis: Decision

**PLAN-5. Adopt no m365-specific dependency: keep cub's own OIDC code, adopt the thin Graph client, and adopt no Graph SDK and no auth library.**
The reliable dependency for m365 is no dependency at all: Graph REST v1.0 and the Entra OAuth endpoints are the stable contract, and they outlive any wrapper. cub keeps its own OIDC sign-in code and adopts the thin Graph client (PLAN-2); no Graph SDK and no auth library; next-auth stays in the spike only as a test harness. The Redis token store against a real server stays untested (PLAN-1 item 9).
- Why: the objective for this track is a reliable dependency for future-proofing cub. A wrapper that needs a Node 22 bump and a fetch polyfill to keep working, or an auth framework with no stable release, is the opposite of reliable; the REST surface and the OAuth endpoints are Microsoft's long-term contract.
- Evidence: GRAPH-1 in `m365/graph-client.md` (`@microsoft/microsoft-graph-client` 3.1.0 needs Node 22 and a fetch polyfill import; its successor `@microsoft/msgraph-sdk` is still pre-release); AUTH-6 and the Open "Auth library" item in `m365/auth.md` (no stable next-auth v5; the Auth.js README recommends Better Auth); `probe-results.md` (the probes signed in with plain OAuth PKCE plus a certificate, and next-auth appears in no probe; every call ran through the thin client, per the probe sources in `m365/spike/probe/`); MAILCAL-4 in `m365/v2-mail-calendar.md` (cub signs in with its own direct Entra OIDC code, `src/lib/session/entra-oidc.ts`).
- Basis: Decision (owner: JM, 2026-11-24: "Go with rec", relayed by Toboggan)
- Code: none; this records a verdict and changes no code.

## Confidence

| Area | Confidence | What would raise it |
| --- | --- | --- |
| Graph client (retry, paging, token safety) | High; tenant-tested (read-only 5 of 5, app writes 9 of 10) | Nothing needed before porting |
| Token storage and refresh | High for the logic; Redis adapter untested against a server | PLAN-1 item 9 |
| Upload | High; tenant-tested (small and chunked uploads passed) | PLAN-1 item 5 |
| Preview | Medium-high; the app-only preview URL passed on the tenant | PLAN-1 item 4 (iframe from the app origin) |
| Sharing | Medium-high; measured on the tenant (organization link round trip OK, anonymous refused) | PLAN-1 item 6 (invite by email) |
| Mail read and attachment filing | Medium-high; delegated send, arrival and save-to-drive measured | PLAN-1 item 7 |
| Matter restriction | Low until tested | PLAN-1 items 2, 3 and 8 |
| App-only provisioning, lead column, closing | Medium: built and unit-tested on documented calls | PLAN-1 item 8 |
| Change tracking | Medium: delta and webhook built; no queue or renewal timer | PLAN-1 item 10 |
| Blank document creation | Medium: template copy with monitor polling | PLAN-1 item 11 |
| Auth library choice | Decided: none (PLAN-5) | PLAN-5 |

## Open

- PLAN-1 has started on `cub-staging` (dev tenant, 2026-11-23): items 1, 6 and 7 are partly measured; the registration's broad delegated SharePoint permissions (`Sites.FullControl.All`, `Sites.ReadWrite.All`, `AllSites.FullControl`) await the removal decision.
- PLAN-3 is unanswered: the cub repository has not been read from this workspace. Tenant access exists: the 2026-11-23 probes ran against the `cub-staging` registration and site (`probe-results.md`).
