import { describe, expect, test } from "bun:test";
import { callerFor, fakeClock, openBoard, refusal } from "./helpers.ts";

const ada = callerFor("ada");
const bob = callerFor("bob");
const MINUTE = 60_000;

describe("conditions", () => {
  test("a reply's `after` holds only while it names the thread's newest message", async () => {
    const board = await openBoard();
    const { message: root } = await board.post(ada, { channel: "dev", text: "root" });
    const { message: first } = await board.post(ada, { re: root.id, text: "first", after: root.id });
    const stale = await refusal(() => board.post(bob, { re: root.id, text: "late", after: root.id }));
    expect([stale.status, stale.code]).toEqual([409, "newer_message"]);
    const { message: other } = await board.post(ada, { channel: "dev", text: "elsewhere" });
    const foreign = await refusal(() => board.post(bob, { re: root.id, text: "x", after: other.id }));
    expect([foreign.status, foreign.code]).toEqual([400, "invalid_after"]);
    const ok = await board.post(bob, { re: root.id, text: "on time", after: first.id });
    expect(ok.message.re).toBe(root.id);
  });

  test("a deleted reply still counts as the newest for `after`", async () => {
    const board = await openBoard();
    const { message: root } = await board.post(ada, { channel: "dev", text: "root" });
    const { message: reply } = await board.post(ada, { re: root.id, text: "gone soon" });
    await board.delete(ada, reply.id, {});
    const stale = await refusal(() => board.post(ada, { re: root.id, text: "x", after: root.id }));
    expect(stale.code).toBe("newer_message");
  });

  test("an edit or delete with a stale revision is refused, and revision beats deleted", async () => {
    const board = await openBoard();
    const { message } = await board.post(ada, { channel: "dev", text: "v1" });
    await board.label(ada, message.id, { set: { seen: "yes" } });
    const labelled = board.thread(ada, message.id, {}).message;
    expect(labelled.revision).toBe(message.revision);
    await board.edit(ada, message.id, { text: "v2", revision: message.revision });
    const stale = await refusal(() => board.edit(ada, message.id, { text: "v3", revision: message.revision }));
    expect([stale.status, stale.code]).toEqual([409, "revision_conflict"]);
    const current = board.thread(ada, message.id, {}).message;
    expect(current.text).toBe("v2");
    expect(current.editedAt).not.toBeNull();
    await board.delete(ada, message.id, { revision: current.revision });
    const tomb = board.thread(ada, message.id, {}).message;
    expect([tomb.deleted, tomb.text, tomb.labels]).toEqual([true, "", {}]);
    expect((await refusal(() => board.edit(ada, message.id, { text: "x", revision: current.revision }))).code).toBe("revision_conflict");
    expect((await refusal(() => board.edit(ada, message.id, { text: "x", revision: tomb.revision }))).code).toBe("message_deleted");
  });

  test("only a message's author edits it", async () => {
    const board = await openBoard();
    const { message } = await board.post(ada, { channel: "dev", text: "mine" });
    expect((await refusal(() => board.edit(bob, message.id, { text: "yours" }))).status).toBe(403);
    const asProfile = callerFor("ada", { profile: "fixer" });
    expect((await refusal(() => board.edit(asProfile, message.id, { text: "profile" }))).status).toBe(403);
    const { message: byProfile } = await board.post(asProfile, { channel: "dev", text: "by fixer" });
    await board.edit(ada, byProfile.id, { text: "the principal may" });
  });

  test("label `if` takes a value that must match, or null for unset", async () => {
    const board = await openBoard();
    const { message } = await board.post(ada, { channel: "dev", text: "labelled" });
    await board.label(ada, message.id, { set: { owner: "ada" }, if: { owner: null } });
    const taken = await refusal(() => board.label(bob, message.id, { set: { owner: "bob" }, if: { owner: null } }));
    expect([taken.status, taken.code]).toEqual([409, "label_conflict"]);
    const wrong = await refusal(() => board.label(bob, message.id, { set: { owner: "bob" }, if: { owner: "carol" } }));
    expect(wrong.code).toBe("label_conflict");
    await board.label(bob, message.id, { set: { owner: "bob" }, if: { owner: "ada" } });
    expect(board.thread(ada, message.id, {}).message.labels).toEqual({ owner: "bob" });
  });

  test("no caller writes a label under board.", async () => {
    const board = await openBoard();
    const { message } = await board.post(ada, { channel: "dev", text: "x" });
    expect((await refusal(() => board.label(ada, message.id, { set: { "board.task": "ready" } }))).code).toBe("reserved_label");
    expect((await refusal(() => board.label(ada, message.id, { unset: ["board.task"] }))).code).toBe("reserved_label");
    expect((await refusal(() => board.post(ada, { channel: "dev", text: "x", labels: { "board.x": "1" } }))).code).toBe("reserved_label");
  });
});

