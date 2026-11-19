import { GraphError, seg, type GraphClient, type GraphPage } from "./graph-client";
import { assertId, assertValidFileName } from "./names";

export interface DriveRef {
  siteId: string;
  driveId: string;
}

export interface DriveItemSummary {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  isFolder: boolean;
  childCount?: number;
  mimeType?: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: string;
}

export type ConflictBehavior = "fail" | "rename" | "replace";

interface RawDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
}

const ITEM_SELECT = "id,name,size,webUrl,folder,file,lastModifiedDateTime,lastModifiedBy";

/** Fragments must be a multiple of 320 KiB; 16 of them is 5 MiB. */
export const UPLOAD_CHUNK_BYTES = 320 * 1024 * 16;
/** Above this, use an upload session instead of a single PUT. */
export const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

const driveCache = new Map<string, DriveRef>();

/**
 * Resolve a site (and optionally a named document library) to ids.
 * Ids are not user-specific and do not change, so they are cached per process.
 * Prefer configuring the ids directly in production to skip these calls.
 */
export async function resolveDrive(
  graph: GraphClient,
  target: { hostname: string; sitePath: string; libraryName?: string },
): Promise<DriveRef> {
  const key = `${target.hostname}|${target.sitePath}|${target.libraryName ?? ""}`.toLowerCase();
  const cached = driveCache.get(key);
  if (cached) return cached;

  const sitePath = target.sitePath.startsWith("/") ? target.sitePath : `/${target.sitePath}`;
  const site = await graph.request<{ id: string }>("GET", `/sites/${target.hostname}:${sitePath}`, {
    query: { $select: "id" },
  });

  let driveId: string;
  if (target.libraryName) {
    const drives = await graph.getAll<{ id: string; name: string }>(`/sites/${site.id}/drives`, {
      query: { $select: "id,name" },
    });
    const match = drives.find((d) => d.name.toLowerCase() === target.libraryName!.toLowerCase());
    if (!match) throw new GraphError(404, "libraryNotFound", `Document library "${target.libraryName}" not found.`);
    driveId = match.id;
  } else {
    driveId = (await graph.request<{ id: string }>("GET", `/sites/${site.id}/drive`, { query: { $select: "id" } })).id;
  }

  const ref = { siteId: site.id, driveId };
  driveCache.set(key, ref);
  return ref;
}

export function clearDriveCache() {
  driveCache.clear();
}

function itemPath(driveId: string, itemId: string) {
  return itemId === "root" ? `/drives/${seg(driveId)}/root` : `/drives/${seg(driveId)}/items/${seg(assertId(itemId))}`;
}

function childPath(driveId: string, parentId: string, name: string) {
  return `${itemPath(driveId, parentId)}:/${seg(assertValidFileName(name))}:`;
}

function toSummary(item: RawDriveItem): DriveItemSummary {
  return {
    id: item.id,
    name: item.name,
    size: item.size ?? 0,
    webUrl: item.webUrl,
    isFolder: Boolean(item.folder),
    childCount: item.folder?.childCount,
    mimeType: item.file?.mimeType,
    lastModifiedDateTime: item.lastModifiedDateTime,
    lastModifiedBy: item.lastModifiedBy?.user?.displayName,
  };
}

