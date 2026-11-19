# NEXT: Next.js 16 app layer

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** which Next.js behaviours affect this integration, and how should the app layer be shaped?

Checked against Next.js 16.4.6.

## Doctrines

**NEXT-1. Every Server Action authenticates and validates its own arguments.**
- Why: each Server Action is a public POST endpoint, and its argument types are not enforced at runtime.
- Basis: Verified, Tested
- Code: `spike/app/workspace/actions.ts` (each action calls `getDriveContext()`, which throws without a session; the library functions validate every argument)

**NEXT-2. Uploads go through a streaming route handler that rejects cross-site requests.**
`PUT /api/upload?folderId=...&name=...` takes the raw file as its body. It requires an exact `Content-Length` (411 without), rejects files over 2 GB (413), and requires an `x-requested-with: fetch` header.
- Why: Server Actions accept 1 MB by default (`experimental.serverActions.bodySizeLimit`) and buffer the body. A cross-site HTML form cannot set the custom header and a cross-site `fetch` is preflighted, which blocks request forgery; Next.js gives Server Actions an origin check but not route handlers.
- Evidence: Next.js `serverActions.mdx`. Streaming a request body into Graph is standard Web API usage, not a documented Next.js pattern.
- Basis: Verified, Tested (smoke-tested signed out: 400 without the header, 401 without a session)
- Code: `spike/app/api/upload/route.ts`

**NEXT-3. Code that touches tokens or Graph is server-only.**
- Why: an accidental client import would ship token handling to the browser.
- Basis: Verified
- Code: `import "server-only"` in `config.ts` and `server.ts`

**NEXT-4. Check authorization where data is read, not in the proxy.**
- Why: Next.js says the proxy should do optimistic checks only and "should not be your only line of defense".
- Evidence: Next.js data security guide.
- Basis: Verified

**NEXT-5. Keep upload routes out of the proxy.**
- Why: `middleware.ts` is now `proxy.ts`, and its `experimental.proxyClientMaxBodySize` (10 MB by default) truncates larger bodies without failing the request.
- Evidence: Next.js `proxy.mdx`, `proxyClientMaxBodySize.mdx`. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- Basis: Verified
- Code: the spike has no proxy. When one is added, exclude `/api/upload` from its matcher.

**NEXT-6. Never cache per-user data.**
- Why: `fetch` is not cached by default, but under `cacheComponents` a `use cache` scope cannot read cookies; per-user Graph data inside one would be served to other users unless the user id is an argument.
- Evidence: Next.js `fetch.mdx`.
- Basis: Verified
- Code: GRAPH-6 (`cache: "no-store"` on every Graph call)

**NEXT-7. The app frames only itself, SharePoint and Office.**
`Content-Security-Policy: frame-src 'self' https://*.sharepoint.com https://*.officeapps.live.com; frame-ancestors 'self'`, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. Both iframes use `referrerPolicy="no-referrer"`.
- Why: limits where a compromised page could load frames from, and stops the app being framed elsewhere.
- Basis: Tested (smoke-tested headers)
- Code: `spike/next.config.ts`. A full CSP (script and style sources) is left to the host app.

## Open

- On serverless hosts, request duration and body limits apply to NEXT-2. If they are too low, have the server create the upload session and the browser PUT fragments straight to the `uploadUrl`, which needs no bearer token.
- The signed-in flow has not been exercised; it needs a tenant.

## Reference

- `searchParams` is a Promise; synchronous access was removed in 16.
- Setting cookies is not supported while rendering a server component (the reason for AUTH-2).
- Next.js 16 needs Node 20.9 or later and TypeScript 5.1 or later.
- Checked in the spike: strict `tsc --noEmit`, `next build`, and signed out: `/workspace` shows sign-in, `/api/auth/session` returns `null`.

## Sources

`vercel/next.js`, `docs/01-app/`: `03-api-reference/05-config/01-next-config-js/serverActions.mdx`, `proxyClientMaxBodySize.mdx`, `03-file-conventions/proxy.mdx`, `route.mdx`, `04-functions/cookies.mdx`, `fetch.mdx`, `02-guides/data-security.mdx`, `upgrading/version-16.mdx`.
