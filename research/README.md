# Research index

Research for integrating SharePoint, Office for the web and Exchange mail into an existing Next.js app (the cub project) through Microsoft Graph with delegated sign-in.

Starting point: `references/nextjs-sharepoint-m365-integration-guide.md`. Each note below checks one part of that guide against current documentation, records what to change, and lists what is still unverified. The decisions are implemented and tested in `spikes/nextjs-m365/`.

| # | Section | Note | Spike code |
| --- | --- | --- | --- |
| 1 | Sign-in, tokens, permissions | `auth-entra-id/2026-11-19-auth-and-token-handling.md` | `auth.ts`, `lib/m365/tokens.ts`, `lib/m365/server.ts` |
| 2 | Graph client: retries, paging, errors | `microsoft-graph/2026-11-19-graph-client.md` | `lib/m365/graph-client.ts` |
| 3 | SharePoint files: browse, upload, preview | `sharepoint/2026-11-19-files-upload-preview.md` | `lib/m365/drive.ts` |
| 4 | SharePoint sharing and permissions | `sharepoint/2026-11-19-sharing-and-permissions.md` | `lib/m365/sharing.ts` |
| 5 | Exchange mail | `other-microsoft-services/2026-11-19-exchange-mail.md` | `lib/m365/mail.ts`, `lib/m365/email-html.ts` |
| 6 | Next.js 16 specifics | `nextjs/2026-11-19-nextjs-16-integration.md` | `app/`, `next.config.ts` |

## How the facts were checked

`learn.microsoft.com`, `authjs.dev` and `nextjs.org` are blocked from the research environment. Facts were checked against the Markdown sources those sites are built from (`microsoftgraph/microsoft-graph-docs-contrib`, `MicrosoftDocs/entra-docs`, `SharePoint/sp-dev-docs`, `nextauthjs/next-auth`, `vercel/next.js`) and the npm registry, on 2026-11-19. Each note marks items that rest on weaker sources as **Unverified**.

Nothing has been run against a real Microsoft 365 tenant. The spike is verified by unit tests against a fake Graph, a typecheck, a production build and a signed-out smoke test only.

## Confidence

| Area | Confidence | What would raise it |
| --- | --- | --- |
| Graph client behaviour (retry, paging, token safety) | High | Nothing needed before integration |
| Token storage and refresh design | High for the logic; store is in-memory | Pick and wire a shared store (Redis or database) |
| Upload (small and resumable) | High for protocol; untested on a tenant | One real upload of a file over 100 MB |
| Preview embed | Medium | Confirm the preview URL frames from the app's origin on the target tenant |
| Sharing | Medium | Tenant sharing policy decides what works; test invite and link per scope |
| Mail read and attachment save | Medium-high | Test inline images and a shared mailbox if needed |
| Blank Office document creation | Low | Test on a tenant; template copy is the safe path |
| Auth.js as the auth library | Medium | See the open decision in note 1 |

## Fitting this into the existing repo

The existing repo has not been read (no access from this session), so these are the questions to answer against it before porting anything:

1. **Auth:** which library signs users in today (Auth.js, MSAL, Better Auth, something else)? `lib/m365/` only needs a `getAccessToken()` function, so it can sit behind any of them. If Auth.js with JWT sessions is already there, check whether the access token is copied onto the session.
2. **Session storage:** is there a database or Redis already? That decides the `TokenStore` implementation.
3. **Graph access:** is `@microsoft/microsoft-graph-client` already in use? Either keep it and add retry, paging and cursor checks around it, or move call sites to the thin client.
4. **Next.js version:** 16 renamed `middleware.ts` to `proxy.ts` and made `searchParams` a Promise. On 14 or 15 the spike's page and config need small changes.
5. **Which features already exist:** map them to notes 3 to 5 and compare against the "Guide problems" list in each.
6. **Hosting:** serverless limits (request duration and body size) decide whether the streaming upload route works as is or uploads must go browser-to-Graph directly.
7. **Tenant policy:** external sharing, anonymous links and user consent settings on the target tenant.