/** One page of a folder. Pass `cursor` (the previous page's nextLink) to continue. */
export async function listChildren(
  graph: GraphClient,
  driveId: string,
  folderId = "root",
  options: { cursor?: string; pageSize?: number } = {},
): Promise<GraphPage<DriveItemSummary>> {
  const page = options.cursor
    ? await graph.getPage<RawDriveItem>(options.cursor)
    : await graph.getPage<RawDriveItem>(`${itemPath(driveId, folderId)}/children`, {
        // No $orderby: sorting is unreliable on SharePoint drives, so sort in code.
        query: { $select: ITEM_SELECT, $top: options.pageSize ?? 200 },
      });
  const items = page.items.map(toSummary).sort(
    (a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  return { items, nextLink: page.nextLink };
}

export async function getItem(graph: GraphClient, driveId: string, itemId: string): Promise<DriveItemSummary> {
  return toSummary(await graph.request<RawDriveItem>("GET", itemPath(driveId, itemId), { query: { $select: ITEM_SELECT } }));
}

export async function createFolder(
  graph: GraphClient,
  driveId: string,
  parentId: string,
  name: string,
  conflictBehavior: ConflictBehavior = "fail",
): Promise<DriveItemSummary> {
  const created = await graph.request<RawDriveItem>("POST", `${itemPath(driveId, parentId)}/children`, {
    json: { name: assertValidFileName(name), folder: {}, "@microsoft.graph.conflictBehavior": conflictBehavior },
  });
  return toSummary(created);
}

/** Short-lived, read-only embeddable preview URL. */
export async function getPreviewUrl(graph: GraphClient, driveId: string, itemId: string): Promise<string> {
  const preview = await graph.request<{ getUrl?: string }>("POST", `${itemPath(driveId, itemId)}/preview`, { json: {} });
  if (!preview?.getUrl) throw new GraphError(502, "noPreview", "Graph returned no preview URL for this item.");
  return preview.getUrl;
}

/** Single-request upload for small files. */
export async function uploadSmall(
  graph: GraphClient,
  driveId: string,
  parentId: string,
  name: string,
  bytes: Uint8Array,
  options: { conflictBehavior?: ConflictBehavior; contentType?: string } = {},
): Promise<DriveItemSummary> {
  if (bytes.byteLength > SIMPLE_UPLOAD_MAX_BYTES) {
    throw new GraphError(413, "tooLargeForSimpleUpload", "Use uploadLarge for files over 4 MiB.");
  }
  const item = await graph.request<RawDriveItem>("PUT", `${childPath(driveId, parentId, name)}/content`, {
    query: { "@microsoft.graph.conflictBehavior": options.conflictBehavior ?? "fail" },
    body: bytes,
    contentType: options.contentType ?? "application/octet-stream",
  });
  return toSummary(item);
}

export interface UploadLargeOptions {
  conflictBehavior?: ConflictBehavior;
  fetch?: typeof fetch;
  maxChunkRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

/**
 * Resumable upload through an upload session. Streams: only one chunk
 * (5 MiB) is held in memory regardless of file size.
 */
export async function uploadLarge(
  graph: GraphClient,
  driveId: string,
  parentId: string,
  name: string,
  source: AsyncIterable<Uint8Array>,
  totalBytes: number,
  options: UploadLargeOptions = {},
): Promise<DriveItemSummary> {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw new GraphError(400, "invalidSize", "Upload sessions need the exact, non-zero file size.");
  }
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = options.maxChunkRetries ?? 5;

  const session = await graph.request<{ uploadUrl: string }>(
    "POST",
    `${childPath(driveId, parentId, name)}/createUploadSession`,
    { json: { item: { "@microsoft.graph.conflictBehavior": options.conflictBehavior ?? "fail" } } },
  );
  const uploadUrl = session.uploadUrl;

  // The upload URL is pre-authenticated: no Authorization header on these calls.
  async function putChunk(chunk: Uint8Array, start: number): Promise<RawDriveItem | undefined> {
    const end = start + chunk.byteLength - 1;
    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined;
      try {
        response = await doFetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${start}-${end}/${totalBytes}` },
          body: chunk as BodyInit,
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted || attempt >= maxRetries) throw error;
      }

      if (response) {
        if (response.status === 200 || response.status === 201) return (await response.json()) as RawDriveItem;
        if (response.status === 202) {
          await response.body?.cancel();
          return undefined;
        }
        if (response.status === 416) {
          // Fragment already received (e.g. a retry after a lost response).
          await response.body?.cancel();
          const status = await doFetch(uploadUrl, { method: "GET", signal: options.signal });
          const info = (await status.json().catch(() => ({}))) as { nextExpectedRanges?: string[] };
          const nextStart = Number(info.nextExpectedRanges?.[0]?.split("-")[0]);
          if (Number.isFinite(nextStart) && nextStart > end) return undefined;
        }
        const retryable = response.status === 429 || response.status >= 500 || response.status === 416;
        if (!retryable || attempt >= maxRetries) {
          const text = await response.text().catch(() => "");
          throw new GraphError(response.status, "uploadFailed", `Upload failed at byte ${start}: ${text.slice(0, 300)}`);
        }
        await response.body?.cancel();
      }
      await sleep(Math.min(1_000 * 2 ** attempt, 30_000));
    }
  }

  try {
    let buffer = new Uint8Array(UPLOAD_CHUNK_BYTES);
    let filled = 0;
    let sent = 0;
    let done: RawDriveItem | undefined;

    const flush = async () => {
      done = await putChunk(buffer.subarray(0, filled), sent);
      sent += filled;
      filled = 0;
      buffer = new Uint8Array(UPLOAD_CHUNK_BYTES);
      options.onProgress?.(sent, totalBytes);
    };

    for await (const piece of source) {
      let offset = 0;
      while (offset < piece.byteLength) {
        const take = Math.min(UPLOAD_CHUNK_BYTES - filled, piece.byteLength - offset);
        buffer.set(piece.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (sent + filled > totalBytes) throw new GraphError(400, "sizeMismatch", "Stream is longer than the declared size.");
        // Every fragment except the last must be a full multiple of 320 KiB.
        if (filled === UPLOAD_CHUNK_BYTES && sent + filled < totalBytes) await flush();
      }
    }
    if (sent + filled !== totalBytes) throw new GraphError(400, "sizeMismatch", "Stream is shorter than the declared size.");
    if (filled > 0) await flush();
    if (!done) throw new GraphError(502, "uploadIncomplete", "Upload session did not return the created item.");
    return toSummary(done);
  } catch (error) {
    // Free the reserved name; ignore failures, the session expires on its own.
    await doFetch(uploadUrl, { method: "DELETE" }).then((r) => r.body?.cancel()).catch(() => undefined);
    throw error;
  }
}

/** Picks single PUT or upload session by size. */
export async function upload(
  graph: GraphClient,
  driveId: string,
  parentId: string,
  name: string,
  bytes: Uint8Array,
  options: UploadLargeOptions = {},
): Promise<DriveItemSummary> {
  if (bytes.byteLength <= SIMPLE_UPLOAD_MAX_BYTES) return uploadSmall(graph, driveId, parentId, name, bytes, options);
  async function* once() {
    yield bytes;
  }
  return uploadLarge(graph, driveId, parentId, name, once(), bytes.byteLength, options);
}

/** Create a document by copying a template that lives in the same drive. */
export async function createFromTemplate(
  graph: GraphClient,
  driveId: string,
  templateItemId: string,
  parentId: string,
  name: string,
): Promise<void> {
  // 202 Accepted: the copy runs asynchronously on the service side.
  await graph.request("POST", `${itemPath(driveId, templateItemId)}/copy`, {
    query: { "@microsoft.graph.conflictBehavior": "fail" },
    json: { parentReference: { driveId, id: parentId === "root" ? undefined : assertId(parentId), path: parentId === "root" ? "/drive/root:" : undefined }, name: assertValidFileName(name) },
    responseType: "none",
  });
}

export async function deleteItem(graph: GraphClient, driveId: string, itemId: string): Promise<void> {
  if (itemId === "root") throw new GraphError(400, "invalidRequest", "Refusing to delete the drive root.");
  await graph.request("DELETE", itemPath(driveId, itemId), { responseType: "none" });
}
