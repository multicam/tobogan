import { afterEach, describe, expect, it, vi } from "vitest";
import {
  driveDelta,
  handleNotificationRequest,
  mailDelta,
  MAX_SUBSCRIPTION_MINUTES,
  renewSubscription,
  subscribe,
  unsubscribe,
  type Notification,
} from "../lib/m365/changes";
import { GraphError } from "../lib/m365/graph-client";
import { InvalidInputError } from "../lib/m365/names";
import { graphWith, json } from "./helpers";

const NEXT = "https://graph.microsoft.com/v1.0/drives/d1/root/delta?token=page2";
const DELTA = "https://graph.microsoft.com/v1.0/drives/d1/root/delta?token=done";
const OLD = "https://graph.microsoft.com/v1.0/drives/d1/root/delta?token=old";
const SECRET = "0123456789abcdef-secret";

afterEach(() => vi.restoreAllMocks());

describe("driveDelta", () => {
  it("starts with $select, follows nextLink without it, and maps items", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "a", name: "A", folder: {}, parentReference: { id: "root" } }], "@odata.nextLink": NEXT }),
      json({ value: [{ id: "b", deleted: {} }], "@odata.deltaLink": DELTA }),
    ]);
    const result = await driveDelta(graph, "d1");
    expect(result).toEqual({
      changes: [
        { id: "a", name: "A", deleted: false, isFolder: true, parentId: "root" },
        { id: "b", name: undefined, deleted: true, isFolder: false, parentId: undefined },
      ],
      deltaLink: DELTA,
      resynced: false,
    });
    expect(new URL(calls[0]!.url).searchParams.get("$select")).toBe("id,name,deleted,folder,parentReference");
    expect(calls[1]!.url).toBe(NEXT);
  });

  it("resumes from a saved deltaLink without adding the query", async () => {
    const { graph, calls } = graphWith([json({ "@odata.deltaLink": DELTA })]);
    const result = await driveDelta(graph, "d1", OLD);
    expect(result).toEqual({ changes: [], deltaLink: DELTA, resynced: false });
    expect(calls[0]!.url).toBe(OLD);
  });

  it("resyncs from the start when the saved token is gone (410), dropping partial changes", async () => {
    const { graph, calls } = graphWith([
      json({ value: [{ id: "stale" }], "@odata.nextLink": NEXT }),
      json({ error: { code: "resyncRequired", message: "gone" } }, 410),
      json({ value: [{ id: "fresh", name: "F" }], "@odata.deltaLink": DELTA }),
    ]);
    const result = await driveDelta(graph, "d1", OLD);
    expect(result.resynced).toBe(true);
    expect(result.changes.map((c) => c.id)).toEqual(["fresh"]);
    expect(calls[2]!.url).toContain("/drives/d1/root/delta?%24select=");
  });

  it("does not loop when the fresh start itself returns 410", async () => {
    const { graph } = graphWith([json({}, 410), json({ error: { code: "resyncRequired" } }, 410)]);
    await expect(driveDelta(graph, "d1", OLD)).rejects.toMatchObject({ status: 410, code: "resyncRequired" });
  });

  it("surfaces 410 on a first run (no token to drop) and other Graph errors", async () => {
    const first = graphWith([json({ error: { code: "gone" } }, 410)]);
    await expect(driveDelta(first.graph, "d1")).rejects.toMatchObject({ status: 410 });

    const forbidden = graphWith([json({ error: { code: "accessDenied", message: "no" } }, 403)]);
    const error = await driveDelta(forbidden.graph, "d1", OLD).catch((e) => e);
    expect(error).toBeInstanceOf(GraphError);
    expect((error as GraphError).isForbidden).toBe(true);
  });

  it("rejects a page with neither nextLink nor deltaLink", async () => {
    const { graph } = graphWith([json({ value: [] })]);
    await expect(driveDelta(graph, "d1")).rejects.toMatchObject({ status: 502, code: "deltaIncomplete" });
  });

  it("gives up after 10,000 pages", async () => {
    const replies = Array.from({ length: 10_000 }, () => json({ "@odata.nextLink": NEXT }));
    const { graph, calls } = graphWith(replies);
    await expect(driveDelta(graph, "d1")).rejects.toMatchObject({ code: "deltaTooLong" });
    expect(calls).toHaveLength(10_000);
  });
});

