# Spike: Next.js 16 + Microsoft Graph (SharePoint and mail)

**Tests:** whether the integration guide at `m365/guide.md` can be made robust, and what the hardened version looks like.

**Found:** yes, with the changes recorded in the documents listed in `m365/README.md`. The Graph layer is independent of the auth library and of Next.js, so it can be copied into an existing app.

## Layout

| Path | Purpose | Depends on |
| --- | --- | --- |
| `lib/m365/graph-client.ts` | fetch-based Graph client: retry, paging, errors | nothing |
| `lib/m365/tokens.ts` | server-side token store and refresh | nothing |
| `lib/m365/drive.ts` | browse, upload (small and resumable), preview | graph client |
| `lib/m365/sharing.ts` | permissions, invite, links, revoke | graph client |
| `lib/m365/mail.ts` | inbox, message, attachments to SharePoint, send | graph client, drive |
| `lib/m365/email-html.ts` | safe viewer document for email bodies | nothing |
| `lib/m365/roles.ts` | firm roles and the policy for what each may do | nothing |
| `lib/m365/matters.ts` | matter folders restricted to their team | drive, sharing |
| `lib/m365/tenant.ts` | single-tenant issuer check | nothing |
| `lib/m365/scopes.ts`, `lib/m365/sites.ts` | delegated scopes; admin grant for `Sites.Selected` | graph client |
| `lib/m365/changes.ts` | delta queries, subscriptions, webhook handler | graph client |
| `lib/m365/authorize.ts` | role policy check per item, app or user client | matters, roles, server |
| `lib/m365/names.ts` | validation of file names, ids, emails | nothing |
| `lib/m365/server.ts`, `config.ts`, `auth.ts` | Next.js and Auth.js wiring | Next.js, next-auth |
| `app/` | minimal page, Server Actions, streaming upload route | all of the above |

To reuse the Graph layer elsewhere, copy `lib/m365/` without `server.ts` and `config.ts`, and call `createGraphClient({ getAccessToken })` with the host app's own token source.

## Run

```bash
bun install
bun run test             # 522 unit tests against a fake Graph
bun run test:coverage   # same, with v8 coverage thresholds
bun run typecheck
cp .env.example .env.local   # fill in, then:
bun run dev       # http://localhost:3000/workspace
```

Entra app registration: redirect URI `http://localhost:3000/api/auth/callback/microsoft-entra-id`, delegated permissions as listed in `lib/m365/config.ts`.

## Tests

The tests need no credentials and make no network calls. They replace only the boundaries: `fetch` (Graph and the Entra token endpoint), the `redis` client, and `next-auth`, whose fake keeps the real config from `auth.ts` and runs its callbacks. `server-only` resolves to its empty module. Shared fakes are in `test/helpers.ts` and `test/next-harness.ts`.

`bun run test:coverage` fails below these thresholds:

| Files | Lines, functions, statements | Branches |
| --- | --- | --- |
| `lib/m365/**` | 100% | 95% |
| `auth.ts`, `app/**/*.ts` | 90% | 90% |

TSX pages and components are not measured.

## Verified

- Unit tests, coverage thresholds, strict typecheck and `next build` pass.
- Signed out, the built app shows the sign-in button and the upload route returns 401.

## Live probes (measured 2026-11-23, `cub-staging`, dev tenant)

Rerun from `m365/spike` with `bun probe/<name>.ts`; the full record is `probe/RESULTS.md`, the variable names are in `.env.example`. Every probe needs `SP_TENANT_ID`, `SP_APP_CLIENT_ID`, `SP_APP_CERT_THUMBPRINT` and `SP_APP_CERT_KEY`; `live-readonly.ts` adds `SP_SITE_ID`, the other three add `SP_DRIVE_ID`. The two Agent.Smith probes sign in by themselves (headless Chrome, TOTP, port 3000 free) and add `QA_AGENT_SMITH_UPN`, `QA_AGENT_SMITH_PASSWORD`, `QA_AGENT_SMITH_TOTP_SECRET`, with `PROBE_SCRATCH` the browser profile's parent.

- `live-readonly.ts` (app, certificate): 5 of 5 steps passed.
- `live-writes.ts` (app, certificate): 9 of 10 passed; the tenth failed on a test-pattern bug (fixed; the step was not rerun).
- `live-delegated.ts` (Agent.Smith, delegated): 9 of 9 passed — sign-in, `/me`, list drive, scratch folder, inbox read, send with attachment to self, arrival, save the attachment to the drive, cleanup.
- `live-sharing.ts` (Agent.Smith): organization link created, listed, revoked; anonymous link refused by the tenant; invite by email not run (needs a recipient named by the owner).
- Still not run: matter restriction, change subscriptions (they need a public HTTPS endpoint), calendar, the Redis token store and the preview iframe.

## Configuration

Every setting is listed with its doctrine in `.env.example`.
