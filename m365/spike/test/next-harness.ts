/**
 * Shared fakes for the Next.js-wired layer (auth.ts, lib/m365/server.ts,
 * authorize.ts, routes, Server Actions).
 *
 * Boundaries replaced, and nothing else:
 * - `next-auth`: Auth.js needs a live request to produce a session. The fake
 *   keeps the real config factory from auth.ts and returns the session the
 *   test signed in, by running auth.ts's own jwt and session callbacks.
 * - `redis`: an in-memory client with the node-redis surface server.ts uses.
 * - global `fetch`: one router answering Graph and the Entra token endpoint.
 *
 * Each test file wires the module mocks itself (vi.mock is hoisted per file):
 *   vi.mock("next-auth", () => import("./next-harness").then((m) => m.nextAuthModule));
 *   vi.mock("redis", () => import("./next-harness").then((m) => m.redisModule));
 */
import { vi } from "vitest";
import type { Call } from "./helpers";

// ---------------------------------------------------------------------------
// next-auth

/** The subset of the Auth.js config auth.ts produces that the tests drive. */
export interface CapturedConfig {
  session: { strategy: string };
  providers: { id: string; options?: { issuer?: string; clientId?: string; authorization?: { params?: { scope?: string } } } }[];
  callbacks: {
    jwt: (args: { token: Record<string, unknown>; account?: unknown; profile?: unknown }) => Promise<Record<string, unknown>>;
    session: (args: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => { user: Record<string, unknown> };
  };
  events: { signOut: (message: unknown) => Promise<void> };
}

export const authState: {
  factory?: (request?: unknown) => CapturedConfig;
  session: { user: Record<string, unknown> } | null;
} = { session: null };

const handlers = { GET: vi.fn(async () => new Response("get")), POST: vi.fn(async () => new Response("post")) };

export const nextAuthModule = {
  default: (factory: (request?: unknown) => CapturedConfig) => {
    authState.factory = factory;
    return { handlers, auth: async () => authState.session, signIn: async () => undefined, signOut: async () => undefined };
  },
};

export function authConfig(): CapturedConfig {
  if (!authState.factory) throw new Error("auth.ts has not been imported");
  return authState.factory(undefined);
}

/**
 * Sign a user in the way Auth.js would: run auth.ts's jwt callback with the
 * account and profile Entra returns, then its session callback.
 */
export async function signInAs(user: {
  uid: string;
  email?: string;
  roles?: string[];
  accessToken?: string;
  expiresAt?: number;
}): Promise<Record<string, unknown>> {
  const config = authConfig();
  const token = await config.callbacks.jwt({
    token: { sub: user.uid },
    account: {
      providerAccountId: user.uid,
      access_token: user.accessToken ?? `access-${user.uid}`,
      refresh_token: `refresh-${user.uid}`,
      expires_at: user.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    },
    profile: { roles: user.roles },
  });
  const session = config.callbacks.session({ session: { user: { email: user.email ?? null } }, token });
  authState.session = session;
  return token;
}

// ---------------------------------------------------------------------------
// redis

export interface FakeRedis {
  url?: string;
  data: Map<string, { value: string; px: number }>;
  listeners: Map<string, ((error: unknown) => void)[]>;
  connected: boolean;
}

export const redisState: { clients: FakeRedis[] } = { clients: [] };

export const redisModule = {
  createClient(options: { url?: string }) {
    const state: FakeRedis = { url: options.url, data: new Map(), listeners: new Map(), connected: false };
    redisState.clients.push(state);
    return {
      on(event: string, listener: (error: unknown) => void) {
        state.listeners.set(event, [...(state.listeners.get(event) ?? []), listener]);
        return this;
      },
      async connect() {
        state.connected = true;
      },
      async get(key: string) {
        return state.data.get(key)?.value ?? null;
      },
      async set(key: string, value: string, opts: { PX: number }) {
        state.data.set(key, { value, px: opts.PX });
        return "OK";
      },
      async del(key: string) {
        return state.data.delete(key) ? 1 : 0;
      },
    };
  },
};

// ---------------------------------------------------------------------------
// fetch router

type Responder = (call: Call, match: RegExpMatchArray) => Response | Promise<Response>;
export type Route = [method: string, pattern: RegExp, responder: Responder];

const active: { routes: Route[]; calls: Call[] } = { routes: [], calls: [] };

// The token manager, app token provider and Graph clients capture `fetch`
// when they are created, which may be before a test sets its routes. So the
// stub is one stable function reading the current routes, never the network.
const routedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const call: Call = { method: init?.method ?? "GET", url: String(input), headers: new Headers(init?.headers), body: init?.body };
  active.calls.push(call);
  for (const [method, pattern, responder] of active.routes) {
    const match = call.url.match(pattern);
    if (method === call.method && match) return responder(call, match);
  }
  throw new Error(`Unexpected request: ${call.method} ${call.url}`);
}) as typeof fetch;

/**
 * Fake fetch answering by method and URL pattern (first match wins), so
 * process-wide caches in the code under test do not desynchronise a queue.
 * Unmatched requests fail the test loudly. Replaces the previous routes.
 */
