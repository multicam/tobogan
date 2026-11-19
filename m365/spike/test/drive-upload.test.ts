import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDriveCache,
  createFolder,
  createFromTemplate,
  deleteItem,
  getItem,
  getPreviewUrl,
  listChildren,
  resolveDrive,
  SIMPLE_UPLOAD_MAX_BYTES,
  upload,
  UPLOAD_CHUNK_BYTES,
  uploadLarge,
  uploadSmall,
  waitForCopy,
} from "../lib/m365/drive";
import { GraphError } from "../lib/m365/graph-client";
import { InvalidInputError } from "../lib/m365/names";
import { fakeFetch, graphWith, json } from "./helpers";

const item = (over: object = {}) => ({ id: "i1", name: "a.txt", size: 3, webUrl: "https://x", lastModifiedDateTime: "2026-01-01T00:00:00Z", file: { mimeType: "text/plain" }, ...over });
const SESSION = "https://upload.example/session";
const noSleep = async () => {};

async function* chunks(...pieces: Uint8Array[]) {
  for (const piece of pieces) yield piece;
}

/** Graph client that answers createUploadSession, plus a fake for the pre-authenticated upload URL. */
function session(uploadReplies: Parameters<typeof fakeFetch>[0]) {
  const { graph, calls: graphCalls } = graphWith([json({ uploadUrl: SESSION })]);
  const up = fakeFetch(uploadReplies);
  return { graph, graphCalls, up };
}

beforeEach(() => clearDriveCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resolveDrive", () => {
  it("throws libraryNotFound when no library matches, and does not cache the miss", async () => {
    const { graph, calls } = graphWith([json({ id: "s" }), json({ value: [{ id: "d1", name: "Documents" }] }), json({ id: "s" }), json({ value: [{ id: "d9", name: "Archive" }] })]);
    const target = { hostname: "h", sitePath: "/sites/a", libraryName: "Archive" };
    await expect(resolveDrive(graph, target)).rejects.toMatchObject({ status: 404, code: "libraryNotFound" });
    expect(await resolveDrive(graph, target)).toEqual({ siteId: "s", driveId: "d9" });
    expect(calls).toHaveLength(4);
  });

  it("caches case-insensitively by host, path and library", async () => {
    const { graph, calls } = graphWith([json({ id: "s" }), json({ id: "d" })]);
    await resolveDrive(graph, { hostname: "Contoso.sharepoint.com", sitePath: "/sites/Ops" });
    expect(await resolveDrive(graph, { hostname: "contoso.sharepoint.com", sitePath: "/sites/ops" })).toEqual({ siteId: "s", driveId: "d" });
    expect(calls).toHaveLength(2);
  });

  it("propagates a 403 on the site lookup", async () => {
    const { graph } = graphWith([json({ error: { code: "accessDenied", message: "no" } }, 403)]);
    await expect(resolveDrive(graph, { hostname: "h", sitePath: "s" })).rejects.toMatchObject({ isForbidden: true, code: "accessDenied" });
  });
});

describe("item reads", () => {
  it("getItem maps the summary and fills defaults for missing facets", async () => {
    const { graph, calls } = graphWith([
      json({ id: "i", name: "n", webUrl: "w", lastModifiedDateTime: "t", lastModifiedBy: { user: { displayName: "Ann" } } }),
    ]);
    expect(await getItem(graph, "d", "i")).toEqual({
      id: "i",
      name: "n",
      size: 0,
      webUrl: "w",
      isFolder: false,
      childCount: undefined,
      mimeType: undefined,
      lastModifiedDateTime: "t",
      lastModifiedBy: "Ann",
    });
    expect(calls[0]!.url).toContain("/drives/d/items/i?%24select=");
  });

  it("getItem surfaces 404", async () => {
    const { graph } = graphWith([json({ error: { code: "itemNotFound", message: "gone" } }, 404)]);
    await expect(getItem(graph, "d", "missing")).rejects.toMatchObject({ isNotFound: true });
  });

  it("listChildren follows a cursor and sorts names numerically", async () => {
    const cursor = "https://graph.microsoft.com/v1.0/drives/d/root/children?$skiptoken=2";
    const { graph, calls } = graphWith([json({ value: [item({ name: "file10" }), item({ name: "file9" })] })]);
    const page = await listChildren(graph, "d", "ignored", { cursor });
    expect(page.items.map((i) => i.name)).toEqual(["file9", "file10"]);
    expect(page.nextLink).toBeUndefined();
    expect(calls[0]!.url).toBe(cursor);
  });

  it("listChildren defaults to root with a 200-item page, or the given page size", async () => {
    const { graph, calls } = graphWith([json({ value: [] }), json({ value: [] })]);
    await listChildren(graph, "d");
    await listChildren(graph, "d", "folder", { pageSize: 10 });
    expect(new URL(calls[0]!.url).searchParams.get("$top")).toBe("200");
    expect(calls[0]!.url).toContain("/drives/d/root/children");
    expect(new URL(calls[1]!.url).searchParams.get("$top")).toBe("10");
  });

  it("getPreviewUrl returns the embeddable URL", async () => {
    const { graph, calls } = graphWith([json({ getUrl: "https://preview.example/embed" })]);
    expect(await getPreviewUrl(graph, "d", "i")).toBe("https://preview.example/embed");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/i/preview");
  });

  it("getPreviewUrl fails with noPreview when Graph returns no URL or no body", async () => {
    const { graph } = graphWith([json({}), new Response(null, { status: 200 })]);
    await expect(getPreviewUrl(graph, "d", "i")).rejects.toMatchObject({ status: 502, code: "noPreview" });
    await expect(getPreviewUrl(graph, "d", "i")).rejects.toMatchObject({ code: "noPreview" });
  });
});