describe("idempotency", () => {
  test("a client ID posts once, and /posts/:id answers it to its principal only", async () => {
    const board = await openBoard();
    const id = `key:${ada.principal.id}:${"a".repeat(32)}`;
    const first = await board.post(ada, { channel: "dev", text: "once", id });
    const head = board.state.head;
    const again = await board.post(ada, { channel: "dev", text: "once", id });
    expect(again.message.id).toBe(first.message.id);
    expect(board.state.head).toBe(head);
    expect(board.posted(ada, id).message.id).toBe(first.message.id);
    expect((await refusal(() => board.posted(bob, id))).status).toBe(404);
    const elsewhere = await refusal(() => board.post(ada, { channel: "ops", text: "once", id }));
    expect([elsewhere.status, elsewhere.code]).toEqual([409, "duplicate_id"]);
  });

  test("a key: ID is only its own principal's", async () => {
    const board = await openBoard();
    const stolen = await refusal(() => board.post(bob, { channel: "dev", text: "x", id: `key:${ada.principal.id}:${"b".repeat(32)}` }));
    expect(stolen.status).toBe(400);
  });

  test("a batch's id answers the same batch, and another request under it is a 409", async () => {
    const board = await openBoard();
    const tasks = [{ text: "one" }, { text: "two" }];
    const made = await board.createTasks(ada, { channel: "work", tasks, id: "batch-1" });
    const again = await board.createTasks(ada, { channel: "work", tasks, id: "batch-1" });
    expect(again.tasks.map((t) => t.id)).toEqual(made.tasks.map((t) => t.id));
    const other = await refusal(() => board.createTasks(ada, { channel: "work", tasks: [...tasks, { text: "three" }], id: "batch-1" }));
    expect([other.status, other.code]).toEqual([409, "duplicate_id"]);
    // A client asks first, with its digest of the request: another request's digest is a 409 too.
    expect(board.createdTasks(ada, "batch-1").tasks).toHaveLength(2);
    const asked = await refusal(() => board.createdTasks(ada, "batch-1", "someone-elses-digest"));
    expect([asked.status, asked.code]).toEqual([409, "duplicate_id"]);
  });
});

describe("leases and epoch fencing", () => {
  test("a claim's writes need its epoch and token, and a lapsed claim's are refused", async () => {
    const clock = fakeClock();
    const board = await openBoard({ clock });
    const { task } = await board.createTask(ada, { channel: "work", text: "do it" });
    const first = await board.claimTask(ada, task.id, 60);
    expect(first.claim.epoch).toBe(1);
    expect((await refusal(() => board.renewTask(ada, task.id, { epoch: 1, token: "not-the-token" }))).code).toBe("claim_lost");
    await board.renewTask(ada, task.id, { epoch: 1, token: first.claim.token, lease: 60 });
    expect((await refusal(() => board.claimTask(bob, task.id, 60))).code).toBe("task_claimed");
    clock.advance(2 * MINUTE);
    // Under requeue (the default) a lapsed claim is ready: another claim takes it, with the next epoch.
    const second = await board.claimTask(bob, task.id, 60);
    expect(second.claim.epoch).toBe(2);
    const lost = await refusal(() => board.settleTask(ada, task.id, "complete", { epoch: 1, token: first.claim.token }));
    expect([lost.status, lost.code]).toEqual([409, "claim_lost"]);
    await board.settleTask(bob, task.id, "complete", { epoch: 2, token: second.claim.token, result: "done" });
    const done = board.thread(ada, task.id, {}).message;
    expect([done.task?.state, done.task?.result, done.labels["board.task"]]).toEqual(["completed", "done", "completed"]);
  });

  test("a lease is 30 to 3600 seconds", async () => {
    const board = await openBoard();
    const { task } = await board.createTask(ada, { channel: "work", text: "x" });
    expect((await refusal(() => board.claimTask(ada, task.id, 10))).code).toBe("invalid_request");
    expect((await refusal(() => board.claimTask(ada, task.id, 7200))).code).toBe("invalid_request");
  });

  test("the sweeper requeues a lapsed claim by default", async () => {
    const clock = fakeClock();
    const board = await openBoard({ clock });
    const { task } = await board.createTask(ada, { channel: "work", text: "x" });
    await board.claimTask(ada, task.id, 30);
    clock.advance(MINUTE);
    expect(await board.expire()).toBe(1);
    const after = board.thread(ada, task.id, {}).message.task!;
    expect([after.state, after.claim]).toEqual(["ready", null]);
    // Bob takes only his own principal's tasks, or those whose owner `from` names.
    expect(await board.claimNext(bob, { channel: "work" })).toBeNull();
    const next = await board.claimNext(bob, { channel: "work", from: [ada.principal.id] });
    expect(next?.task.id).toBe(task.id);
  });

  test("under hold, a lapsed claim is blocked and labelled lease_expired, not requeued", async () => {
    const clock = fakeClock();
    const board = await openBoard({ clock, leases: { byLabel: { "policy=hold": "hold" } } });
    const { task } = await board.createTask(ada, { channel: "work", text: "x", labels: { policy: "hold" } });
    const { claim } = await board.claimTask(ada, task.id, 30);
    clock.advance(MINUTE);
    // Before the sweep it reads as claimed still: nothing else takes it.
    expect((await refusal(() => board.claimTask(bob, task.id, 30))).code).toBe("task_claimed");
    expect(await board.claimNext(bob, { channel: "work" })).toBeNull();
    expect(await board.expire()).toBe(1);
    const held = board.thread(ada, task.id, {}).message;
    expect(held.task?.state).toBe("blocked");
    expect(held.task?.blocked?.kind).toBe("lease_expired");
    expect(held.labels.lease_expired).toBe("1");
    expect((await refusal(() => board.settleTask(ada, task.id, "complete", { epoch: 1, token: claim.token }))).code).toBe("claim_lost");
    const types = board.state.feed.slice(-3).map((e) => e.event.type);
    expect(types).toEqual(["task.expired", "task.blocked", "labels.changed"]);
  });

  test("claiming the next task takes the oldest ready one with the labels asked for", async () => {
    const board = await openBoard();
    await board.createTask(ada, { channel: "work", text: "untagged" });
    const { task: tagged } = await board.createTask(ada, { channel: "work/sub", text: "tagged", labels: { kind: "build" } });
    expect(await board.claimNext(ada, { channel: "work", label: { kind: "build" } })).toBeNull();
    const got = await board.claimNext(ada, { channel: "work/", label: { kind: "build" } });
    expect(got?.task.id).toBe(tagged.id);
  });
});

