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