export function routeFetch(routes: Route[]) {
  active.routes = routes;
  active.calls = [];
  vi.stubGlobal("fetch", routedFetch);
  return { calls: active.calls, routes };
}

export const TOKEN_URL = /^https:\/\/login\.microsoftonline\.com\/[^/]+\/oauth2\/v2\.0\/token$/;

// ---------------------------------------------------------------------------
// environment and process-wide state

export const TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const ADMIN_GROUP = "22222222-2222-4222-8222-222222222222";
export const LEADERS_GROUP = "33333333-3333-4333-8333-333333333333";

/**
 * Every variable the server code reads, set explicitly so the developer's
 * shell or a local .env cannot change results. Empty means unset: the code
 * treats "" and undefined alike.
 */
export function stubBaseEnv(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: TENANT_ID,
    AUTH_MICROSOFT_ENTRA_ID_ID: "test-client-id",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "test-placeholder-not-a-secret",
    SHAREPOINT_HOSTNAME: "contoso.sharepoint.com",
    SHAREPOINT_SITE_PATH: "/sites/legal",
    SHAREPOINT_LIBRARY_NAME: "",
    SHAREPOINT_SITE_ACCESS: "",
    MATTER_PROVISIONING: "",
    MATTER_ADMIN_GROUP_ID: ADMIN_GROUP,
    MATTER_LEADERS_GROUP_ID: LEADERS_GROUP,
    MATTER_CLOSED_RETENTION_LABEL: "",
    FIRM_EMAIL_DOMAINS: "firm.example",
    REDIS_URL: "",
    TOKEN_ENCRYPTION_KEY: "",
    TOKEN_STORE: "",
    NODE_ENV: "test",
    GRAPH_NOTIFICATION_CLIENT_STATE: "",
  };
  for (const [name, value] of Object.entries({ ...base, ...overrides })) vi.stubEnv(name, value);
}

const SINGLETONS = ["__m365Tokens", "__m365AppToken", "__m365MailLimiters", "__m365Dirty"] as const;

/** Drop the globalThis singletons server.ts and the webhook route keep across hot reloads. */
export function resetProcessState() {
  const g = globalThis as Record<string, unknown>;
  for (const name of SINGLETONS) delete g[name];
  authState.session = null;
  redisState.clients.length = 0;
  // No test may reach the network: unrouted requests throw.
  routeFetch([]);
}

export function dirtySubscriptions(): Set<string> | undefined {
  return (globalThis as { __m365Dirty?: Set<string> }).__m365Dirty;
}

/** Reads the target of a Next.js redirect() from the error it throws. */
export async function redirectOf(run: () => Promise<unknown>): Promise<URL> {
  const error = (await run().then(
    () => undefined,
    (e: unknown) => e,
  )) as { digest?: string } | undefined;
  const digest = error?.digest ?? "";
  if (!digest.startsWith("NEXT_REDIRECT;")) throw new Error(`Expected a redirect, got ${String(error)}`);
  return new URL(digest.split(";")[2]!, "http://app.test");
}

export const graphJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---------------------------------------------------------------------------
// A small SharePoint library for the wired layer
//
//   site-1 / drive-1
//   root-id (drive root)
//   └── m1  "M-1 - Smith"   matter folder, MatterLead column = `lead`
//       └── d1              a document in the matter

const G = "https://graph\\.microsoft\\.com/v1\\.0";
export const graphUrl = (path: string) => new RegExp(`^${G}${path}(\\?|$)`);

const PARENTS: Record<string, string | undefined> = { "root-id": undefined, m1: "root-id", d1: "m1" };

/** Graph routes for the configured site, its default library and matter m1. */
export function libraryRoutes(options: { lead?: string } = {}): Route[] {
  return [
    ["POST", TOKEN_URL, () => Response.json({ access_token: "app-token", expires_in: 3600 })],
    ["GET", graphUrl("/sites/contoso\\.sharepoint\\.com:/sites/legal"), () => graphJson({ id: "site-1" })],
    ["GET", graphUrl("/sites/site-1/drive"), () => graphJson({ id: "drive-1" })],
    ["GET", graphUrl("/drives/drive-1/root"), () => graphJson({ id: "root-id" })],
    ["GET", graphUrl("/drives/drive-1/list"), () => graphJson({ id: "list-1", parentReference: { siteId: "site-1" } })],
    ["GET", graphUrl("/drives/drive-1/items/(m1|d1)/listItem"), (_c, m) => graphJson({ id: m[1] === "m1" ? "7" : "8" })],
    ["GET", graphUrl("/sites/site-1/lists/list-1/items/7/fields"), () => graphJson({ MatterNumber: "M-1", MatterLead: options.lead, MatterStatus: "Open" })],
    [
      "GET",
      graphUrl("/drives/drive-1/items/([^/?]+)"),
      (_c, m) => {
        const id = decodeURIComponent(m[1]!);
        if (!(id in PARENTS)) return graphJson({ error: { code: "itemNotFound", message: "The resource could not be found." } }, 404);
        const parent = PARENTS[id];
        return graphJson({ id, parentReference: parent ? { id: parent } : {} });
      },
    ],
  ];
}

/** Bearer token a recorded call carried. */
export const bearer = (call: Call) => call.headers.get("authorization")?.replace(/^Bearer /, "");