describe("mailDelta", () => {
  it("defaults to the inbox with immutable ids and maps removals", async () => {
    const { graph, calls } = graphWith([
      json({
        value: [
          { id: "m1", subject: "Hi", isRead: false, receivedDateTime: "2026-01-01T00:00:00Z" },
          { id: "m2", "@removed": { reason: "deleted" } },
        ],
        "@odata.deltaLink": DELTA,
      }),
    ]);
    const result = await mailDelta(graph);
    expect(calls[0]!.url).toContain("/me/mailFolders/inbox/messages/delta");
    expect(calls[0]!.headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(result.changes).toEqual([
      { id: "m1", removed: false, subject: "Hi", isRead: false, receivedDateTime: "2026-01-01T00:00:00Z" },
      { id: "m2", removed: true, subject: undefined, isRead: undefined, receivedDateTime: undefined },
    ]);
  });

  it("accepts well-known names in any case and validated folder ids", async () => {
    const a = graphWith([json({ "@odata.deltaLink": DELTA })]);
    await mailDelta(a.graph, "SentItems");
    expect(a.calls[0]!.url).toContain("/mailFolders/SentItems/");

    const b = graphWith([json({ "@odata.deltaLink": DELTA })]);
    await mailDelta(b.graph, "AAMk=id");
    expect(b.calls[0]!.url).toContain("/mailFolders/AAMk%3Did/");
  });

  it("rejects folder ids that would escape the path, before calling Graph", () => {
    const { graph, calls } = graphWith([]);
    expect(() => mailDelta(graph, "../users/x")).toThrow(InvalidInputError);
    expect(calls).toHaveLength(0);
  });
});

describe("subscriptions", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("creates a drive subscription on the drive root with the longest lifetime", async () => {
    const { graph, calls } = graphWith([json({ id: "s1", resource: "/drives/d1/root", expirationDateTime: "x" })]);
    const sub = await subscribe(graph, { kind: "drive", driveId: "d1", notificationUrl: "https://app.example/hook", clientState: SECRET, now });
    expect(sub.id).toBe("s1");
    const body = JSON.parse(calls[0]!.body as string);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.get("prefer")).toBeNull();
    expect(body).toMatchObject({
      changeType: "updated",
      resource: "/drives/d1/root",
      clientState: SECRET,
      expirationDateTime: new Date(now + MAX_SUBSCRIPTION_MINUTES.drive * 60_000).toISOString(),
    });
  });

  it("creates a mail subscription with immutable ids and every change type", async () => {
    const { graph, calls } = graphWith([json({ id: "s2" })]);
    await subscribe(graph, {
      kind: "mail",
      notificationUrl: "https://app.example/hook",
      lifecycleNotificationUrl: "https://app.example/life",
      clientState: SECRET,
      now,
    });
    const body = JSON.parse(calls[0]!.body as string);
    expect(calls[0]!.headers.get("prefer")).toBe('IdType="ImmutableId"');
    expect(body).toMatchObject({
      changeType: "created,updated,deleted",
      resource: "/me/mailFolders('inbox')/messages",
      lifecycleNotificationUrl: "https://app.example/life",
      expirationDateTime: new Date(now + MAX_SUBSCRIPTION_MINUTES.mail * 60_000).toISOString(),
    });
  });

  it("defaults the expiry to the current time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { graph, calls } = graphWith([json({ id: "s3" })]);
    await subscribe(graph, { kind: "mail", notificationUrl: "https://app.example/hook", clientState: SECRET });
    expect(JSON.parse(calls[0]!.body as string).expirationDateTime).toBe(
      new Date(now + MAX_SUBSCRIPTION_MINUTES.mail * 60_000).toISOString(),
    );
  });

  it("validates the URL, clientState and drive id before calling Graph", async () => {
    const { graph, calls } = graphWith([]);
    const base = { kind: "drive" as const, driveId: "d1", notificationUrl: "https://app.example/hook", clientState: SECRET };
    await expect(subscribe(graph, { ...base, notificationUrl: "http://app.example/hook" })).rejects.toMatchObject({ code: "invalidUrl" });
    await expect(subscribe(graph, { ...base, clientState: "short" })).rejects.toMatchObject({ code: "invalidClientState" });
    await expect(subscribe(graph, { ...base, clientState: "x".repeat(129) })).rejects.toMatchObject({ code: "invalidClientState" });
    await expect(subscribe(graph, { ...base, driveId: undefined })).rejects.toBeInstanceOf(InvalidInputError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces Graph's refusal of a subscription", async () => {
    const { graph } = graphWith([json({ error: { code: "ValidationError", message: "endpoint did not answer" } }, 400)]);
    await expect(
      subscribe(graph, { kind: "mail", notificationUrl: "https://app.example/hook", clientState: SECRET, now }),
    ).rejects.toMatchObject({ status: 400, code: "ValidationError", message: "endpoint did not answer" });
  });

  it("renews with a new expiry for the subscription kind", async () => {
    const { graph, calls } = graphWith([json({ id: "s1", expirationDateTime: "later" })]);
    expect(await renewSubscription(graph, "s1", "drive", now)).toMatchObject({ id: "s1" });
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/subscriptions/s1");
    expect(JSON.parse(calls[0]!.body as string)).toEqual({
      expirationDateTime: new Date(now + MAX_SUBSCRIPTION_MINUTES.drive * 60_000).toISOString(),
    });
  });

  it("renews relative to now by default and surfaces 404 for a removed subscription", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const ok = graphWith([json({ id: "s1" })]);
    await renewSubscription(ok.graph, "s1", "mail");
    expect(JSON.parse(ok.calls[0]!.body as string).expirationDateTime).toBe(
      new Date(now + MAX_SUBSCRIPTION_MINUTES.mail * 60_000).toISOString(),
    );

    const gone = graphWith([json({ error: { code: "ResourceNotFound" } }, 404)]);
    const error = (await renewSubscription(gone.graph, "s1", "mail").catch((e) => e)) as GraphError;
    expect(error.isNotFound).toBe(true);
  });

  it("deletes a subscription and validates its id", async () => {
    const { graph, calls } = graphWith([new Response(null, { status: 204 })]);
    await expect(unsubscribe(graph, "s1")).resolves.toBeUndefined();
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/subscriptions/s1");
    await expect(unsubscribe(graph, "a/b")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(renewSubscription(graph, "", "mail")).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("handleNotificationRequest", () => {
  const post = (body: string) => new Request("https://app.example/api/graph/notifications", { method: "POST", body });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("echoes the validation token as plain text without calling the handler", async () => {
    const onNotifications = vi.fn();
    const request = new Request("https://app.example/hook?validationToken=abc%20123", { method: "POST" });
    const response = await handleNotificationRequest(request, { clientState: SECRET, onNotifications });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("abc 123");
    expect(onNotifications).not.toHaveBeenCalled();
  });

  it("answers 400 to a body that is not JSON", async () => {
    const response = await handleNotificationRequest(post("not json"), { clientState: SECRET, onNotifications: vi.fn() });
    expect(response.status).toBe(400);
  });

  it("passes on only notifications with the right clientState, stripped of it", async () => {
    const received: Notification[][] = [];
    const body = JSON.stringify({
      value: [
        { subscriptionId: "s1", clientState: SECRET, resource: "r", changeType: "updated", extra: "dropped" },
        { subscriptionId: "s2", clientState: "wrong-but-long-enough!" },
        { subscriptionId: "s3", clientState: `${SECRET.slice(0, -1)}X` },
        { subscriptionId: "s4" },
        { subscriptionId: "s5", clientState: SECRET, lifecycleEvent: "reauthorizationRequired" },
      ],
    });
    const response = await handleNotificationRequest(post(body), { clientState: SECRET, onNotifications: (items) => void received.push(items) });
    expect(response.status).toBe(202);
    await flush();
    expect(received).toEqual([
      [
        { subscriptionId: "s1", resource: "r", changeType: "updated", lifecycleEvent: undefined },
        { subscriptionId: "s5", resource: undefined, changeType: undefined, lifecycleEvent: "reauthorizationRequired" },
      ],
    ]);
  });

  it("answers 202 without calling the handler when nothing is trusted or the payload is empty", async () => {
    const onNotifications = vi.fn();
    expect((await handleNotificationRequest(post("{}"), { clientState: SECRET, onNotifications })).status).toBe(202);
    const forged = JSON.stringify({ value: [{ subscriptionId: "s", clientState: "nope" }] });
    expect((await handleNotificationRequest(post(forged), { clientState: SECRET, onNotifications })).status).toBe(202);
    await flush();
    expect(onNotifications).not.toHaveBeenCalled();
  });

  it("still answers 202 when the handler fails, and logs the failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({ value: [{ subscriptionId: "s1", clientState: SECRET }] });
    const response = await handleNotificationRequest(post(body), {
      clientState: SECRET,
      onNotifications: async () => {
        throw new Error("queue down");
      },
    });
    expect(response.status).toBe(202);
    await flush();
    expect(log).toHaveBeenCalledWith("notification handler failed", expect.objectContaining({ message: "queue down" }));
  });
});
