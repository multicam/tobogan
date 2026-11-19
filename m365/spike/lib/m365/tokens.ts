import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
/**
 * Server-side storage and refresh of Microsoft Graph tokens.
 *
 * Tokens never go into the session cookie or the client-visible session. The
 * cookie only identifies the user; tokens live in a TokenStore and are
 * refreshed here, so a refresh done while rendering a server component is
 * persisted (a cookie could not be rewritten at that point).
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface TokenStore {
  get(userId: string): Promise<StoredTokens | undefined>;
  set(userId: string, tokens: StoredTokens): Promise<void>;
  delete(userId: string): Promise<void>;
}

/** Dev/test only: lost on restart and not shared between instances. */
export class MemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, StoredTokens>();
  async get(userId: string) {
    return this.map.get(userId);
  }
  async set(userId: string, tokens: StoredTokens) {
    this.map.set(userId, tokens);
  }
  async delete(userId: string) {
    this.map.delete(userId);
  }
}

/** The user must sign in again (no tokens, or the refresh token was rejected). */
export class ReauthRequiredError extends Error {
  override readonly name = "ReauthRequiredError";
  constructor(message = "Microsoft 365 sign-in required.") {
    super(message);
  }
}

export interface TokenManagerOptions {
  store: TokenStore;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Space-separated scopes requested on refresh. */
  scope: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Refresh this long before expiry. Default 5 minutes. */
  skewMs?: number;
}

export interface TokenManager {
  save(userId: string, tokens: StoredTokens): Promise<void>;
  getAccessToken(userId: string): Promise<string>;
  forget(userId: string): Promise<void>;
}

export function createTokenManager(options: TokenManagerOptions): TokenManager {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const skew = options.skewMs ?? 5 * 60_000;
  // One refresh per user at a time within this process.
  const inFlight = new Map<string, Promise<StoredTokens>>();

  async function refresh(userId: string, current: StoredTokens): Promise<StoredTokens> {
    const response = await doFetch(
      `https://login.microsoftonline.com/${encodeURIComponent(options.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: "refresh_token",
          refresh_token: current.refreshToken,
          scope: options.scope,
        }),
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      // invalid_grant / interaction_required: revoked, expired, password
      // change, conditional access. Only a new interactive sign-in fixes it.
      if (payload.error === "invalid_grant" || payload.error === "interaction_required") {
        await options.store.delete(userId);
        throw new ReauthRequiredError();
      }
      // Anything else (5xx, network) is transient: keep the stored tokens.
      throw new Error(`Token refresh failed: ${payload.error ?? response.status}`);
    }

    const next: StoredTokens = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? current.refreshToken,
      expiresAt: now() + (payload.expires_in ?? 3600) * 1_000,
    };
    await options.store.set(userId, next);
    return next;
  }

  return {
    save: (userId, tokens) => options.store.set(userId, tokens),
    forget: (userId) => options.store.delete(userId),
    async getAccessToken(userId) {
      const current = await options.store.get(userId);
      if (!current) throw new ReauthRequiredError();
      if (now() < current.expiresAt - skew) return current.accessToken;

      let pending = inFlight.get(userId);
      if (!pending) {
        pending = refresh(userId, current).finally(() => inFlight.delete(userId));
        inFlight.set(userId, pending);
      }
      return (await pending).accessToken;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared, encrypted token storage (AUTH-7)

/** Minimal key-value backend; a Redis adapter is below. */
export interface KeyValueBackend {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Entra refresh tokens last 90 days; nothing outlives that. */
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Encrypts each user's tokens with AES-256-GCM before they reach the backend.
 * The user key is bound as associated data, so an entry copied to another
 * user's key fails to decrypt instead of granting that user's access.
 */
export class EncryptedTokenStore implements TokenStore {
  private readonly key: Buffer;

  constructor(
    private readonly backend: KeyValueBackend,
    keyBase64: string,
    private readonly options: { prefix?: string; ttlMs?: number } = {},
  ) {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) throw new Error("Token encryption key must be 32 bytes, base64 encoded (openssl rand -base64 32).");
    this.key = key;
  }

  private storageKey(userId: string) {
    return `${this.options.prefix ?? "m365:tokens:"}${userId}`;
  }

  async get(userId: string): Promise<StoredTokens | undefined> {
    const sealed = await this.backend.get(this.storageKey(userId));
    if (!sealed) return undefined;
    try {
      return JSON.parse(open(this.key, sealed, userId)) as StoredTokens;
    } catch {
      // Tampered, wrong key or wrong user: treat as absent so the user signs in again.
      await this.backend.delete(this.storageKey(userId));
      return undefined;
    }
  }

  async set(userId: string, tokens: StoredTokens): Promise<void> {
    await this.backend.set(this.storageKey(userId), seal(this.key, JSON.stringify(tokens), userId), this.options.ttlMs ?? TOKEN_TTL_MS);
  }

  async delete(userId: string): Promise<void> {
    await this.backend.delete(this.storageKey(userId));
  }
}

function seal(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

function open(key: Buffer, sealed: string, aad: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** Adapter for the `redis` package (node-redis v4 and later). */
export function redisBackend(client: {
  get(key: string): Promise<string | null | {}>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}): KeyValueBackend {
  return {
    get: async (key) => {
      const value = await client.get(key);
      return typeof value === "string" ? value : null;
    },
    set: async (key, value, ttlMs) => void (await client.set(key, value, { PX: ttlMs })),
    delete: async (key) => void (await client.del(key)),
  };
}

// ---------------------------------------------------------------------------
// App-only tokens (MATTER-7): client credentials for actions the app performs itself

export function createAppTokenProvider(options: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
  skewMs?: number;
}): () => Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const skew = options.skewMs ?? 5 * 60_000;
  let cached: { token: string; expiresAt: number } | undefined;
  let inFlight: Promise<string> | undefined;

  async function fetchToken(): Promise<string> {
    const response = await doFetch(`https://login.microsoftonline.com/${encodeURIComponent(options.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !payload.access_token) throw new Error(`App token request failed: ${payload.error ?? response.status}`);
    cached = { token: payload.access_token, expiresAt: now() + (payload.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  return async () => {
    if (cached && now() < cached.expiresAt - skew) return cached.token;
    inFlight ??= fetchToken().finally(() => (inFlight = undefined));
    return inFlight;
  };
}
