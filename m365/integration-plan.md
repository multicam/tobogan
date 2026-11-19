# PLAN: Integration plan

**Track:** m365 · **Type:** planning · **Date:** 2026-11-19

**Question:** how do we get from this research to a robust integration in the existing cub app?

## Doctrines

**PLAN-1. Nothing counts as working until it has run on a test tenant; tenant tests come first.**
Environment: the owner's staging setup (EC2, AWS Secrets Manager, Redis on the instance), which the owner will connect to a session. Each test runs as a converging loop with a budget of 3 attempts (LADDER-6); irreversible steps follow LADDER-5. Run these, in order:
1. Sign-in, token refresh after expiry, sign-out (AUTH-1 to AUTH-3).
2. What restricting a matter folder leaves behind, and whether it works at all on folders (MATTER-3, MATTER-6).
3. App-only `invite` with `Sites.Selected` (MATTER-7).
4. Preview framing from the app's origin (FILES-6).
5. Upload of a file over 100 MB through the streaming route (FILES-3, NEXT-2).
6. Sharing per link scope under the firm's tenant policy (SHARE-2, SHARE-7).
7. Mail: inline images, attachment `$select`, filing an attachment into a matter (MAIL-4).
8. App-only: the site grant, then matter creation, columns, team changes and closing as the app (AUTH-5, MATTER-7 to MATTER-9).
9. Token store against a real Redis, including restart and a second instance (AUTH-7).
10. Change notifications: create a drive and an inbox subscription, receive a notification, run the delta (GRAPH-8).
11. Template copy and its monitor URL (FILES-7).
- Why: everything so far is checked against documentation and a simulated Graph only. Items 2 and 3 decide the matter provisioning design.
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

## Confidence

| Area | Confidence | What would raise it |
| --- | --- | --- |
| Graph client (retry, paging, token safety) | High | Nothing needed before porting |
| Token storage and refresh | High for the logic; Redis adapter untested against a server | PLAN-1 item 9 |
| Upload | High for the protocol | PLAN-1 item 5 |
| Preview | Medium | PLAN-1 item 4 |
| Sharing | Medium | PLAN-1 item 6 |
| Mail read and attachment filing | Medium-high | PLAN-1 item 7 |
| Matter restriction | Low until tested | PLAN-1 items 2, 3 and 8 |
| App-only provisioning, lead column, closing | Medium: built and unit-tested on documented calls | PLAN-1 item 8 |
| Change tracking | Medium: delta and webhook built; no queue or renewal timer | PLAN-1 item 10 |
| Blank document creation | Medium: template copy with monitor polling | PLAN-1 item 11 |
| Auth library choice | Open | AUTH Open |

## Open

- PLAN-1 waits for the owner to connect the staging setup.
- PLAN-3 waits for access to the cub repository.
