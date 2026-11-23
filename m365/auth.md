# AUTH: Sign-in, tokens and permissions

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** how should a Next.js app sign users in with Entra ID and hold Graph tokens so that calls keep working and tokens never reach the browser?

## Doctrines

**AUTH-1. Graph tokens never leave the server.**
Access and refresh tokens live in a server-side store keyed by the user. The session cookie and the session object carry only that key.
- Why: the reference guide copies the access token onto the session, which `/api/auth/session` and `useSession()` then hand to the browser.
- Evidence: Auth.js exposes only name, email and image by default "to not accidentally expose sensitive user information"; its official refresh pattern copies only `session.error` to the session (`extending-the-session.mdx`, `refresh-token-rotation.mdx`).
- Basis: Verified, Tested
- Code: `spike/auth.ts` (moves tokens to the store at sign-in), `spike/lib/m365/tokens.ts`

**AUTH-2. Refresh tokens in one server-side place, before expiry, once per user at a time.**
`getAccessToken(userId)` refreshes five minutes before expiry, shares one in-flight refresh per user and saves the result.
- Why: Next.js cannot set cookies while rendering a server component, so a refresh kept in the JWT cookie is thrown away and repeated on every request. Entra tokens also push the cookie past 4096 bytes, so it is split into chunks sent with every request.
- Evidence: Next.js `cookies` reference; Auth.js cookie chunking (`ALLOWED_COOKIE_SIZE = 4096`). Entra issues a new refresh token on each use and does not revoke the old one, so a duplicate refresh is harmless as long as the newest token is stored (`refresh-tokens.md`).
- Basis: Verified, Tested
- Code: `createTokenManager` in `spike/lib/m365/tokens.ts`

**AUTH-3. Treat "sign in again" and "try again" as different failures.**
`invalid_grant` and `interaction_required` delete the stored tokens and raise `ReauthRequiredError`, which the page turns into a sign-in prompt. Any other refresh failure keeps the tokens so a later call can retry.
- Why: the guide sets `session.error` and never reads it, so users see failing calls instead of a sign-in prompt. Deleting tokens on a transient outage would sign everyone out.
- Basis: Tested
- Code: `spike/lib/m365/tokens.ts`, `spike/app/workspace/page.tsx`

**AUTH-4. Sign in against one tenant, with an explicit issuer, and fail loudly when it is not configured.**
- Why: with no issuer the provider defaults to `common`, which accepts any Microsoft account. An unset tenant variable silently produces `https://login.microsoftonline.com/undefined/v2.0`.
- Evidence: Auth.js Microsoft Entra ID provider page. The documented variable is `AUTH_MICROSOFT_ENTRA_ID_ISSUER`, holding the full issuer URL.
- Basis: Verified, Tested (smoke-tested: with the tenant unset, requests fail with "Missing environment variable AUTH_MICROSOFT_ENTRA_ID_TENANT_ID"; with it set, the app serves sign-in)
- Code: `tenantIssuer` in `spike/lib/m365/tenant.ts` refuses a missing value, `common`, `organizations`, `consumers` and anything that is not a GUID or domain. `spike/auth.ts` passes Auth.js a lazy configuration, so the check runs per request and `next build` still works without secrets.

**AUTH-5. Request the narrowest scopes that cover the features, and restrict the app to one site in production.**

| Feature | Scope |
| --- | --- |
| Sign-in and refresh | `openid profile email offline_access` |
| Browse, upload, preview, share | `Sites.ReadWrite.All`, or `Sites.Selected` plus a site grant |
| Read mail and attachments | `Mail.Read` |
| Mark as read, drafts, large outgoing attachments | `Mail.ReadWrite` |
| Send | `Mail.Send` |
| Shared mailboxes | `Mail.Read.Shared`, `Mail.Send.Shared` |

To restrict the app to one site: request delegated `Sites.Selected`; have an admin grant the app a role on the site; effective access is then the intersection of the app's role and the user's own permissions.

```http
POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
{ "roles": ["write"], "grantedToIdentities": [{ "application": { "id": "<client-id>", "displayName": "Cub" } }] }
```

- Why: `Sites.ReadWrite.All` lets the app act on every site the user can reach.
- Evidence: `permissions-selected-overview.md` ("all Selected scopes now support delegated and application modes"); the grant needs `Sites.FullControl.All` and a SharePoint Administrator who is a member of the site (`site-post-permissions.md`).
- Basis: Verified, Tested (smoke-tested: the sign-in redirect asks for `Sites.Selected`)
- Code: `graphScope` in `spike/lib/m365/scopes.ts` requests `Sites.Selected` by default; `SHAREPOINT_SITE_ACCESS=all` switches to `Sites.ReadWrite.All` for a development tenant without a grant. `grantAppSiteAccess` in `spike/lib/m365/sites.ts` performs the admin grant.

