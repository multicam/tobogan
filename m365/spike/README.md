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
npm install
npm test          # 106 unit tests against a fake Graph
npm run typecheck
cp .env.example .env.local   # fill in, then:
npm run dev       # http://localhost:3000/workspace
```

Entra app registration: redirect URI `http://localhost:3000/api/auth/callback/microsoft-entra-id`, delegated permissions as listed in `lib/m365/config.ts`.

## Verified

- Unit tests, strict typecheck and `next build` pass.
- Signed out, the built app shows the sign-in button and the upload route returns 401.

## Not verified

- Nothing has run against a real tenant beyond the sign-in redirect (checked against a public tenant's discovery document): every Graph call, the preview iframe, Redis and webhooks are untested end to end. The order to test them in is PLAN-1.

## Configuration

Every setting is listed with its doctrine in `.env.example`.
