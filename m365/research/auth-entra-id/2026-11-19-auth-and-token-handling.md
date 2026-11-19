# Sign-in, tokens and permissions

**Question:** how should a Next.js app sign users in with Entra ID and hold Graph tokens so that calls keep working and tokens never reach the browser?

## Decisions

1. **Keep Graph tokens out of the cookie and the session.** On sign-in, move the access and refresh tokens to a server-side `TokenStore` keyed by the user; the cookie carries only that key. Implemented in `m365/spike/auth.ts` and `lib/m365/tokens.ts`.
2. **Refresh in one place, server-side.** `getAccessToken(userId)` refreshes five minutes before expiry, shares one in-flight refresh per user, and saves the result to the store.
3. **Distinguish "sign in again" from "try again".** `invalid_grant` and `interaction_required` delete the stored tokens and raise `ReauthRequiredError`; any other failure leaves them in place.
4. **Single tenant, explicit issuer.**
5. **Ask for the narrowest scopes that cover the features.**

## Why the guide's approach is not enough

- **It exposes the token.** `session.accessToken = token.accessToken` is returned by `/api/auth/session` and `useSession()`. The official Auth.js refresh pattern copies only `session.error`.
- **Refreshed tokens are not saved from server components.** Next.js does not allow setting cookies while rendering a server component, so a refresh done inside `auth()` there is thrown away and repeated on the next request. The Auth.js workaround is `export { auth as proxy } from "@/auth"` in `proxy.ts`. A server-side store removes the problem instead of working around it.
- **Cookie size.** Entra access and refresh tokens push the encrypted cookie past 4096 bytes. Auth.js splits it into chunks, all sent on every request.
- **Refresh failure is never handled.** `session.error` is set but nothing reads it.
- **An unset tenant variable silently produces** `https://login.microsoftonline.com/undefined/v2.0`. With no issuer at all the provider defaults to `common`, which accepts any Microsoft account.

## Verified facts

- `next-auth` dist-tags: `latest` 4.24.15, `beta` 5.0.0-beta.32 (both published 2026-07-20). There is no stable v5. The beta supports Next 14, 15 and 16.
- Provider import `next-auth/providers/microsoft-entra-id` and callback path `/api/auth/callback/microsoft-entra-id` are correct. The documented env var for the tenant is `AUTH_MICROSOFT_ENTRA_ID_ISSUER` (full issuer URL).
- Entra refresh tokens last 90 days by default. A new one is issued on each use and the old one is **not** revoked, so two concurrent refreshes are harmless as long as the newest token is stored.
- Refresh tokens for confidential clients survive a user password change, but are revoked by an admin reset or explicit revocation.
- Admin consent, delegated: not required by default for `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Sites.Selected`. Required for `Files.SelectedOperations.Selected` and `Lists.SelectedOperations.Selected`. A tenant's user-consent policy can still require admin consent for all of them.
- A client secret works for a delegated web app. Microsoft's guidance ranks it last, after managed identity, federated credentials and certificates.

## Limiting the app to one site

`Sites.ReadWrite.All` lets the app act on every site the user can reach. To restrict it to the target site:

1. Request delegated `Sites.Selected` instead.
2. An admin grants the app a role on the site (needs `Sites.FullControl.All`, and a SharePoint Administrator who is a member of the site):
   ```http
   POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
   { "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<client-id>", "displayName": "Cub" } }] }
   ```
3. Effective access is then the intersection of the app's role and the user's own permissions.

Recommended for production. It needs a one-off admin step per site.

## Scopes by feature

| Feature | Scope |
| --- | --- |
| Sign-in and refresh | `openid profile email offline_access` |
| Browse, upload, preview, share | `Sites.ReadWrite.All`, or `Sites.Selected` plus a site grant |
| Read mail and attachments | `Mail.Read` |
| Mark as read, drafts, large outgoing attachments | `Mail.ReadWrite` |
| Send | `Mail.Send` |
| Shared mailboxes | `Mail.Read.Shared`, `Mail.Send.Shared` |

## Open decisions

- **Auth library.** The Auth.js README now says Auth.js is part of Better Auth and recommends Better Auth for new projects; Auth.js continues to receive security and urgent fixes. If the existing repo already uses Auth.js, staying is reasonable. For a new auth layer, compare Better Auth and MSAL Node (`@azure/msal-node` 7.2.3), which refreshes tokens itself and supports certificates but needs a distributed cache plugin. `lib/m365/` does not depend on the choice.
- **Token store.** `MemoryTokenStore` loses tokens on restart and is not shared between instances. Production needs Redis or a database table, encrypted at rest, with entries removed on sign-out and after the refresh token's 90 days.
- **Secret or certificate.** A secret is the simplest to start; plan rotation, or move to a certificate.

## Unverified

- Whether the `next-auth/jwt` module augmentation applies cleanly in beta.32 (the spike avoids needing it).
- The spike's sign-in flow has not been run against a real tenant.

## Sources

- `nextauthjs/next-auth`: `README.md`, `docs/pages/guides/refresh-token-rotation.mdx`, `docs/pages/guides/extending-the-session.mdx`, `docs/pages/getting-started/providers/microsoft-entra-id.mdx`, `docs/pages/concepts/session-strategies.mdx`
- https://better-auth.com/blog/authjs-joins-better-auth
- `MicrosoftDocs/entra-docs`: `docs/identity-platform/refresh-tokens.md`, `security-best-practices-for-app-registration.md`
- `microsoftgraph/microsoft-graph-docs-contrib`: `concepts/permissions-reference.md`, `concepts/permissions-selected-overview.md`, `api-reference/v1.0/api/site-post-permissions.md`
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md
