import { beforeEach, describe, expect, it } from "vitest";
import { clearDriveCache, createFolder, listChildren, resolveDrive, upload, uploadLarge, uploadSmall, UPLOAD_CHUNK_BYTES } from "../lib/m365/drive";
import { assertValidFileName } from "../lib/m365/names";
import { fakeFetch, graphWith, json } from "./helpers";

const item = (over: object = {}) => ({ id: "i1", name: "a.txt", size: 3, webUrl: "https://x", lastModifiedDateTime: "2026-01-01T00:00:00Z", file: {}, ...over });

beforeEach(() => clearDriveCache());

describe("file names", () => {
  it.each(["a/b.txt", "a:b", "x?.doc", " lead", "trail ", "dot.", "CON", "~$temp.docx", "a_vti_b", "", "x".repeat(256)])("rejects %j", (name) => {
    expect(() => assertValidFileName(name)).toThrow();
  });
  it.each(["Report 2026 (final).docx", "übersicht.xlsx", "a#b%c&d.txt"])("accepts %j", (name) => {
    expect(assertValidFileName(name)).toBe(name);
  });
});

describe("resolveDrive", () => {
  it("resolves site then default drive and caches the result", async () => {
    const { graph, calls } = graphWith([json({ id: "site1" }), json({ id: "drive1" })]);
    const target = { hostname: "contoso.sharepoint.com", sitePath: "sites/Ops" };
    expect(await resolveDrive(graph, target)).toEqual({ siteId: "site1", driveId: "drive1" });
    expect(await resolveDrive(graph, target)).toEqual({ siteId: "site1", driveId: "drive1" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("/sites/contoso.sharepoint.com:/sites/Ops?");
  });

  it("finds a named library", async () => {
    const { graph } = graphWith([json({ id: "s" }), json({ value: [{ id: "d1", name: "Documents" }, { id: "d2", name: "Contracts" }] })]);
    const ref = await resolveDrive(graph, { hostname: "h", sitePath: "/sites/a", libraryName: "contracts" });
    expect(ref.driveId).toBe("d2");
  });
});

describe("listChildren", () => {
  it("lists a page, folders first, and exposes the cursor", async () => {
    const next = "https://graph.microsoft.com/v1.0/drives/d/root/children?$skiptoken=1";
    const { graph, calls } = graphWith([
      json({ value: [item({ id: "f2", name: "b.txt" }), item({ id: "d1", name: "Zeta", folder: { childCount: 4 }, file: undefined }), item({ id: "f1", name: "a.txt" })], "@odata.nextLink": next }),
    ]);
    const page = await listChildren(graph, "d", "root");
    expect(page.items.map((i) => i.name)).toEqual(["Zeta", "a.txt", "b.txt"]);
    expect(page.items[0]).toMatchObject({ isFolder: true, childCount: 4 });
    expect(page.nextLink).toBe(next);
    expect(calls[0]!.url).toContain("/drives/d/root/children");
  });

  it("rejects ids that would change the request path", async () => {
    const { graph } = graphWith([]);
    await expect(listChildren(graph, "d", "abc/../../users")).rejects.toThrow("Invalid id");
  });
});

describe("uploads", () => {
  it("small upload never overwrites by default", async () => {
    const { graph, calls } = graphWith([json(item(), 201)]);
    await uploadSmall(graph, "d", "folder1", "a b.txt", new Uint8Array([1, 2, 3]));
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d/items/folder1:/a%20b.txt:/content?%40microsoft.graph.conflictBehavior=fail");
  });

  it("createFolder posts the folder facet", async () => {
    const { graph, calls } = graphWith([json(item({ folder: {} }), 201)]);
    await createFolder(graph, "d", "root", "New");
    expect(JSON.parse(String(calls[0]!.body))).toMatchObject({ name: "New", folder: {}, "@microsoft.graph.conflictBehavior": "fail" });
  });

  it("large upload sends 320 KiB-aligned fragments without the bearer token", async () => {
    const total = UPLOAD_CHUNK_BYTES * 2 + 1234;
    const { graph, calls: graphCalls } = graphWith([json({ uploadUrl: "https://upload.example/session" })]);
    const up = fakeFetch([new Response(null, { status: 202 }), new Response(null, { status: 202 }), json(item({ size: total }), 201)]);

    async function* source() {
      // Odd-sized pieces to exercise re-chunking.
      const piece = new Uint8Array(1_000_003);
      for (let sent = 0; sent < total; sent += piece.byteLength) yield piece.subarray(0, Math.min(piece.byteLength, total - sent));
    }
    const progress: number[] = [];
    const result = await uploadLarge(graph, "d", "root", "big.bin", source(), total, { fetch: up.fetch, onProgress: (n) => progress.push(n) });

    expect(result.size).toBe(total);
    expect(JSON.parse(String(graphCalls[0]!.body))).toEqual({ item: { "@microsoft.graph.conflictBehavior": "fail" } });
    expect(up.calls.map((c) => c.headers.get("content-range"))).toEqual([
      `bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${total}`,
      `bytes ${UPLOAD_CHUNK_BYTES}-${UPLOAD_CHUNK_BYTES * 2 - 1}/${total}`,
      `bytes ${UPLOAD_CHUNK_BYTES * 2}-${total - 1}/${total}`,
    ]);
    expect(UPLOAD_CHUNK_BYTES % (320 * 1024)).toBe(0);
    expect(up.calls.every((c) => !c.headers.has("authorization"))).toBe(true);
    expect(progress.at(-1)).toBe(total);
  });

  it("retries a failed fragment and skips one the server already has", async () => {
    const total = UPLOAD_CHUNK_BYTES + 10;
    const { graph } = graphWith([json({ uploadUrl: "https://upload.example/s" })]);
    const up = fakeFetch([
      new Response("busy", { status: 503 }),
      new Response(null, { status: 416 }),
      json({ nextExpectedRanges: [`${UPLOAD_CHUNK_BYTES}-`] }),
      json(item({ size: total }), 201),
    ]);
    async function* source() {
      yield new Uint8Array(total);
    }
    const result = await uploadLarge(graph, "d", "root", "big.bin", source(), total, { fetch: up.fetch, sleep: async () => {} });
    expect(result.size).toBe(total);
    expect(up.calls.map((c) => c.method)).toEqual(["PUT", "PUT", "GET", "PUT"]);
  });

  it("cancels the session when the stream does not match the declared size", async () => {
    const { graph } = graphWith([json({ uploadUrl: "https://upload.example/s" })]);
    const up = fakeFetch([new Response(null, { status: 204 })]);
    async function* source() {
      yield new Uint8Array(5);
    }
    await expect(uploadLarge(graph, "d", "root", "x.bin", source(), 10, { fetch: up.fetch })).rejects.toMatchObject({ code: "sizeMismatch" });
    expect(up.calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("upload() picks the single PUT for small payloads", async () => {
    const { graph, calls } = graphWith([json(item(), 201)]);
    await upload(graph, "d", "root", "s.txt", new Uint8Array(10), { conflictBehavior: "rename" });
    expect(calls[0]!.url).toContain("conflictBehavior=rename");
  });
});
