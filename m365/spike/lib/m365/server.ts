import "server-only";
import { createClient } from "redis";
import { auth } from "@/auth";
import { config, delegatedScope } from "./config";
import { resolveDrive } from "./drive";
import { createGraphClient, createLimiter, type GraphClient, type Limiter } from "./graph-client";
import type { Role } from "./roles";
import {
  createAppTokenProvider,
  createTokenManager,
  EncryptedTokenStore,
  MemoryTokenStore,
  ReauthRequiredError,
  redisBackend,
  type TokenManager,
  type TokenStore,
} from "./tokens";

const USER_AGENT = "NONISV|Cub|NextM365Spike/0.1";

// Process-wide singletons, kept on globalThis so dev hot reloads reuse them.
const globals = globalThis as unknown as {
  __m365Tokens?: TokenManager;
  __m365AppToken?: () => Promise<string>;
  __m365MailLimiters?: Map<string, Limiter>;
};

/**
 * Token store (AUTH-7). With REDIS_URL set: Redis, encrypted with
 * TOKEN_ENCRYPTION_KEY. Without it: in-memory, allowed only outside
 * production unless TOKEN_STORE=memory says otherwise explicitly.
 */
function createTokenStore(): TokenStore {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required with REDIS_URL (openssl rand -base64 32).");
    const client = createClient({ url: redisUrl });
    client.on("error", (error) => console.error("token store connection error", error));
    const ready = client.connect();
    const backend = redisBackend(client);
    return new EncryptedTokenStore(
      {
        get: async (k) => (await ready, backend.get(k)),
        set: async (k, v, ttl) => (await ready, backend.set(k, v, ttl)),
        delete: async (k) => (await ready, backend.delete(k)),
      },
      key,
    );
  }
  if (process.env.NODE_ENV === "production" && process.env.TOKEN_STORE !== "memory") {
    throw new Error("No shared token store: set REDIS_URL and TOKEN_ENCRYPTION_KEY (or TOKEN_STORE=memory for a single test instance).");
  }
  return new MemoryTokenStore();
}

export function getTokenManager(): TokenManager {
  globals.__m365Tokens ??= createTokenManager({
    store: createTokenStore(),
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scope: delegatedScope(),
  });
  return globals.__m365Tokens;
}

/** One limiter per user, shared by every client acting for them (GRAPH-7). */
function mailLimiterFor(userId: string): Limiter {
  globals.__m365MailLimiters ??= new Map();
  let limiter = globals.__m365MailLimiters.get(userId);
  if (!limiter) {
    limiter = createLimiter(4);
    globals.__m365MailLimiters.set(userId, limiter);
  }
  return limiter;
}

export interface UserGraph {
  graph: GraphClient;
  userId: string;
  email?: string;
  role?: Role;
}

/** Graph client acting as the signed-in user. Throws ReauthRequiredError if there is none. */
export async function getUserGraph(): Promise<UserGraph> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ReauthRequiredError();
  const tokens = getTokenManager();
  const graph = createGraphClient({
    getAccessToken: () => tokens.getAccessToken(userId),
    userAgent: USER_AGENT,
    mailLimiter: mailLimiterFor(userId),
  });
  return { graph, userId, email: session.user.email ?? undefined, role: session.user.role };
}

export async function getGraph(): Promise<GraphClient> {
  return (await getUserGraph()).graph;
}

/**
 * Graph client acting as the app itself (MATTER-7). Only for actions the role
 * policy has already allowed; never hand it to code that serves user input
 * without that check.
 */
export function getAppGraph(): GraphClient {
  globals.__m365AppToken ??= createAppTokenProvider({
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  return createGraphClient({ getAccessToken: globals.__m365AppToken, userAgent: USER_AGENT });
}

export async function getDriveContext() {
  const user = await getUserGraph();
  const { driveId, siteId } = await resolveDrive(user.graph, config.sharePoint);
  return { ...user, driveId, siteId };
}

/** The signed-in user's firm role, or undefined (which every policy check denies). */
export async function getRole(): Promise<Role | undefined> {
  return (await auth())?.user?.role;
}
