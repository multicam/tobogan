# Next.js 16 specifics

**Question:** which Next.js behaviours affect this integration, and how should the app layer be shaped?

Checked against Next.js 16.4.6, the version the spike builds with.

## Decisions

1. **Server Actions for small mutations only** (invite, link, revoke, save attachment). Each one authenticates and validates its own arguments, because every action is a public POST endpoint.
2. **Uploads use a route handler** that streams `request.body`.
3. **All Graph code is server-only.** The modules that touch tokens import `server-only`.
4. **Authorization is checked where data is read**, not in the proxy.
5. **Security headers** limit what the app may frame.

## Verified facts

- **Server Action body limit:** 1 MB by default, configured with `experimental.serverActions.bodySizeLimit`. The guide's upload action fails above that and buffers the whole file.
- **`middleware.ts` is now `proxy.ts`** (export `proxy`, Node.js runtime only). Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- **Proxy body limit:** `experimental.proxyClientMaxBodySize` defaults to 10 MB, and larger bodies are **truncated without failing the request**. If the app has a proxy, exclude the upload route from its matcher or raise the limit.
- **`searchParams` is a Promise;** synchronous access was removed in 16. The guide's page already awaits it.
- **`fetch` is not cached by default.** With `cacheComponents`, a `use cache` scope cannot read cookies, so per-user Graph data must not be placed in one unless the user id is an argument.
- **Setting cookies is not supported while rendering a server component.** This is why token refresh state lives in a server-side store (see the auth note).
- Next's own guidance: the proxy should do optimistic checks only and "should not be your only line of defense".

## The upload route

`app/api/upload/route.ts` accepts `PUT /api/upload?folderId=...&name=...` with the raw file as the body.

- Requires an exact `Content-Length` (411 without it) and rejects files over 2 GB (413).
- Requires an `x-requested-with: fetch` header. A cross-site HTML form cannot set it and a cross-site `fetch` would be preflighted, which blocks cross-site request forgery; Server Actions get an equivalent origin check from Next.js, route handlers do not.
- Maps errors to status codes: 401 when sign-in is needed, 400 for invalid names or ids, the Graph status for other client errors, 502 for upstream failures.

Streaming a request body into a Graph upload session is standard Web API usage, not a pattern from the Next.js documentation. On serverless hosts the request duration and body size limits apply; if they are too low, have the server create the upload session and let the browser PUT fragments straight to the `uploadUrl` (it needs no bearer token).

## Headers

`next.config.ts` sets:

- `Content-Security-Policy: frame-src 'self' https://*.sharepoint.com https://*.officeapps.live.com; frame-ancestors 'self'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Both iframes use `referrerPolicy="no-referrer"`. A full CSP (script and style sources) is left to the host app.

## Checked in the spike

- `tsc --noEmit` passes with `strict` and `noUncheckedIndexedAccess`.
- `next build` succeeds.
- Signed out: `/workspace` shows the sign-in button, `/api/auth/session` returns `null`, `/api/upload` returns 401 (400 without the header).
- The signed-in flow has not been exercised; it needs a tenant.

## Sources

`vercel/next.js`, `docs/01-app/`: `03-api-reference/05-config/01-next-config-js/serverActions.mdx`, `proxyClientMaxBodySize.mdx`, `03-file-conventions/proxy.mdx`, `route.mdx`, `04-functions/cookies.mdx`, `fetch.mdx`, `02-guides/data-security.mdx`, `upgrading/version-16.mdx`.