describe("folder and delete", () => {
  it("createFolder passes a conflict behaviour and rejects bad names before calling Graph", async () => {
    const { graph, calls } = graphWith([json(item({ folder: { childCount: 0 } }), 201)]);
    const created = await createFolder(graph, "d", "p1", "Folder", "rename");
    expect(created).toMatchObject({ isFolder: true, childCount: 0 });
    expect(JSON.parse(String(calls[0]!.body))["@microsoft.graph.conflictBehavior"]).toBe("rename");
    await expect(createFolder(graph, "d", "p1", "bad:name")).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(1);
  });

  it("createFolder surfaces a 409 name conflict", async () => {
    const { graph } = graphWith([json({ error: { code: "nameAlreadyExists", message: "exists" } }, 409)]);
    await expect(createFolder(graph, "d", "root", "Dup")).rejects.toMatchObject({ isConflict: true, code: "nameAlreadyExists" });
  });

  it("deleteItem sends DELETE and refuses the root", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 204 })]);
    await deleteItem(graph, "d", "i9");
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "https://graph.microsoft.com/v1.0/drives/d/items/i9" });
    await expect(deleteItem(graph, "d", "root")).rejects.toMatchObject({ code: "invalidRequest" });
    expect(calls).toHaveLength(1);
  });
});

describe("uploadSmall and upload", () => {
  it("uploadSmall refuses payloads over 4 MiB without calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(uploadSmall(graph, "d", "root", "a.bin", new Uint8Array(SIMPLE_UPLOAD_MAX_BYTES + 1))).rejects.toMatchObject({
      status: 413,
      code: "tooLargeForSimpleUpload",
    });
    expect(calls).toHaveLength(0);
  });

  it("uploadSmall uses the given conflict behaviour and content type at the root", async () => {
    const { graph, calls } = graphWith([json(item(), 201)]);
    await uploadSmall(graph, "d", "root", "a.txt", new Uint8Array([1]), { conflictBehavior: "replace", contentType: "text/plain" });
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/root:/a.txt:/content?%40microsoft.graph.conflictBehavior=replace");
    expect(calls[0]!.headers.get("content-type")).toBe("text/plain");
  });

  it("upload uses an upload session above 4 MiB", async () => {
    const total = SIMPLE_UPLOAD_MAX_BYTES + 1;
    const { graph, graphCalls, up } = session([json(item({ size: total }), 201)]);
    const result = await upload(graph, "d", "root", "big.bin", new Uint8Array(total), { fetch: up.fetch, conflictBehavior: "replace" });
    expect(result.size).toBe(total);
    expect(graphCalls[0]!.url).toContain("/createUploadSession");
    expect(JSON.parse(String(graphCalls[0]!.body))).toEqual({ item: { "@microsoft.graph.conflictBehavior": "replace" } });
    expect(up.calls[0]!.headers.get("content-range")).toBe(`bytes 0-${total - 1}/${total}`);
  });
});

