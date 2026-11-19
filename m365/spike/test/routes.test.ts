import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as notify } from "../app/api/graph/notifications/route";
import { PUT as upload } from "../app/api/upload/route";
import { clearDriveCache } from "../lib/m365/drive";
import { bearer, dirtySubscriptions, graphJson, graphUrl, libraryRoutes, resetProcessState, routeFetch, signInAs, stubBaseEnv, type Route } from "./next-harness";
import "../auth";

vi.mock("next-auth", () => import("./next-harness").then((m) => m.nextAuthModule));

beforeEach(() => {
  resetProcessState();
  clearDriveCache();
  stubBaseEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/graph/notifications", () => {
  const post = (body: unknown, query = "") =>
    new Request(`https://app.test/api/graph/notifications${query}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

  it("is unavailable until a client state secret is configured", async () => {
    const response = await notify(post({ value: [] }));
    expect(response.status).toBe(503);
  });

  it("echoes the validation token during the subscription handshake", async () => {
    vi.stubEnv("GRAPH_NOTIFICATION_CLIENT_STATE", "s3cret-state");
    const response = await notify(post("", "?validationToken=abc%20123"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("abc 123");
  });

  it("records only notifications carrying the right client state, including lifecycle events", async () => {
    vi.stubEnv("GRAPH_NOTIFICATION_CLIENT_STATE", "s3cret-state");
    const response = await notify(
      post({
        value: [
          { subscriptionId: "sub-1", clientState: "s3cret-state", changeType: "updated" },
          { subscriptionId: "sub-2", clientState: "s3cret-state", lifecycleEvent: "reauthorizationRequired" },
          { subscriptionId: "sub-3", clientState: "wrong" },
          { subscriptionId: "sub-4" },
        ],
      }),
    );
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(dirtySubscriptions()).toEqual(new Set(["sub-1", "sub-2:reauthorizationRequired"])));

    // A second delivery adds to the same set.
    await notify(post({ value: [{ subscriptionId: "sub-5", clientState: "s3cret-state" }] }));
    await vi.waitFor(() => expect(dirtySubscriptions()?.has("sub-5")).toBe(true));
  });

  it("rejects a body that is not JSON", async () => {
    vi.stubEnv("GRAPH_NOTIFICATION_CLIENT_STATE", "s3cret-state");
    expect((await notify(post("{not json"))).status).toBe(400);
    expect(dirtySubscriptions()).toBeUndefined();
  });
});

describe("PUT /api/upload", () => {
  const UPLOAD_URL = "https://contoso.sharepoint.com/_api/upload/session-1";

  function request(options: { name?: string; folderId?: string; body?: Uint8Array | null; size?: string; header?: string | null } = {}) {
    const params = new URLSearchParams();
    if (options.name !== undefined) params.set("name", options.name);
    if (options.folderId !== undefined) params.set("folderId", options.folderId);
    const body = options.body === undefined ? new Uint8Array([1, 2, 3]) : options.body;
    const headers: Record<string, string> = {};
    if (options.header !== null) headers["x-requested-with"] = options.header ?? "fetch";
    if (options.size !== undefined) headers["content-length"] = options.size;
    else if (body) headers["content-length"] = String(body.byteLength);
    return new NextRequest(`https://app.test/api/upload?${params}`, { method: "PUT", headers, body: (body ?? undefined) as BodyInit | undefined });
  }

  const sessionRoutes = (chunk: (body: unknown) => Response): Route[] => [
    ["POST", graphUrl("/drives/drive-1/items/([^/]+):/([^/]+):/createUploadSession"), () => graphJson({ uploadUrl: UPLOAD_URL })],
    ["POST", graphUrl("/drives/drive-1/root:/([^/]+):/createUploadSession"), () => graphJson({ uploadUrl: UPLOAD_URL })],
    ["PUT", new RegExp(`^${UPLOAD_URL}$`), (call) => chunk(call.body)],
    ...libraryRoutes(),
  ];

  const item = { id: "new-1", name: "brief.pdf", size: 3, webUrl: "https://x/brief.pdf", file: { mimeType: "application/pdf" }, lastModifiedDateTime: "2026-01-01T00:00:00Z" };

  it("rejects requests without the fetch marker header (cross-site form posts)", async () => {
    const response = await upload(request({ name: "a.pdf", header: null }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Bad request" });
  });

  it.each([
    ["no body", { body: null }],
    ["a non-numeric length", { size: "abc" }],
    ["a zero length", { size: "0", body: new Uint8Array() }],
  ])("requires an exact Content-Length (%s)", async (_label, options) => {
    const response = await upload(request({ name: "a.pdf", ...options }));
    expect(response.status).toBe(411);
  });

  it("rejects files over 2 GiB before contacting Graph", async () => {
    const { calls } = routeFetch([]);
    const response = await upload(request({ name: "a.pdf", size: String(2 * 1024 ** 3 + 1) }));
    expect(response.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("returns 401 when nobody is signed in", async () => {
    const response = await upload(request({ name: "a.pdf" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign-in required" });
  });

  it("streams the body to an upload session in the root folder and returns the item", async () => {
    await signInAs({ uid: "u1" });
    const chunks: unknown[] = [];
    const { calls } = routeFetch(
      sessionRoutes((body) => {
        chunks.push(body);
        return graphJson(item, 201);
      }),
    );
    const response = await upload(request({ name: "brief.pdf" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "new-1", name: "brief.pdf", isFolder: false, mimeType: "application/pdf" });

    const create = calls.find((c) => c.url.endsWith("/createUploadSession"))!;
    expect(create.url).toContain("/drives/drive-1/root:/brief.pdf:/createUploadSession");
    expect(JSON.parse(String(create.body))).toEqual({ item: { "@microsoft.graph.conflictBehavior": "rename" } });
    expect(bearer(create)).toBe("access-u1");

    // The pre-authenticated upload URL never receives the bearer token.
    const put = calls.find((c) => c.url === UPLOAD_URL)!;
    expect(put.headers.get("authorization")).toBeNull();
    expect(put.headers.get("content-range")).toBe("bytes 0-2/3");
    expect(Array.from(chunks[0] as Uint8Array)).toEqual([1, 2, 3]);
  });

  it("uploads into the given folder", async () => {
    await signInAs({ uid: "u1" });
    const { calls } = routeFetch(sessionRoutes(() => graphJson(item, 201)));
    expect((await upload(request({ name: "brief.pdf", folderId: "m1" }))).status).toBe(201);
    expect(calls.some((c) => c.url.includes("/drives/drive-1/items/m1:/brief.pdf:/createUploadSession"))).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["reserved", "con"],
    ["with a slash", "a/b.pdf"],
  ])("returns 400 for a %s file name", async (_label, name) => {
    await signInAs({ uid: "u1" });
    routeFetch(sessionRoutes(() => graphJson(item, 201)));
    const response = await upload(request({ name }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/^File name/);
  });

  it("passes Graph 4xx errors through with their code", async () => {
    await signInAs({ uid: "u1" });
    routeFetch([
      ["POST", /createUploadSession/, () => graphJson({ error: { code: "nameAlreadyExists", message: "Name taken" } }, 409)],
      ...libraryRoutes(),
    ]);
    const response = await upload(request({ name: "brief.pdf" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Name taken", code: "nameAlreadyExists" });
  });

  it("maps Graph 5xx errors to 502", async () => {
    await signInAs({ uid: "u1" });
    routeFetch([
      ["POST", /createUploadSession/, () => graphJson({ error: { code: "generalException", message: "Boom" } }, 500)],
      ...libraryRoutes(),
    ]);
    const response = await upload(request({ name: "brief.pdf" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Boom", code: "generalException" });
  });

  it("hides unexpected errors behind a 500 and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await signInAs({ uid: "u1" });
    // A malformed 200 from Graph fails JSON parsing: neither a GraphError nor an input error.
    routeFetch([["POST", /createUploadSession/, () => new Response("<html>proxy page</html>", { status: 200 })], ...libraryRoutes()]);
    const response = await upload(request({ name: "brief.pdf" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Upload failed" });
    expect(log).toHaveBeenCalledWith("upload failed", expect.any(SyntaxError));
  });
});