describe("needs", () => {
  test("a task waits for its needs and is ready once they complete", async () => {
    const board = await openBoard();
    const { task: first } = await board.createTask(ada, { channel: "work", text: "first" });
    const { task: second } = await board.createTask(ada, { channel: "work", text: "second", needs: [first.id] });
    expect(second.task?.state).toBe("waiting");
    expect((await refusal(() => board.claimTask(ada, second.id, 60))).code).toBe("task_waiting");
    const { claim } = await board.claimTask(ada, first.id, 60);
    await board.settleTask(ada, first.id, "complete", claim);
    expect(board.thread(ada, second.id, {}).message.task?.state).toBe("ready");
  });

  test("needs that would make a task wait for itself are refused", async () => {
    const board = await openBoard();
    const { task: a } = await board.createTask(ada, { channel: "work", text: "a" });
    const { task: b } = await board.createTask(ada, { channel: "work", text: "b", needs: [a.id] });
    const { task: c } = await board.createTask(ada, { channel: "work", text: "c", needs: [b.id] });
    const direct = await refusal(() => board.setNeeds(ada, a.id, [b.id]));
    expect([direct.status, direct.code]).toEqual([400, "invalid_needs"]);
    expect((await refusal(() => board.setNeeds(ada, a.id, [c.id]))).code).toBe("invalid_needs");
    expect((await refusal(() => board.setNeeds(ada, a.id, [a.id]))).code).toBe("invalid_needs");
    const head = board.state.head;
    await board.setNeeds(ada, c.id, [b.id]);
    expect(board.state.head).toBe(head);
  });

  test("a batch's keys can't wait for each other", async () => {
    const board = await openBoard();
    const cycle = await refusal(() =>
      board.createTasks(ada, {
        channel: "work",
        tasks: [
          { key: "x", text: "x", needs: [{ key: "y" }] },
          { key: "y", text: "y", needs: [{ key: "x" }] },
        ],
      }),
    );
    expect(cycle.code).toBe("invalid_needs");
    expect(board.state.head).toBe(0);
  });
});

describe("events", () => {
  test("changed() wakes on a commit and times out without one", async () => {
    const board = await openBoard();
    const started = Date.now();
    await board.changed(150);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    const woken = board.changed(10_000);
    const t0 = Date.now();
    await board.post(ada, { channel: "dev", text: "wake" });
    await woken;
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test("a filtered feed shows an event when the message matched before or after it", async () => {
    const board = await openBoard();
    const start = String(board.state.head);
    const { message } = await board.post(ada, { channel: "dev", text: "x", labels: { status: "open" } });
    await board.label(ada, message.id, { set: { status: "closed" } });
    const open = board.events(ada, { labels: [["status", ["open"]]] }, { after: start });
    expect(open.events.map((e) => e.type)).toEqual(["message.posted", "labels.changed"]);
  });
});