describe("uploadLarge", () => {
  it.each([0, -1, 1.5, Number.NaN])("rejects a declared size of %s before creating a session", async (size) => {
    const { graph, calls } = graphWith([]);
    await expect(uploadLarge(graph, "d", "root", "x.bin", chunks(), size)).rejects.toMatchObject({ code: "invalidSize" });
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid file name before creating a session", async () => {
    const { graph, calls } = graphWith([]);
    await expect(uploadLarge(graph, "d", "root", "con", chunks(), 1)).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
  });

  it("accepts a 200 on the final fragment", async () => {
    const { graph, up } = session([json(item({ size: 4 }), 200)]);
    expect(await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch })).toMatchObject({ size: 4 });
  });

  it("aborts and deletes the session when the stream is longer than declared", async () => {
    const { graph, up } = session([new Response(null, { status: 204 })]);
    await expect(uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(6), new Uint8Array(6)), 10, { fetch: up.fetch })).rejects.toMatchObject({
      code: "sizeMismatch",
      message: "Stream is longer than the declared size.",
    });
    expect(up.calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("fails with uploadIncomplete when the last fragment returns no item", async () => {
    const { graph, up } = session([new Response(null, { status: 202 }), new Response(null, { status: 204 })]);
    await expect(uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch })).rejects.toMatchObject({ code: "uploadIncomplete" });
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });

  it("does not retry a 4xx fragment error and includes the response text", async () => {
    const { graph, up } = session([new Response("invalid range", { status: 400 }), new Response(null, { status: 204 })]);
    const error = (await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, sleep: noSleep }).catch((e) => e)) as GraphError;
    expect(error).toMatchObject({ status: 400, code: "uploadFailed", message: "Upload failed at byte 0: invalid range" });
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });

  it("retries 429 and 5xx with doubling waits, then gives up after maxChunkRetries", async () => {
    const sleeps: number[] = [];
    const { graph, up } = session([new Response("slow", { status: 429 }), new Response("down", { status: 500 }), new Response("down", { status: 502 }), new Response(null, { status: 204 })]);
    const pending = uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, {
      fetch: up.fetch,
      maxChunkRetries: 2,
      sleep: async (ms) => void sleeps.push(ms),
    });
    await expect(pending).rejects.toMatchObject({ status: 502, code: "uploadFailed" });
    expect(sleeps).toEqual([1000, 2000]);
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "PUT", "PUT", "DELETE"]);
  });

  it("retries a network error on a fragment", async () => {
    const { graph, up } = session([new TypeError("socket hang up"), json(item({ size: 4 }), 201)]);
    expect(await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, sleep: noSleep })).toMatchObject({ size: 4 });
    expect(up.calls).toHaveLength(2);
  });

  it("rethrows a network error once retries are exhausted, even if deleting the session also fails", async () => {
    const { graph, up } = session([new TypeError("socket hang up"), new TypeError("still offline")]);
    await expect(uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, maxChunkRetries: 0 })).rejects.toThrow("socket hang up");
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });

  it("does not retry after the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const { graph, up } = session([new DOMException("aborted", "AbortError"), new Response(null, { status: 204 })]);
    await expect(uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, signal: controller.signal })).rejects.toThrow("aborted");
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
    expect(up.calls[0]!.headers.get("content-length")).toBe("4");
  });

  it("re-sends a fragment after a 416 when the server still expects its bytes", async () => {
    const { graph, up } = session([
      new Response(null, { status: 416 }),
      json({ nextExpectedRanges: ["0-"] }),
      new Response(null, { status: 416 }),
      new Response("not json", { status: 200 }),
      json(item({ size: 4 }), 201),
    ]);
    expect(await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, sleep: noSleep })).toMatchObject({ size: 4 });
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "GET", "PUT", "GET", "PUT"]);
  });

  it("gives up on a 416 at the retry limit with an empty message, and drains the DELETE reply", async () => {
    const { graph, up } = session([
      new Response("already have it", { status: 416 }),
      json({ nextExpectedRanges: ["0-3"] }),
      new Response("deleted", { status: 200 }),
    ]);
    const error = (await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4, { fetch: up.fetch, maxChunkRetries: 0 }).catch((e) => e)) as GraphError;
    // The 416 body was already cancelled, so there is no text left to quote.
    expect(error).toMatchObject({ status: 416, code: "uploadFailed", message: "Upload failed at byte 0: " });
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "GET", "DELETE"]);
  });

  it("uses the global fetch and a real timer by default", async () => {
    vi.useFakeTimers();
    const { graph } = graphWith([json({ uploadUrl: SESSION })]);
    const up = fakeFetch([new Response("busy", { status: 503 }), json(item({ size: 4 }), 201)]);
    vi.stubGlobal("fetch", up.fetch);
    const pending = uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(4)), 4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ size: 4 });
    expect(up.calls).toHaveLength(2);
  });

  it("splits a single large piece into full-size fragments", async () => {
    const total = UPLOAD_CHUNK_BYTES + 1;
    const { graph, up } = session([new Response(null, { status: 202 }), json(item({ size: total }), 201)]);
    const progress: number[] = [];
    await uploadLarge(graph, "d", "root", "x.bin", chunks(new Uint8Array(total)), total, { fetch: up.fetch, onProgress: (n, t) => progress.push(n / t) });
    expect(up.calls.map((c) => c.headers.get("content-length"))).toEqual([String(UPLOAD_CHUNK_BYTES), "1"]);
    expect(progress.at(-1)).toBe(1);
  });
});

