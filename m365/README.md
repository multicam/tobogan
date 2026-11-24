# m365

Plumbing for Microsoft 365 in a Next.js app: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail.

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `integration-plan.md` | Planning | PLAN | How to get from this research to a robust integration: tenant tests, porting, fit questions, confidence | 2026-11-19 |
| `auth.md` | Research | AUTH | How to sign users in with Entra ID and hold Graph tokens server-side; scopes; limiting the app to one site | 2026-11-19 |
| `graph-client.md` | Research | GRAPH | What sits between the app and Graph: throttling, paging, errors, change tracking | 2026-11-19 |
| `files.md` | Research | FILES | Browsing, uploading, previewing and editing SharePoint documents | 2026-11-19 |
| `sharing.md` | Research | SHARE | Inviting people, sharing links, revoking, and tenant policy | 2026-11-19 |
| `mail.md` | Research | MAIL | Reading mail, rendering bodies safely, filing attachments, sending | 2026-11-19 |
| `nextjs.md` | Research | NEXT | Next.js 16 behaviours that shape the app layer | 2026-11-19 |
| `v2-mail-calendar.md` | Research | MAILCAL | What cub would need for Graph mail and calendar in v2, and what its v1 E50 deferral would have to change | 2026-11-22 |
| `v2-change-notifications.md` | Research | HOOK | What cub would need for Graph change notifications on SharePoint in v2, and what its v1 S7 deferral would have to change | 2026-11-22 |
| `spike/probe/RESULTS.md` | Research | none | Measured results of the 2026-11-23 live probes against `cub-staging`: what passed, what the tenant refused, prerequisites found | 2026-11-23 |
| `guide.md` | Reference | none | The original integration guide the research starts from. Not safe to use as written | 2026-11-19 |

## Code

| Directory | What | Checks |
| --- | --- | --- |
| `spike/` | Next.js 16 app with the hardened Graph layer in `spike/lib/m365/`. Also holds the `matters` track's code. | `bun run test` (522 tests), `bun run typecheck`, `bun run build` |

| Module in `spike/lib/m365/` | Doctrines |
| --- | --- |
| `tokens.ts`, `tenant.ts`, `scopes.ts`, `sites.ts`, `server.ts`, `config.ts`, and `spike/auth.ts` | AUTH |
| `graph-client.ts`, `changes.ts` | GRAPH |
| `drive.ts`, `names.ts` | FILES |
| `sharing.ts` | SHARE |
| `mail.ts`, `email-html.ts` | MAIL |
| `spike/app/`, `spike/next.config.ts` | NEXT |
| `roles.ts`, `matters.ts`, `authorize.ts` | MATTER, POLICY (`matters` track) |