**AUTH-6. The Graph layer does not depend on the auth library.**
Everything in `spike/lib/m365/` except `server.ts` and `config.ts` needs only a `getAccessToken()` function.
- Why: the existing app's auth library is unknown, and Auth.js's future is uncertain (see Open).
- Basis: Tested
- Code: `createGraphClient({ getAccessToken })` in `spike/lib/m365/graph-client.ts`

**AUTH-7. In production the token store is shared between instances and encrypted at rest.**
Entries are removed at sign-out and after the refresh token's 90-day lifetime.
Each entry is sealed with AES-256-GCM, with the user key bound as associated data so an entry copied to another user's key fails to decrypt.
- Why: `MemoryTokenStore` loses every token on restart and is not shared between instances. Refresh tokens are 90-day credentials to the firm's documents and mail.
- Basis: Decision (owner, 2026-11-19: Redis on the staging EC2 instance; ElastiCache or equivalent for production), Tested
- Code: `EncryptedTokenStore` and `redisBackend` in `spike/lib/m365/tokens.ts`; `spike/lib/m365/server.ts` uses Redis when `REDIS_URL` and `TOKEN_ENCRYPTION_KEY` are set, and refuses to start in production without them unless `TOKEN_STORE=memory`. The store takes any `KeyValueBackend`, so a database table fits the same interface.

**AUTH-8. The app's own secrets live in AWS Secrets Manager, never in files on the server.**
The Entra client secret, `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` are fetched from Secrets Manager when the app starts (for example by the service unit before launching Node) and passed as environment variables. Per-user tokens do not go there (AUTH-7).
- Why: owner decision (2026-11-19, staging on EC2 with AWS Secrets). Secrets Manager bills and rate-limits per secret, so it suits a handful of app secrets, not one entry per user.
- Basis: Decision
- Code: none in the spike; deployment configuration.

## Open

- **Auth library.** The owner does not know yet what cub uses (2026-11-19); settle when the cub repository is attached (PLAN-3). The Auth.js README says it is now part of Better Auth and recommends Better Auth for new projects; Auth.js keeps receiving security and urgent fixes. If the existing app uses Auth.js, staying is reasonable. For a new auth layer, compare Better Auth and MSAL Node (`@azure/msal-node` 7.2.3), which refreshes tokens itself and supports certificates but needs a distributed cache plugin.
  PLAN-5 recommends no auth library: cub keeps its own OIDC code and adopts the thin Graph client; recommended, pending the owner's ruling.
- **Secret or certificate.** A client secret works for a delegated web app. Microsoft ranks it last, after managed identity, federated credentials and certificates. Start with a secret and plan rotation, or go straight to a certificate.
- **Unverified:** whether `next-auth/jwt` module augmentation applies cleanly in beta.32 (the spike avoids needing it). Sign-in has not been run against a tenant.

## Reference

- `next-auth` dist-tags: `latest` 4.24.15, `beta` 5.0.0-beta.32 (2026-07-20). No stable v5. The beta supports Next 14, 15 and 16.
- Provider import `next-auth/providers/microsoft-entra-id`; callback path `/api/auth/callback/microsoft-entra-id`.
- With a tenant id that does not exist, Microsoft's discovery endpoint returns `invalid_tenant` and the Auth.js provider fails with an unhelpful `TypeError ... reading 'replace'` (seen in the smoke test). Check the tenant id first when sign-in fails that way.
- Entra refresh tokens last 90 days by default. Confidential-client tokens survive a user password change but are revoked by an admin reset or explicit revocation.
- Admin consent (delegated) is not required by default for `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `Mail.Read`, `Mail.ReadWrite`, `Mail.Send` or `Sites.Selected`, and is required for `Files.SelectedOperations.Selected` and `Lists.SelectedOperations.Selected`. A tenant's consent policy can require it for all of them.

## Sources

- `nextauthjs/next-auth`: `README.md`, `docs/pages/guides/refresh-token-rotation.mdx`, `docs/pages/guides/extending-the-session.mdx`, `docs/pages/getting-started/providers/microsoft-entra-id.mdx`, `docs/pages/concepts/session-strategies.mdx`
- https://better-auth.com/blog/authjs-joins-better-auth
- `MicrosoftDocs/entra-docs`: `docs/identity-platform/refresh-tokens.md`, `security-best-practices-for-app-registration.md`
- `microsoftgraph/microsoft-graph-docs-contrib`: `concepts/permissions-reference.md`, `concepts/permissions-selected-overview.md`, `api-reference/v1.0/api/site-post-permissions.md`
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md