describe("copy from template", () => {
  it("copies into a folder by id with conflictBehavior=fail", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 202, headers: { Location: "https://contoso.sharepoint.com/monitor/1" } })]);
    expect(await createFromTemplate(graph, "d", "tpl", "folder1", "Letter.docx")).toBe("https://contoso.sharepoint.com/monitor/1");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/tpl/copy?%40microsoft.graph.conflictBehavior=fail");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ parentReference: { driveId: "d", id: "folder1" }, name: "Letter.docx" });
  });

  it("fails with noMonitor when Graph returns no Location", async () => {
    const { graph } = graphWith([new Response(null, { status: 202 })]);
    await expect(createFromTemplate(graph, "d", "tpl", "root", "Letter.docx")).rejects.toMatchObject({ status: 502, code: "noMonitor" });
  });

  it("rejects bad names and parent ids before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    await expect(createFromTemplate(graph, "d", "tpl", "root", "a/b")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(createFromTemplate(graph, "d", "tpl", "x/y", "ok.docx")).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
  });
});

describe("waitForCopy", () => {
  it("accepts a bare item id once the monitor redirects to the new item", async () => {
    const poll = fakeFetch([json({ id: "new-item" })]);
    expect(await waitForCopy("https://tenant.sharepoint.com/_api/monitor", { fetch: poll.fetch })).toBe("new-item");
    expect(poll.calls[0]!.headers.has("authorization")).toBe(false);
  });

  it("keeps polling through in-progress and unreadable responses at the given interval", async () => {
    const sleeps: number[] = [];
    const poll = fakeFetch([json({ status: "inProgress", resourceId: "early" }), new Response("<html>", { status: 500 }), json({ status: "completed", resourceId: "done" })]);
    expect(await waitForCopy("https://graph.microsoft.com/monitor", { fetch: poll.fetch, intervalMs: 5, sleep: async (ms) => void sleeps.push(ms) })).toBe("done");
    expect(sleeps).toEqual([5, 5]);
  });

  it("uses a default message for a failed copy without detail", async () => {
    const poll = fakeFetch([json({ status: "failed" })]);
    await expect(waitForCopy("https://x.onedrive.com/m", { fetch: poll.fetch })).rejects.toMatchObject({ code: "copyFailed", message: "The copy failed." });
  });

  it("rejects http and look-alike monitor hosts", async () => {
    await expect(waitForCopy("http://contoso.sharepoint.com/m")).rejects.toMatchObject({ code: "invalidMonitor" });
    await expect(waitForCopy("https://sharepoint.com.evil.example/m")).rejects.toMatchObject({ code: "invalidMonitor" });
    await expect(waitForCopy("https://evilsharepoint.com/m")).rejects.toMatchObject({ code: "invalidMonitor" });
  });

  it("uses the global fetch and a 1 s real timer by default", async () => {
    vi.useFakeTimers();
    const poll = fakeFetch([json({ status: "notStarted" }), json({ status: "completed", resourceId: "r" })]);
    vi.stubGlobal("fetch", poll.fetch);
    const pending = waitForCopy("https://contoso.sharepoint.com/m");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe("r");
  });

  it("times out after maxPolls", async () => {
    const poll = fakeFetch([json({ status: "inProgress" }), json({ status: "inProgress" })]);
    await expect(waitForCopy("https://contoso.sharepoint.com/m", { fetch: poll.fetch, maxPolls: 2, sleep: noSleep })).rejects.toMatchObject({
      status: 504,
      code: "copyTimeout",
    });
  });
});
