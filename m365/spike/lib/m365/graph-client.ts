/**
 * Thin Microsoft Graph client on top of fetch.
 *
 * Framework-agnostic: it only needs a function that returns a valid access
 * token, so it can sit behind Auth.js, MSAL or any existing auth layer.
 */

const GRAPH_HOST = "graph.microsoft.com";
const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE"]);

export class GraphError extends Error {
  override readonly name = "GraphError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
  get isAuth() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
}

export interface GraphClientOptions {
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  /** Retries after the first attempt. Default 4. */
  maxRetries?: number;
  /** Upper bound for a single wait, in ms. Default 30s. */
  maxRetryDelayMs?: number;
  baseUrl?: string;
  /** Sent as User-Agent; SharePoint asks apps to identify themselves. */
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Caps concurrent requests to one mailbox (GRAPH-7). Applied only to mail
   * paths; share one limiter per user across all of that user's clients.
   */
  mailLimiter?: Limiter;
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** Simple FIFO semaphore. */
export function createLimiter(max: number): Limiter & { readonly active: number; readonly queued: number } {
  if (!Number.isInteger(max) || max < 1) throw new RangeError("Limiter needs a positive integer.");
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    get active() {
      return active;
    },
    get queued() {
      return waiting.length;
    },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
      active++;
      try {
        return await task();
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
  };
}

const MAIL_PATH = /^\/v1\.0\/(me|users\/[^/]+)\/(messages|mailFolders|sendMail)(\/|\(|$)/i;

/** True for requests that count against a mailbox's Outlook limits. */
export function isMailRequest(url: URL): boolean {
  return MAIL_PATH.test(url.pathname);
}

export interface RawResult<T = unknown> {
  status: number;
  headers: Headers;
  body: T | undefined;
}

export interface GraphRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** JSON body. */
  json?: unknown;
  /** Raw body (bytes). Takes precedence over `json`. */
  body?: Uint8Array | ArrayBuffer;
  contentType?: string;
  /** "raw" returns status, headers and parsed body, e.g. to read a 202's Location. */
  responseType?: "json" | "bytes" | "none" | "raw";
  signal?: AbortSignal;
}

export interface GraphPage<T> {
  items: T[];
  /** Opaque cursor for the next page, or undefined on the last page. */
  nextLink?: string;
}

export interface GraphClient {
  request<T = unknown>(method: string, path: string, options?: GraphRequestOptions): Promise<T>;
  getPage<T>(path: string, options?: GraphRequestOptions): Promise<GraphPage<T>>;
  /** Follows @odata.nextLink until exhausted or `maxItems` reached. */
  getAll<T>(path: string, options?: GraphRequestOptions & { maxItems?: number }): Promise<T[]>;
}

/** Encode one path segment (an id or a file name). */
export const seg = (value: string) => encodeURIComponent(value);

export function createGraphClient(options: GraphClientOptions): GraphClient {
  const doFetch = options.fetch ?? fetch;
  const maxRetries = options.maxRetries ?? 4;
  const maxDelay = options.maxRetryDelayMs ?? 30_000;
  const baseUrl = options.baseUrl ?? `https://${GRAPH_HOST}/v1.0`;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  function buildUrl(path: string, query?: GraphRequestOptions["query"]): URL {
    let url: URL;
    if (/^https?:\/\//i.test(path)) {
      // Absolute URLs are only ever @odata.nextLink cursors. Never send the
      // bearer token to a host other than Graph, even if a cursor round-tripped
      // through the browser and was tampered with.
      url = new URL(path);
      if (url.protocol !== "https:" || url.hostname !== new URL(baseUrl).hostname) {
        throw new GraphError(400, "invalidCursor", "Refusing to call a non-Graph URL.");
      }
    } else {
      url = new URL(baseUrl + (path.startsWith("/") ? path : `/${path}`));
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async function request<T>(method: string, path: string, opts: GraphRequestOptions = {}): Promise<T> {
    const verb = method.toUpperCase();
    const url = buildUrl(path, opts.query);
    let attempt = 0;

    for (;;) {
      const headers = new Headers(opts.headers);
      headers.set("Authorization", `Bearer ${await options.getAccessToken()}`);
      if (options.userAgent) headers.set("User-Agent", options.userAgent);

      let body: BodyInit | undefined;
      if (opts.body !== undefined) {
        body = opts.body as BodyInit;
        headers.set("Content-Type", opts.contentType ?? "application/octet-stream");
      } else if (opts.json !== undefined) {
        body = JSON.stringify(opts.json);
        headers.set("Content-Type", "application/json");
      }

      let response: Response;
      try {
        const send = () => doFetch(url, { method: verb, headers, body, signal: opts.signal, cache: "no-store" });
        response = options.mailLimiter && isMailRequest(url) ? await options.mailLimiter.run(send) : await send();
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        // Network failure: the request may or may not have been processed.
        if (IDEMPOTENT.has(verb) && attempt < maxRetries) {
          await sleep(backoff(attempt++, maxDelay));
          continue;
        }
        throw error;
      }

      if (response.ok) {
        if (opts.responseType === "raw") {
          const text = await response.text();
          return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : undefined } as T;
        }
        if (opts.responseType === "none" || response.status === 204 || response.status === 202) {
          await response.body?.cancel();
          return undefined as T;
        }
        if (opts.responseType === "bytes") return new Uint8Array(await response.arrayBuffer()) as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      // 429 means "not processed" so it is safe to retry for every verb.
      // 5xx is only retried when repeating the request cannot duplicate work.
      const retryable =
        response.status === 429 ||
        ((response.status === 502 || response.status === 503 || response.status === 504) && IDEMPOTENT.has(verb));

      if (retryable && attempt < maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
        await response.body?.cancel();
        await sleep(Math.min(retryAfter ?? backoff(attempt, maxDelay), maxDelay));
        attempt++;
        continue;
      }

      throw await toGraphError(response);
    }
  }

  async function getPage<T>(path: string, opts?: GraphRequestOptions): Promise<GraphPage<T>> {
    const data = await request<{ value?: T[]; "@odata.nextLink"?: string }>("GET", path, opts);
    return { items: data?.value ?? [], nextLink: data?.["@odata.nextLink"] };
  }

  async function getAll<T>(path: string, opts: GraphRequestOptions & { maxItems?: number } = {}): Promise<T[]> {
    const max = opts.maxItems ?? 5_000;
    const all: T[] = [];
    let page = await getPage<T>(path, opts);
    for (;;) {
      all.push(...page.items);
      if (!page.nextLink || all.length >= max) break;
      // nextLink already carries the query; only pass headers on.
      page = await getPage<T>(page.nextLink, { headers: opts.headers, signal: opts.signal });
    }
    return all.slice(0, max);
  }

  return { request, getPage, getAll };
}

function backoff(attempt: number, maxDelay: number) {
  const base = Math.min(1_000 * 2 ** attempt, maxDelay);
  return base / 2 + Math.random() * (base / 2);
}

/** Retry-After is either delta-seconds or an HTTP date. Returns ms. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

async function toGraphError(response: Response): Promise<GraphError> {
  const requestId = response.headers.get("request-id") ?? undefined;
  let code = `http${response.status}`;
  let message = response.statusText || "Graph request failed";
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    if (payload?.error?.code) code = payload.error.code;
    if (payload?.error?.message) message = payload.error.message;
  } catch {
    // Non-JSON error body; keep the defaults.
  }
  return new GraphError(response.status, code, message, requestId);
}
