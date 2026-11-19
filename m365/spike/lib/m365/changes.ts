/**
 * Change tracking (GRAPH-8): delta queries for files and mail, and change
 * notification subscriptions that tell us when to run them.
 */
import { GraphError, seg, type GraphClient } from "./graph-client";
import { assertId } from "./names";

interface DeltaPage<T> {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface DeltaResult<T> {
  changes: T[];
  /** Persist this and pass it to the next call. */
  deltaLink: string;
  /** The previous deltaLink had expired, so this is a full listing: rebuild state from it. */
  resynced: boolean;
}

async function runDelta<R, T>(
  graph: GraphClient,
  start: string,
  previous: string | undefined,
  map: (raw: R) => T,
  headers?: Record<string, string>,
  query?: Record<string, string>,
): Promise<DeltaResult<T>> {
  const changes: T[] = [];
  let url = previous ?? start;
  let useQuery = previous ? undefined : query;
  let resynced = false;
  for (let pages = 0; pages < 10_000; pages++) {
    let page: DeltaPage<R>;
    try {
      page = await graph.request<DeltaPage<R>>("GET", url, { headers, query: useQuery });
    } catch (error) {
      // 410 Gone: the token expired. Start over without it.
      if (error instanceof GraphError && error.status === 410 && !resynced && url !== start) {
        resynced = true;
        changes.length = 0;
        url = start;
        useQuery = query;
        continue;
      }
      throw error;
    }
    for (const raw of page.value ?? []) changes.push(map(raw));
    if (page["@odata.deltaLink"]) return { changes, deltaLink: page["@odata.deltaLink"], resynced };
    if (!page["@odata.nextLink"]) throw new GraphError(502, "deltaIncomplete", "Delta response had neither nextLink nor deltaLink.");
    url = page["@odata.nextLink"];
    useQuery = undefined;
  }
  throw new GraphError(502, "deltaTooLong", "Delta did not finish within 10,000 pages.");
}

export interface DriveChange {
  id: string;
  /** Omitted by SharePoint for deleted items. */
  name?: string;
  deleted: boolean;
  isFolder: boolean;
  parentId?: string;
}

interface RawDeltaItem {
  id: string;
  name?: string;
  deleted?: object;
  folder?: object;
  parentReference?: { id?: string };
}

/** Changes in a whole drive. Track items by id; SharePoint omits cTag and, for deletes, name. */
export function driveDelta(graph: GraphClient, driveId: string, deltaLink?: string): Promise<DeltaResult<DriveChange>> {
  return runDelta<RawDeltaItem, DriveChange>(
    graph,
    `/drives/${seg(driveId)}/root/delta`,
    deltaLink,
    (raw) => ({ id: raw.id, name: raw.name, deleted: Boolean(raw.deleted), isFolder: Boolean(raw.folder), parentId: raw.parentReference?.id }),
    undefined,
    { $select: "id,name,deleted,folder,parentReference" },
  );
}

export interface MailChange {
  id: string;
  removed: boolean;
  subject?: string;
  isRead?: boolean;
  receivedDateTime?: string;
}

interface RawMailDelta {
  id: string;
  "@removed"?: object;
  subject?: string;
  isRead?: boolean;
  receivedDateTime?: string;
}

const WELL_KNOWN_FOLDERS = new Set(["inbox", "sentitems", "drafts", "deleteditems", "archive"]);

/** Changes in one mail folder, with immutable ids (MAIL-1). */
export function mailDelta(graph: GraphClient, folder = "inbox", deltaLink?: string): Promise<DeltaResult<MailChange>> {
  const folderId = WELL_KNOWN_FOLDERS.has(folder.toLowerCase()) ? folder : assertId(folder, "folder id");
  return runDelta<RawMailDelta, MailChange>(
    graph,
    `/me/mailFolders/${seg(folderId)}/messages/delta`,
    deltaLink,
    (raw) => ({ id: raw.id, removed: Boolean(raw["@removed"]), subject: raw.subject, isRead: raw.isRead, receivedDateTime: raw.receivedDateTime }),
    { Prefer: 'IdType="ImmutableId"' },
    { $select: "id,subject,isRead,receivedDateTime" },
  );
}

/** Longest lifetimes Graph accepts, in minutes, kept a little under the limit. */
export const MAX_SUBSCRIPTION_MINUTES = { drive: 42_300 - 60, mail: 10_080 - 60 } as const;

export interface Subscription {
  id: string;
  resource: string;
  expirationDateTime: string;
}

export async function subscribe(
  graph: GraphClient,
  input: {
    kind: "drive" | "mail";
    /** Drive id for "drive"; ignored for "mail" (the signed-in user's inbox). */
    driveId?: string;
    notificationUrl: string;
    lifecycleNotificationUrl?: string;
    clientState: string;
    now?: number;
  },
): Promise<Subscription> {
  if (!/^https:\/\//.test(input.notificationUrl)) throw new GraphError(400, "invalidUrl", "Notification URL must be HTTPS.");
  if (input.clientState.length < 16 || input.clientState.length > 128) {
    throw new GraphError(400, "invalidClientState", "clientState must be 16 to 128 characters.");
  }
  const resource =
    input.kind === "drive"
      ? `/drives/${seg(assertId(input.driveId, "drive id"))}/root` // only the drive root is supported on SharePoint
      : "/me/mailFolders('inbox')/messages";
  const expires = new Date((input.now ?? Date.now()) + MAX_SUBSCRIPTION_MINUTES[input.kind] * 60_000).toISOString();
  return graph.request<Subscription>("POST", "/subscriptions", {
    // Mail subscriptions must ask for immutable ids when created.
    headers: input.kind === "mail" ? { Prefer: 'IdType="ImmutableId"' } : undefined,
    json: {
      changeType: input.kind === "drive" ? "updated" : "created,updated,deleted",
      notificationUrl: input.notificationUrl,
      lifecycleNotificationUrl: input.lifecycleNotificationUrl,
      resource,
      expirationDateTime: expires,
      clientState: input.clientState,
    },
  });
}

export async function renewSubscription(graph: GraphClient, id: string, kind: "drive" | "mail", now = Date.now()) {
  return graph.request<Subscription>("PATCH", `/subscriptions/${seg(assertId(id, "subscription id"))}`, {
    json: { expirationDateTime: new Date(now + MAX_SUBSCRIPTION_MINUTES[kind] * 60_000).toISOString() },
  });
}

export async function unsubscribe(graph: GraphClient, id: string) {
  await graph.request("DELETE", `/subscriptions/${seg(assertId(id, "subscription id"))}`, { responseType: "none" });
}

export interface Notification {
  subscriptionId: string;
  resource?: string;
  changeType?: string;
  /** Set for lifecycle events: reauthorizationRequired, subscriptionRemoved, missed. */
  lifecycleEvent?: string;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Handles Graph's webhook POSTs. Answers the validation handshake, drops
 * notifications whose clientState does not match, and hands the rest to
 * `onNotifications` without waiting, so Graph gets its 202 within 3 seconds.
 * Notifications carry no item data: the receiver should run a delta query.
 */
export async function handleNotificationRequest(
  request: Request,
  options: { clientState: string; onNotifications: (items: Notification[]) => Promise<void> | void },
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("validationToken");
  if (token !== null) {
    return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  let payload: { value?: (Notification & { clientState?: string })[] };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return new Response(null, { status: 400 });
  }
  const trusted = (payload.value ?? [])
    .filter((n) => typeof n.clientState === "string" && sameSecret(n.clientState, options.clientState))
    .map(({ subscriptionId, resource, changeType, lifecycleEvent }) => ({ subscriptionId, resource, changeType, lifecycleEvent }));
  if (trusted.length > 0) {
    void Promise.resolve()
      .then(() => options.onNotifications(trusted))
      .catch((error) => console.error("notification handler failed", error));
  }
  return new Response(null, { status: 202 });
}
