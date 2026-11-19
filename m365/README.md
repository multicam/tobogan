# m365

Plumbing for Microsoft 365 in a Next.js app: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail.

## Documents

| Document | Type | Answers | Date |
| --- | --- | --- | --- |
| `integration-plan.md` | Planning | How the facts were checked, confidence per area, and the questions to answer before porting into the existing app | 2026-11-19 |
| `auth.md` | Research | How to sign users in with Entra ID and hold Graph tokens server-side; scopes; limiting the app to one site | 2026-11-19 |
| `graph-client.md` | Research | What sits between the app and Graph: throttling, paging, errors, change tracking | 2026-11-19 |
| `files.md` | Research | Browsing, uploading (small and resumable), previewing and editing SharePoint documents | 2026-11-19 |
| `sharing.md` | Research | Inviting people, sharing links, revoking, and how tenant policy affects them | 2026-11-19 |
| `mail.md` | Research | Reading mail, rendering bodies safely, attachments into SharePoint, sending | 2026-11-19 |
| `nextjs.md` | Research | Next.js 16 behaviours that shape the app layer: Server Actions, proxy, the upload route, headers | 2026-11-19 |
| `guide.md` | Reference | The original integration guide the research starts from. Not safe to use as written; see the research documents | 2026-11-19 |

## Code

| Directory | What | Checks |
| --- | --- | --- |
| `spike/` | Next.js 16 app with the hardened Graph layer in `spike/lib/m365/`. Also holds the `matters` track's code. | `npm test` (64 tests), `npm run typecheck`, `npm run build` |

Module-to-document map:

| Module in `spike/lib/m365/` | Document |
| --- | --- |
| `tokens.ts`, `server.ts`, `config.ts`, and `spike/auth.ts` | `auth.md` |
| `graph-client.ts` | `graph-client.md` |
| `drive.ts`, `names.ts` | `files.md` |
| `sharing.ts` | `sharing.md` |
| `mail.ts`, `email-html.ts` | `mail.md` |
| `spike/app/`, `spike/next.config.ts` | `nextjs.md` |
