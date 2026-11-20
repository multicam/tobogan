import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Access, Permission } from "./access.ts";
import {
  BUILT_IN_SCHEMAS,
  canonical,
  checkDefinition,
  checkValue,
  findBlocks,
  type SchemaDefinition,
} from "./blocks.ts";
import { HTTP, HttpError, badRequest, conflict, forbidden, messageNotFound, notFound } from "./errors.ts";
import { inChannel, isEmpty, matches, type Filter } from "./filters.ts";
import {
  OPEN_STATES,
  RESERVED_LABEL_PREFIX,
  State,
  messageId,
  seqOf,
  type Actor,
  type By,
  type FeedEntry,
  type Message,
  type MessageView,
  type Task,
  type TaskState,
} from "./state.ts";
import { StoreConflict, type Store, type StoredEvent } from "./store.ts";

export const TEXT_MAX = 10_000;
const NOTE_MAX = 1000;
const NEEDS_MAX = 20;
const NEEDS_WALK_MAX = 500;
const BATCH_MAX = 100;
const LEASE_MIN_S = 30;
const LEASE_MAX_S = 3600;
const LEASE_DEFAULT_S = 900;
const SCHEMAS_MAX = 500;
const PAGE_DEFAULT = 50;
const CHANNELS_PAGE_DEFAULT = 100;
const FEED_PAGE_MAX = 200;
const EDITED_HOLD = "edited";
const LEASE_HOLD_KIND = "lease_expired";
const LEASE_HOLD_LABEL = "lease_expired";
const HOLD_KIND = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
/** The board's own author, for what its sweeper writes. */
const BOARD_BY: By = { actor: "board:csf", principal: "board:csf", profile: null };

/** Feed events the protocol shows; `HIDDEN` ones only with `all`. Internal ones never. */
const FEED_TYPES = new Set([
  "message.posted", "message.edited", "message.deleted", "reaction.added", "reaction.removed", "labels.changed",
  "channel.created", "actor.seen", "task.created", "task.assigned", "task.needs_changed", "task.ready",
  "task.claimed", "task.renewed", "task.released", "task.expired", "task.completed", "task.failed",
  "task.blocked", "task.unblocked", "task.canceled", "task.reopened",
]);
const HIDDEN = new Set(["actor.seen", "task.renewed"]);

/** Who is calling, as the token and headers say: a principal, written as itself or a profile. */
export type Caller = {
  principal: { id: string; handle: string; name: string };
  actor: Actor;
  profile: string | null;
  access: Access;
};

/** What happens to a claim whose lease runs out: back in the queue, or held for an orchestrator. */
export type ExpiryPolicy = "requeue" | "hold";
export type LeaseConfig = { default?: ExpiryPolicy; byLabel?: Record<string, ExpiryPolicy> };

type NewEvent = { type: string; payload: Record<string, unknown>; meta?: Record<string, unknown> };

/** Events one mutation appends, given seqs as they are added. */
class Writer {
  readonly events: NewEvent[] = [];
  constructor(private readonly head: number) {}

  /** The seq the next added event will get. */
  get next(): number {
    return this.head + this.events.length + 1;
  }

  add(type: string, payload: Record<string, unknown>, meta?: Record<string, unknown>): number {
    const seq = this.next;
    this.events.push({ type, payload, ...(meta ? { meta } : {}) });
    return seq;
  }
}

type Decision<R> = (w: Writer, now: number) => () => R;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const finished = (task: Task) => task.state === "completed" || task.state === "failed" || task.state === "canceled";
const iso = (ms: number) => new Date(ms).toISOString();

function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function checkLease(seconds: number | undefined): void {
  if (seconds !== undefined && !(seconds >= LEASE_MIN_S && seconds <= LEASE_MAX_S)) {
    throw badRequest(`lease: a lease is ${LEASE_MIN_S} to ${LEASE_MAX_S} seconds`);
  }
}

function checkNote(what: string, note: string | undefined): void {
  if (note !== undefined && note.length > NOTE_MAX) {
    throw badRequest(`${what}: a task's ${what} is at most ${NOTE_MAX} characters`);
  }
}

function checkText(text: string): void {
  if (text.length > TEXT_MAX) {
    throw new HttpError(HTTP.badRequest, "text_too_long", `A message's text is at most ${TEXT_MAX.toLocaleString("en-US")} characters.`);
  }
}

function checkLabels(labels: Record<string, string> | undefined, unset: string[] = []): void {
  for (const key of [...Object.keys(labels ?? {}), ...unset]) {
    if (key.startsWith(RESERVED_LABEL_PREFIX)) {
      throw badRequest(`${key}: labels under ${RESERVED_LABEL_PREFIX} are the board's own`, "reserved_label");
    }
  }
}

const HANDLE = "[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?";
const MENTION = new RegExp(`(^|[^\\w@\\[/])@(${HANDLE})(?![\\w/-])`, "gi");
const CODE = /```[\s\S]*?```|`[^`\n]*`/g;

type Mention = { written: string; actor: { id: string; handle: string; name: string } | null; candidates: { id: string; handle: string; name: string }[] };

/**
 * One board: its projections, kept current by folding each commit, and every operation the
 * protocol names. Mutations run one at a time through `mutate`, so each check-then-write is
 * atomic: the check reads the state the write will land on.
 */
export class Board {
  readonly state = new State();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly waiters = new Set<() => void>();
  private sweep: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private unsubscribe: () => void = () => {};

  private constructor(
    private readonly store: Store,
    private readonly leases: LeaseConfig,
    private readonly clock: () => number,
  ) {}

  /** `clock` is for tests, which move time past a lease without waiting for it. */
  static async open(store: Store, leases: LeaseConfig = {}, clock: () => number = Date.now): Promise<Board> {
    const board = new Board(store, leases, clock);
    await store.open();
    for await (const commit of store.read(0)) {
      commit.events.forEach((e) => board.state.apply(e));
    }
    board.unsubscribe = store.subscribe((commit) => board.applied(commit.events));
    board.armSweep();
    return board;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sweep) {
      clearTimeout(this.sweep);
    }
    this.unsubscribe();
    await this.queue.catch(() => {});
    for (const wake of this.waiters) {
      wake();
    }
    await this.store.close();
  }

  // ---- Mutation machinery -------------------------------------------------------------------

  /** Runs `decide` against the current state, appends what it wrote, and answers its result. */
  mutate<R>(decide: Decision<R>): Promise<R> {
    const run = this.queue.then(async () => {
      if (this.closed) {
        throw new HttpError(HTTP.unavailable, "unavailable", "the board is closing");
      }
      const now = this.clock();
      const w = new Writer(this.state.head);
      const done = decide(w, now);
      if (w.events.length > 0) {
        const at = iso(now);
        const events: StoredEvent[] = w.events.map((e, i) => ({ seq: this.state.head + i + 1, at, ...e }));
        try {
          await this.store.append({ events }, this.state.head);
        } catch (error) {
          if (error instanceof StoreConflict) {
            throw new HttpError(HTTP.unavailable, "unavailable", "the board changed while this write checked it: try again");
          }
          throw error;
        }
        this.applied(events);
      }
      return done();
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private applied(events: StoredEvent[]): void {
    events.forEach((e) => this.state.apply(e));
    for (const wake of [...this.waiters]) {
      wake();
    }
    this.armSweep();
  }

  /** Resolves on the next commit, after `ms`, or on abort, whichever comes first. */
  changed(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        signal?.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      this.waiters.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  // ---- Lookups ------------------------------------------------------------------------------

  private find(ref: string): Message | undefined {
    const seq = seqOf(ref);
    return seq === null ? undefined : this.state.messages.get(messageId(seq));
  }

  /** A message the caller may read: a 404 otherwise, as if it weren't there. */
  private readable(caller: Caller, ref: string): Message {
    const m = this.find(ref);
    if (!m || !caller.access.readable(m.channel)) {
      throw messageNotFound(ref);
    }
    return m;
  }

  private require(caller: Caller, permission: Permission, channel: string): void {
    if (!caller.access.can(permission, channel)) {
      throw forbidden(`this caller may not ${permission} in ${channel}`);
    }
  }

  view(m: Message): MessageView {
    return this.state.view(m);
  }

  private repliesOf(root: Message): Message[] {
    return (this.state.replies.get(root.id) ?? []).map((id) => this.state.messages.get(id)!);
  }

  /** An actor.seen when the caller's actor is new or shows differently. */
  private seen(w: Writer, caller: Caller): void {
    const known = this.state.actors.get(caller.actor.id);
    const a = caller.actor;
    if (known && JSON.stringify([known.kind, known.handle, known.name, known.avatar, known.via ?? null]) === JSON.stringify([a.kind, a.handle, a.name, a.avatar, a.via ?? null])) {
      return;
    }
    w.add("actor.seen", { actor: a.id, kind: a.kind, handle: a.handle, name: a.name, avatar: a.avatar, ...(a.via ? { via: a.via } : {}) });
  }

  private by(caller: Caller): By {
    return { actor: caller.actor.id, principal: caller.principal.id, profile: caller.profile };
  }

  /** Every actor the board knows, the caller included. */
  private knownActors(caller: Caller): Actor[] {
    const all = new Map(this.state.actors);
    all.set(caller.actor.id, caller.actor);
    return [...all.values()];
  }

  // ---- Text: mentions and blocks ------------------------------------------------------------

  /** Stores each `@handle` exactly one actor has as `@[actor-id]`; says what became of each. */
  private settle(text: string, caller: Caller): { text: string; mentions: Mention[] } {
    const code: [number, number][] = [...text.matchAll(CODE)].map((m) => [m.index, m.index + m[0].length]);
    const actors = this.knownActors(caller);
    const brief = (a: Actor) => ({ id: a.id, handle: a.handle, name: a.name });
    const mentions = new Map<string, Mention>();
    const settled = text.replace(MENTION, (whole, lead: string, handle: string, offset: number) => {
      if (code.some(([from, to]) => offset >= from && offset < to)) {
        return whole;
      }
      const lower = handle.toLowerCase();
      const exact = actors.filter((a) => a.handle.toLowerCase() === lower);
      const written = `@${handle}`;
      if (exact.length === 1) {
        if (!mentions.has(lower)) {
          mentions.set(lower, { written, actor: brief(exact[0]!), candidates: [] });
        }
        return `${lead}@[${exact[0]!.id}]`;
      }
      const near = exact.length > 1 ? exact : lower.includes("/") ? [] : actors.filter((a) => a.handle.toLowerCase().endsWith(`/${lower}`));
      if (!mentions.has(lower)) {
        mentions.set(lower, { written, actor: null, candidates: near.map(brief) });
      }
      return whole;
    });
    return { text: settled, mentions: [...mentions.values()] };
  }

  /** Refuses text whose blocks don't name a schema the board has, or don't match it. */
  private checkBlocks(text: string): void {
    for (const block of findBlocks(text)) {
      if (block.problem !== undefined || block.name === undefined || block.version === undefined) {
        throw badRequest(block.problem ?? "a block names no schema", "invalid_block");
      }
      const id = `${block.name}@${block.version}`;
      const schema = this.schemaById(id);
      if (!schema) {
        throw badRequest(`${id} isn't a schema this board has`, "schema_not_found");
      }
      const problem = checkValue(schema.schema, block.data);
      if (problem) {
        throw badRequest(`the ${id} block: ${problem}`, "invalid_block");
      }
    }
  }

  // ---- Identity and channels ----------------------------------------------------------------

  me(caller: Caller) {
    const a = caller.actor;
    return {
      actor: a.id,
      principal: caller.principal.id,
      kind: a.kind,
      handle: a.handle,
      name: a.name,
      avatar: a.avatar,
      profile: caller.profile,
      ...(a.via ? { via: a.via } : {}),
      expiresAt: null,
      can: caller.access.summary(),
    };
  }

  actors(caller: Caller) {
    const actors = this.knownActors(caller)
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .map((a) => ({ id: a.id, kind: a.kind, handle: a.handle, name: a.name, avatar: a.avatar, ...(a.via ? { via: a.via } : {}) }));
    return { actors, cursor: String(this.state.head) };
  }

  channels(caller: Caller, q: { prefix?: string; after?: string; limit?: number }) {
    const limit = q.limit ?? CHANNELS_PAGE_DEFAULT;
    const all = [...this.state.channels.values()]
      .filter((c) => caller.access.readable(c.path) && (q.prefix === undefined || c.path.startsWith(q.prefix)))
      .filter((c) => q.after === undefined || c.path > q.after)
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    const page = all.slice(0, limit).map((c) => ({ ...c }));
    return { channels: page, cursor: String(this.state.head), next: all.length > limit ? page.at(-1)!.path : null };
  }

  createChannel(caller: Caller, path: string) {
    return this.mutate((w) => {
      this.require(caller, "read", path);
      this.require(caller, "post", path);
      const existing = this.state.channels.get(path);
      if (existing) {
        return () => ({ status: HTTP.ok as number, body: { channel: { ...existing }, created: false } });
      }
      this.seen(w, caller);
      w.add("channel.created", { channel: path, by: this.by(caller) });
      return () => ({ status: HTTP.created as number, body: { channel: { ...this.state.channels.get(path)! }, created: true } });
    });
  }

  // ---- Messages: reads ----------------------------------------------------------------------

  private cursorOf(ref: string | undefined): number | undefined {
    if (ref === undefined) {
      return undefined;
    }
    const seq = seqOf(ref);
    if (seq === null) {
      throw badRequest(`${ref} isn't a cursor or a message ID on this board`, "invalid_cursor");
    }
    return seq;
  }

  /** One channel's messages, oldest first: the newest `limit`, or the first `limit` after a cursor. */
  channelMessages(caller: Caller, q: { channel: string; after?: string; limit?: number }) {
    const limit = q.limit ?? PAGE_DEFAULT;
    const after = this.cursorOf(q.after);
    const head = this.state.head;
    if (!caller.access.readable(q.channel)) {
      return { messages: [], cursor: String(head) };
    }
    const all = (this.state.byChannel.get(q.channel) ?? []).map((id) => this.state.messages.get(id)!);
    let page: Message[];
    let cursor = head;
    if (after === undefined) {
      page = all.slice(-limit);
    } else {
      const later = all.filter((m) => m.seq > after);
      page = later.slice(0, limit);
      if (later.length > limit) {
        cursor = page.at(-1)!.seq;
      }
    }
    return { messages: page.map((m) => this.view(m)), cursor: String(cursor) };
  }

  /** The thread around any of its messages: its root, and its replies (or a slice of them). */
  thread(caller: Caller, ref: string, q: { after?: string; limit?: number }) {
    const m = this.readable(caller, ref);
    const root = this.state.rootOf(m);
    let replies = this.repliesOf(root);
    if (q.after !== undefined) {
      const from = this.find(q.after);
      if (!from || from.thread !== root.id) {
        throw badRequest(`${q.after} isn't a message in this thread`, "invalid_cursor");
      }
      replies = replies.filter((r) => r.seq > from.seq);
      if (q.limit !== undefined) {
        replies = replies.slice(0, q.limit);
      }
    } else if (q.limit !== undefined) {
      replies = replies.slice(-q.limit);
    }
    return { message: this.view(root), replies: replies.map((r) => this.view(r)), cursor: String(this.state.head), schedules: [] };
  }

  posted(caller: Caller, id: string) {
    const record = this.state.posts.get(id);
    const m = record && record.principal === caller.principal.id ? this.state.messages.get(record.id) : undefined;
    if (!m || !caller.access.readable(m.channel)) {
      throw notFound(`no post of yours has client ID ${id}`, "post_not_found");
    }
    return { message: this.view(m) };
  }

  /** A thread's place in "latest activity" order: its latest live reply, else its root. */
  private activity(root: Message): [number, number] {
    const live = this.repliesOf(root).filter((r) => !r.deleted);
    return [live.at(-1)?.seq ?? root.seq, root.seq];
  }

  private summary(root: Message) {
    const live = this.repliesOf(root).filter((r) => !r.deleted);
    const last = live.at(-1);
    return { message: this.view(root), replies: live.length, last: last ? this.view(last) : null };
  }

  /** Threads with a matching message, by latest activity, newest last. */
  threads(caller: Caller, filter: Filter, q: { after?: string; before?: string; limit?: number }) {
    const limit = q.limit ?? PAGE_DEFAULT;
    const after = this.cursorOf(q.after);
    let before: [number, number] | undefined;
    if (q.before !== undefined) {
      const found = /^(\d+)\.(\d+)$/.exec(q.before);
      if (!found) {
        throw badRequest(`${q.before} isn't a page's older`, "invalid_cursor");
      }
      before = [Number(found[1]), Number(found[2])];
    }
    const found: { root: Message; key: [number, number] }[] = [];
    for (const m of this.state.messages.values()) {
      if (m.re !== null || !caller.access.readable(m.channel) || !inChannel(m.channel, filter.channel)) {
        continue;
      }
      if (filter.re !== undefined && m.id !== filter.re) {
        continue;
      }
      const rootView = this.view(m);
      const hit = matches(rootView, null, filter) || this.repliesOf(m).some((r) => matches(this.view(r), rootView, filter));
      if (hit) {
        found.push({ root: m, key: this.activity(m) });
      }
    }
    const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
    found.sort((a, b) => cmp(a.key, b.key));
    if (after !== undefined) {
      const page = found.filter((t) => t.key[0] > after).slice(0, limit);
      return { threads: page.map((t) => this.summary(t.root)), cursor: String(this.state.head) };
    }
    const pool = before ? found.filter((t) => cmp(t.key, before!) < 0) : found;
    const page = pool.slice(-limit);
    const oldest = page[0];
    const older = oldest && pool.length > page.length ? `${oldest.key[0]}.${oldest.key[1]}` : null;
    return { threads: page.map((t) => this.summary(t.root)), cursor: String(this.state.head), older };
  }

  // ---- Messages: writes ---------------------------------------------------------------------

  /** A client ID's rules: `key:` IDs only as `key:<your principal>:<32 hex>`, and no `sync:` IDs. */
  private checkClientId(caller: Caller, id: string | undefined): void {
    if (id === undefined) {
      return;
    }
    if (id.startsWith("sync:")) {
      throw badRequest("id: sync: IDs are sync's own");
    }
    if (id.startsWith("key:") && !new RegExp(`^key:${caller.principal.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[0-9a-f]{32}$`).test(id)) {
      throw badRequest(`id: key:… IDs derive from a client's key, and this token's are key:${caller.principal.id}:…`);
    }
  }

  post(caller: Caller, body: { channel?: string; re?: string; text: string; labels?: Record<string, string>; noSync?: boolean; id?: string; after?: string }) {
    checkText(body.text);
    checkLabels(body.labels);
    this.checkClientId(caller, body.id);
    return this.mutate((w) => {
      let channel: string;
      let root: Message | null = null;
      let target: Message | null = null;
      if (body.re !== undefined) {
        target = this.readable(caller, body.re);
        root = this.state.rootOf(target);
        channel = root.channel;
      } else {
        channel = body.channel!;
      }
      this.require(caller, "post", channel);
      if (body.labels && Object.keys(body.labels).length > 0) {
        this.require(caller, "label", channel);
      }
      if (body.id !== undefined) {
        const existing = this.state.posts.get(body.id);
        if (existing) {
          if (existing.principal !== caller.principal.id || existing.kind !== "post" || existing.channel !== channel || existing.root !== (root?.id ?? null)) {
            throw conflict("duplicate_id", "that id was already used for a different write");
          }
          const m = this.state.messages.get(existing.id)!;
          return () => ({ message: this.view(m) });
        }
      }
      if (body.after !== undefined && root) {
        const after = this.find(body.after);
        if (!after || after.thread !== root.id) {
          throw badRequest(`after: ${body.after} isn't a message in this thread`, "invalid_after");
        }
        const newest = this.repliesOf(root).at(-1) ?? root;
        if (newest.id !== after.id) {
          throw conflict("newer_message", `${newest.id} came after ${after.id}`);
        }
      }
      this.checkBlocks(body.text);
      const { text, mentions } = this.settle(body.text, caller);
      this.seen(w, caller);
      const id = messageId(w.next);
      w.add(
        "message.posted",
        {
          id,
          channel,
          text,
          re: root?.id ?? null,
          replyTo: target && target.re !== null ? target.id : null,
          thread: root?.id ?? id,
          labels: { ...(body.labels ?? {}) },
          noSync: body.noSync ?? false,
          by: this.by(caller),
          origin: null,
          from: null,
          attachments: [],
          links: [],
        },
        body.id !== undefined ? { clientId: body.id, kind: "post" } : undefined,
      );
      return () => ({ message: this.view(this.state.messages.get(id)!), ...(mentions.length > 0 ? { mentions } : {}) });
    });
  }

  /** Only its author: a profile what that profile wrote; the principal itself what it or any of its profiles wrote. */
  private authorOf(caller: Caller, m: Message): void {
    const own = caller.profile !== null ? m.by.actor === caller.actor.id : m.by.principal === caller.principal.id;
    if (!own) {
      throw forbidden(`${m.id} is someone else's: only its author changes it`);
    }
  }

  /** Whether the caller changes a task as its owner: the profile that made it, or its principal as itself. */
  private ownedBy(task: Task, caller: Caller): boolean {
    return caller.profile !== null ? task.by === caller.actor.id : task.owner === caller.principal.id;
  }

  edit(caller: Caller, ref: string, body: { text: string; revision?: number }) {
    checkText(body.text);
    return this.mutate((w) => {
      const m = this.readable(caller, ref);
      this.require(caller, "post", m.channel);
      this.authorOf(caller, m);
      if (body.revision !== undefined && body.revision !== m.revision) {
        throw conflict("revision_conflict", `${m.id} has been edited or deleted since revision ${body.revision}`);
      }
      if (m.deleted) {
        throw badRequest("message was deleted", "message_deleted");
      }
      this.checkBlocks(body.text);
      const { text, mentions } = this.settle(body.text, caller);
      this.seen(w, caller);
      const by = this.by(caller);
      w.add("message.edited", { id: m.id, thread: m.thread, text, by, from: null });
      const task = m.task;
      if (task && !this.ownedBy(task, caller) && (task.state === "waiting" || task.state === "ready" || task.state === "claimed")) {
        w.add("task.blocked", { id: m.id, thread: m.thread, kind: EDITED_HOLD, reason: `${caller.actor.handle} edited the task's root`, by });
      }
      return () => ({ ok: true, ...(mentions.length > 0 ? { mentions } : {}) });
    });
  }

  delete(caller: Caller, ref: string, body: { revision?: number }) {
    return this.mutate((w) => {
      const m = this.readable(caller, ref);
      this.require(caller, "post", m.channel);
      this.authorOf(caller, m);
      if (body.revision !== undefined && body.revision !== m.revision) {
        throw conflict("revision_conflict", `${m.id} has been edited or deleted since revision ${body.revision}`);
      }
      if (m.deleted) {
        return () => ({ ok: true });
      }
      this.seen(w, caller);
      const by = this.by(caller);
      w.add("message.deleted", { id: m.id, thread: m.thread, by, from: null });
      if (m.task && m.task.state !== "completed" && m.task.state !== "canceled") {
        w.add("task.canceled", { id: m.id, thread: m.thread, reason: "deleted", by });
      }
      return () => ({ ok: true });
    });
  }

  react(caller: Caller, ref: string, body: { emoji: string; remove?: boolean }) {
    return this.mutate((w) => {
      const m = this.readable(caller, ref);
      this.require(caller, "react", m.channel);
      if (m.deleted) {
        throw badRequest("message was deleted", "message_deleted");
      }
      const had = (Object.hasOwn(m.reactions, body.emoji) ? m.reactions[body.emoji]! : []).includes(caller.actor.id);
      if (had !== Boolean(body.remove)) {
        return () => ({ ok: true });
      }
      this.seen(w, caller);
      w.add(body.remove ? "reaction.removed" : "reaction.added", { id: m.id, thread: m.thread, emoji: body.emoji, by: this.by(caller), from: null });
      return () => ({ ok: true });
    });
  }

  label(caller: Caller, ref: string, body: { set?: Record<string, string>; unset?: string[]; if?: Record<string, string | null> }) {
    checkLabels(body.set, body.unset);
    return this.mutate((w) => {
      const m = this.readable(caller, ref);
      this.require(caller, "label", m.channel);
      if (m.deleted) {
        throw badRequest("message was deleted", "message_deleted");
      }
      for (const [key, want] of Object.entries(body.if ?? {})) {
        const has = Object.hasOwn(m.labels, key) ? m.labels[key]! : null;
        if (want === null && has !== null) {
          throw conflict("label_conflict", `${key} is set`);
        }
        if (want !== null && has !== want) {
          throw conflict("label_conflict", `${key} isn't ${want}`);
        }
      }
      this.seen(w, caller);
      w.add("labels.changed", { id: m.id, thread: m.thread, set: { ...(body.set ?? {}) }, unset: [...(body.unset ?? [])], by: this.by(caller) });
      return () => ({ ok: true });
    });
  }

  // ---- Events -------------------------------------------------------------------------------

  private visible(caller: Caller, entry: FeedEntry, filter: Filter, all: boolean): boolean {
    const type = entry.event.type;
    if (!FEED_TYPES.has(type) || (HIDDEN.has(type) && !all)) {
      return false;
    }
    if (!entry.messageId) {
      return isEmpty(filter) && caller.access.atStar("read");
    }
    const message = entry.after ?? entry.before;
    if (!message || !caller.access.readable(message.channel)) {
      return false;
    }
    const rootOf = (view: MessageView) => (view.re === null ? null : entry.root);
    return (entry.before !== null && matches(entry.before, rootOf(entry.before), filter)) || (entry.after !== null && matches(entry.after, rootOf(entry.after), filter));
  }

  private eventView(entry: FeedEntry, message: MessageView | null) {
    const e = entry.event;
    return {
      cursor: String(e.seq),
      type: e.type,
      createdAt: e.at,
      payload: e.payload,
      ...(message ? { message } : {}),
      ...(entry.actor ? { actor: entry.actor } : {}),
    };
  }

  /** The matching events after a cursor (the head when omitted), and the last position examined. */
  events(caller: Caller, filter: Filter, q: { after?: string; all?: boolean }) {
    const head = this.state.head;
    const after = this.cursorOf(q.after) ?? head;
    const out: ReturnType<Board["eventView"]>[] = [];
    let cursor = Math.max(after, 0);
    const feed = this.state.feed;
    for (let i = Math.max(after, 0); i < feed.length; i++) {
      const entry = feed[i]!;
      cursor = entry.event.seq;
      if (this.visible(caller, entry, filter, q.all ?? false)) {
        out.push(this.eventView(entry, entry.after));
        if (out.length >= FEED_PAGE_MAX) {
          break;
        }
      }
    }
    return { events: out, cursor: String(out.length >= FEED_PAGE_MAX ? cursor : Math.max(cursor, head)) };
  }

  /** The feed's newest `last` matching events, oldest first, each with its message as it is now. */
  lastEvents(caller: Caller, filter: Filter, q: { last: number; all?: boolean }) {
    const out: ReturnType<Board["eventView"]>[] = [];
    for (let i = this.state.feed.length - 1; i >= 0 && out.length < q.last; i--) {
      const entry = this.state.feed[i]!;
      if (this.visible(caller, entry, filter, q.all ?? false)) {
        const now = entry.messageId ? this.view(this.state.messages.get(entry.messageId)!) : null;
        out.push(this.eventView(entry, now));
      }
    }
    return { events: out.reverse(), cursor: String(this.state.head) };
  }

  // ---- Schemas ------------------------------------------------------------------------------

  private schemaById(id: string) {
    const builtIn = BUILT_IN_SCHEMAS.find((s) => `${s.name}@${s.version}` === id);
    if (builtIn) {
      return { ...builtIn, builtIn: true, by: null, at: null };
    }
    const own = this.state.schemas.get(id);
    return own ? { ...own, builtIn: false } : undefined;
  }

  private schemaView(s: { name: string; version: number; description: string | null; schema: SchemaDefinition; builtIn: boolean; by: string | null; at: string | null }) {
    return { id: `${s.name}@${s.version}`, name: s.name, version: s.version, description: s.description, schema: s.schema, builtIn: s.builtIn, by: s.by, at: s.at };
  }

  schemas() {
    const own = [...this.state.schemas.values()].sort((a, b) => (a.name === b.name ? a.version - b.version : a.name < b.name ? -1 : 1));
    return {
      schemas: [
        ...BUILT_IN_SCHEMAS.map((s) => this.schemaView({ ...s, builtIn: true, by: null, at: null })),
        ...own.map((s) => this.schemaView({ ...s, builtIn: false })),
      ],
    };
  }

  schema(id: string) {
    if (!/^[a-z][a-z0-9._-]{0,79}@[1-9][0-9]{0,4}$/.test(id)) {
      throw badRequest(`${id} isn't name@version`, "invalid_schema_id");
    }
    const found = this.schemaById(id);
    if (!found) {
      throw notFound(`no schema ${id}`, "schema_not_found");
    }
    return { schema: this.schemaView(found) };
  }

  createSchema(caller: Caller, body: { name: string; version: number; description?: string; schema: SchemaDefinition }) {
    return this.mutate((w) => {
      if (!caller.access.atStar("manage")) {
        throw forbidden("registering a schema needs manage at *");
      }
      if (BUILT_IN_SCHEMAS.some((s) => s.name === body.name)) {
        throw conflict("reserved_schema", `${body.name} is a built-in schema's name`);
      }
      const problem = checkDefinition(body.schema);
      if (problem) {
        throw badRequest(problem, "invalid_schema");
      }
      const id = `${body.name}@${body.version}`;
      const description = body.description ?? null;
      const existing = this.state.schemas.get(id);
      if (existing) {
        if (canonical(existing.schema) !== canonical(body.schema) || existing.description !== description) {
          throw conflict("schema_immutable", `${id} is registered with another definition: register the next version`);
        }
        return () => ({ status: HTTP.ok as number, body: { schema: this.schemaView({ ...existing, builtIn: false }), created: false } });
      }
      if (this.state.schemas.size >= SCHEMAS_MAX) {
        throw badRequest(`a board registers ${SCHEMAS_MAX} schema versions at most`, "too_many_schemas");
      }
      w.add("schema.created", { name: body.name, version: body.version, description, schema: body.schema, by: caller.actor.id });
      return () => ({ status: HTTP.ok as number, body: { schema: this.schemaView({ ...this.state.schemas.get(id)!, builtIn: false }), created: true } });
    });
  }

  // ---- Tasks: helpers -----------------------------------------------------------------------

  private policyOf(root: Message): ExpiryPolicy {
    for (const [filter, policy] of Object.entries(this.leases.byLabel ?? {})) {
      const at = filter.indexOf("=");
      const key = at === -1 ? filter : filter.slice(0, at);
      if (Object.hasOwn(root.labels, key) && (at === -1 || root.labels[key] === filter.slice(at + 1))) {
        return policy;
      }
    }
    return this.leases.default ?? "requeue";
  }

  private lapsed(task: Task, now: number): boolean {
    return task.state === "claimed" && task.claim !== null && Date.parse(task.claim.until) <= now;
  }

  /** A task's state as claims and lists take it: under `requeue`, a lapsed claim is ready. */
  private stateNow(root: Message, now: number): TaskState {
    const task = root.task!;
    return this.lapsed(task, now) && this.policyOf(root) === "requeue" ? "ready" : task.state;
  }

  private taskOf(caller: Caller, ref: string): Message {
    const m = this.readable(caller, ref);
    if (!m.task) {
      throw notFound(`${ref} isn't a task`, "not_a_task");
    }
    return m;
  }

  /** `manage` in its channel, or its owner while it may still post or label there. */
  private owns(caller: Caller, root: Message): void {
    if (caller.access.can("manage", root.channel)) {
      return;
    }
    if (this.ownedBy(root.task!, caller) && (caller.access.can("post", root.channel) || caller.access.can("label", root.channel))) {
      return;
    }
    throw forbidden(`${root.id} is someone else's task: its owner as itself, the profile that made it, or manage in ${root.channel}, changes it`, "task_not_owned");
  }

  /** One of the owner's actors (`<owner>` or `<owner>+<profile>`), or null for anyone. */
  private ownActor(owner: string, actor: string | null | undefined): string | null {
    if (actor === undefined || actor === null) {
      return null;
    }
    if (actor !== owner && !(actor.startsWith(`${owner}+`) && /^[a-z][a-z0-9-]{0,31}$/.test(actor.slice(owner.length + 1)))) {
      throw badRequest(`for: a task is assigned to one of its owner's actors, ${owner}+<profile>, got ${actor}`);
    }
    return actor;
  }

  /** The tasks `refs` name: each a task the caller reads, not `self`, not canceled. */
  private resolveNeeds(caller: Caller, refs: string[] | undefined, self: string | null): { ids: string[]; completed: boolean } {
    const ids: string[] = [];
    for (const ref of refs ?? []) {
      const m = this.find(ref);
      if (m && m.id === self) {
        throw badRequest(`needs: ${ref} is the task itself: it can't wait for itself`, "invalid_needs");
      }
      if (!m?.task || !caller.access.readable(m.channel)) {
        throw badRequest(`needs: ${ref} isn't a task`, "invalid_needs");
      }
      if (m.task.state === "canceled") {
        throw badRequest(`needs: ${ref} was canceled: it can never complete`, "invalid_needs");
      }
      if (!ids.includes(m.id)) {
        ids.push(m.id);
      }
    }
    const completed = ids.every((id) => this.state.messages.get(id)!.task!.state === "completed");
    return { ids, completed };
  }

  /** Refuses prerequisites that would make task `id` wait for itself, through however many tasks. */
  private acyclic(caller: Caller, id: string, added: string[]): void {
    const from = new Map(added.map((need) => [need, need]));
    for (let level = [...added]; level.length > 0; ) {
      const next: string[] = [];
      for (const at of level) {
        const m = this.state.messages.get(at);
        const task = m?.task;
        if (!task || (task.state === "completed" && caller.access.readable(m.channel))) {
          continue;
        }
        for (const need of task.needs) {
          if (need === id) {
            throw badRequest(`needs: ${from.get(at)} waits for ${id} already: they would wait for each other`, "invalid_needs");
          }
          if (!from.has(need)) {
            from.set(need, from.get(at)!);
            next.push(need);
          }
        }
      }
      if (from.size > NEEDS_WALK_MAX) {
        throw badRequest(`needs: more than ${NEEDS_WALK_MAX} tasks behind them: too many to check`, "invalid_needs");
      }
      level = next;
    }
  }

  private satisfied(task: Task, but?: string): boolean {
    return task.needs.filter((id) => id !== but).every((id) => this.state.messages.get(id)?.task?.state === "completed");
  }

  /** Fences a claim's write: the same epoch, its token, and a lease that hasn't run out. */
  private fenced(root: Message, proof: { epoch: number; token: string }, now: number): void {
    const task = root.task!;
    const holds = task.state === "claimed" && task.claim !== null && task.epoch === proof.epoch && Date.parse(task.claim.until) > now && tokenMatches(proof.token, task.claim.token);
    if (!holds) {
      throw conflict("claim_lost", `this claim on ${root.id} is over: claim it again`);
    }
  }

  private assignedTo(task: Task, caller: Caller): boolean {
    return task.for === caller.actor.id && task.owner === caller.principal.id;
  }

  private claimable(root: Message, caller: Caller, now: number): void {
    const task = root.task!;
    const state = this.stateNow(root, now);
    if (state === "waiting") {
      throw conflict("task_waiting", `${root.id} waits for ${task.needs.join(", ")}`);
    }
    if (state === "blocked") {
      throw conflict("task_blocked", `${root.id} is held for a person: ${task.blocked?.reason ?? ""}`);
    }
    if (finished(task)) {
      throw conflict("task_finished", `${root.id} is ${task.state}`);
    }
    if (task.for !== null && !this.assignedTo(task, caller)) {
      throw conflict("task_assigned", `${root.id} is assigned to ${task.for}`);
    }
    if (state === "claimed") {
      throw conflict("task_claimed", `${root.id} is claimed until ${task.claim?.until}`);
    }
  }

  /** A claim's events, expiring a lapsed one first, and the claim the caller gets back once. */
  private claiming(w: Writer, root: Message, caller: Caller, lease: number | undefined, now: number) {
    const task = root.task;
    const epoch = (task?.epoch ?? 0) + 1;
    const until = iso(now + (lease ?? LEASE_DEFAULT_S) * 1000);
    const token = newToken();
    if (task?.state === "claimed") {
      w.add("task.expired", { id: root.id, thread: root.thread, epoch: task.epoch });
    }
    w.add("task.claimed", { id: root.id, thread: root.thread, epoch, until, by: this.by(caller) }, { token: sha256(token) });
    return { epoch, token, until };
  }

  private taskResult(id: string) {
    return { task: this.view(this.state.messages.get(id)!) };
  }

  // ---- Tasks: making them -------------------------------------------------------------------

  createTask(caller: Caller, body: { channel: string; text?: string; labels?: Record<string, string>; noSync?: boolean; needs?: string[]; for?: string | null; claim?: boolean; lease?: number; id?: string }) {
    const text = body.text ?? "";
    checkText(text);
    checkLabels(body.labels);
    checkLease(body.lease);
    this.checkClientId(caller, body.id);
    if (new Set(body.needs ?? []).size > NEEDS_MAX) {
      throw badRequest(`needs: a task waits for at most ${NEEDS_MAX} tasks`);
    }
    return this.mutate((w, now) => {
      const { channel } = body;
      this.require(caller, "post", channel);
      if ((body.labels && Object.keys(body.labels).length > 0) || body.claim) {
        this.require(caller, "label", channel);
      }
      const assigned = this.ownActor(caller.principal.id, body.for);
      if (body.id !== undefined) {
        const existing = this.state.posts.get(body.id);
        if (existing) {
          if (existing.principal !== caller.principal.id || existing.kind !== "task" || existing.channel !== channel) {
            throw conflict("duplicate_id", "that id was already used for a different write");
          }
          return () => this.taskResult(existing.id);
        }
      }
      const needs = this.resolveNeeds(caller, body.needs, null);
      const waits = needs.ids.length > 0 && !needs.completed;
      if (body.claim && waits) {
        throw conflict("task_waiting", `the task would wait for ${needs.ids.join(", ")}: nothing was made`);
      }
      if (body.claim && assigned !== null && assigned !== caller.actor.id) {
        throw conflict("task_assigned", `the task would be assigned to ${assigned}: nothing was made`);
      }
      this.checkBlocks(text);
      const settled = this.settle(text, caller);
      this.seen(w, caller);
      const by = this.by(caller);
      const id = messageId(w.next);
      w.add(
        "message.posted",
        { id, channel, text: settled.text, re: null, replyTo: null, thread: id, labels: { ...(body.labels ?? {}) }, noSync: body.noSync ?? false, by, origin: null, from: null, attachments: [], links: [] },
        body.id !== undefined ? { clientId: body.id, kind: "task" } : { kind: "task" },
      );
      w.add("task.created", { id, thread: id, needs: needs.ids, for: assigned, by });
      if (needs.ids.length > 0 && !waits) {
        w.add("task.ready", { id, thread: id });
      }
      const claim = body.claim ? this.claimingNew(w, id, caller, body.lease, now) : null;
      return () => ({ ...this.taskResult(id), ...(claim ? { claim } : {}), ...(settled.mentions.length > 0 ? { mentions: settled.mentions } : {}) });
    });
  }

  /** The claim a task made with `claim: true` lands with: epoch 1, on a root still being written. */
  private claimingNew(w: Writer, id: string, caller: Caller, lease: number | undefined, now: number) {
    const until = iso(now + (lease ?? LEASE_DEFAULT_S) * 1000);
    const token = newToken();
    w.add("task.claimed", { id, thread: id, epoch: 1, until, by: this.by(caller) }, { token: sha256(token) });
    return { epoch: 1, token, until };
  }

  adoptTask(caller: Caller, body: { re: string; needs?: string[]; for?: string | null; claim?: boolean; lease?: number }) {
    checkLease(body.lease);
    if (new Set(body.needs ?? []).size > NEEDS_MAX) {
      throw badRequest(`needs: a task waits for at most ${NEEDS_MAX} tasks`);
    }
    return this.mutate((w, now) => {
      const m = this.readable(caller, body.re);
      this.require(caller, "label", m.channel);
      const assigned = this.ownActor(caller.principal.id, body.for);
      if (m.re !== null) {
        throw badRequest(`${m.id} is a reply: a task is a thread, so name its root, ${m.re}`);
      }
      if (m.deleted) {
        throw badRequest("message was deleted", "message_deleted");
      }
      if (m.task) {
        throw conflict("already_a_task", `${m.id} is a task already`);
      }
      const needs = this.resolveNeeds(caller, body.needs, m.id);
      const waits = needs.ids.length > 0 && !needs.completed;
      if (body.claim && waits) {
        throw conflict("task_waiting", `${m.id} would wait for ${needs.ids.join(", ")}: it wasn't made a task`);
      }
      if (body.claim && assigned !== null && assigned !== caller.actor.id) {
        throw conflict("task_assigned", `${m.id} would be assigned to ${assigned}: it wasn't made a task`);
      }
      this.seen(w, caller);
      w.add("task.created", { id: m.id, thread: m.thread, needs: needs.ids, for: assigned, by: this.by(caller) });
      if (needs.ids.length > 0 && !waits) {
        w.add("task.ready", { id: m.id, thread: m.thread });
      }
      const claim = body.claim ? this.claimingNew(w, m.id, caller, body.lease, now) : null;
      return () => ({ ...this.taskResult(m.id), ...(claim ? { claim } : {}) });
    });
  }

  createTasks(caller: Caller, body: { channel: string; tasks: { key?: string; text: string; labels?: Record<string, string>; noSync?: boolean; needs?: (string | { key: string })[]; for?: string | null }[]; id?: string; request?: string }) {
    const { channel, tasks } = body;
    if (tasks.length > BATCH_MAX) {
      throw new HttpError(HTTP.badRequest, "batch_too_large", `a batch makes ${BATCH_MAX} tasks at most, and this one has ${tasks.length}: send it in parts`);
    }
    this.checkClientId(caller, body.id);
    const keys = new Map<string, number>();
    tasks.forEach((t, i) => {
      checkText(t.text);
      checkLabels(t.labels);
      if (t.key !== undefined) {
        if (keys.has(t.key)) {
          throw badRequest(`needs: two tasks have the key ${t.key}`, "invalid_needs");
        }
        keys.set(t.key, i);
      }
      if (new Set((t.needs ?? []).map((n) => JSON.stringify(n))).size > NEEDS_MAX) {
        throw badRequest(`tasks.${i}.needs: a task waits for at most ${NEEDS_MAX} tasks`);
      }
    });
    // Within the batch: each key named exists, and no task waits for itself through others.
    const inside = tasks.map((t, i) =>
      (t.needs ?? []).flatMap((n) => {
        if (typeof n === "string") {
          return [];
        }
        const at = keys.get(n.key);
        if (at === undefined) {
          throw badRequest(`needs: no task of the batch has the key ${n.key}`, "invalid_needs");
        }
        if (at === i) {
          throw badRequest(`needs: ${n.key} waits for itself`, "invalid_needs");
        }
        return [at];
      }),
    );
    const visiting = new Set<number>();
    const done = new Set<number>();
    const visit = (i: number): void => {
      if (done.has(i)) {
        return;
      }
      if (visiting.has(i)) {
        throw badRequest("needs: tasks of the batch wait for each other", "invalid_needs");
      }
      visiting.add(i);
      inside[i]!.forEach(visit);
      visiting.delete(i);
      done.add(i);
    };
    tasks.forEach((_, i) => visit(i));
    const digest = body.request ?? sha256(canonical({ channel, tasks }));
    return this.mutate((w) => {
      this.require(caller, "post", channel);
      if (tasks.some((t) => t.labels && Object.keys(t.labels).length > 0)) {
        this.require(caller, "label", channel);
      }
      const assigned = tasks.map((t) => this.ownActor(caller.principal.id, t.for));
      const batchKey = body.id !== undefined ? `${caller.principal.id}\n${body.id}` : null;
      if (batchKey) {
        const existing = this.state.batches.get(batchKey);
        if (existing) {
          if (existing.digest !== digest || existing.channel !== channel) {
            throw conflict("duplicate_id", "that id was already used for another batch");
          }
          return () => ({ tasks: existing.ids.map((id) => this.view(this.state.messages.get(id)!)) });
        }
      }
      const outside = tasks.map((t) => this.resolveNeeds(caller, (t.needs ?? []).filter((n): n is string => typeof n === "string"), null));
      tasks.forEach((t) => this.checkBlocks(t.text));
      this.seen(w, caller);
      const by = this.by(caller);
      const ids = tasks.map((t) => {
        const id = messageId(w.next);
        const settled = this.settle(t.text, caller);
        w.add(
          "message.posted",
          { id, channel, text: settled.text, re: null, replyTo: null, thread: id, labels: { ...(t.labels ?? {}) }, noSync: t.noSync ?? false, by, origin: null, from: null, attachments: [], links: [] },
          { kind: "task" },
        );
        return id;
      });
      ids.forEach((id, i) => {
        const needs = [...outside[i]!.ids, ...inside[i]!.map((at) => ids[at]!)];
        w.add("task.created", { id, thread: id, needs, for: assigned[i], by });
        if (outside[i]!.ids.length > 0 && outside[i]!.completed && inside[i]!.length === 0) {
          w.add("task.ready", { id, thread: id });
        }
      });
      if (batchKey) {
        w.add("tasks.batched", { key: batchKey, principal: caller.principal.id, channel, digest, ids });
      }
      return () => ({ tasks: ids.map((id) => this.view(this.state.messages.get(id)!)) });
    });
  }

  /** The caller's batch under `id`; with `request`, only if it was made for that request. */
  createdTasks(caller: Caller, id: string, request?: string) {
    const batch = this.state.batches.get(`${caller.principal.id}\n${id}`);
    if (!batch) {
      throw notFound(`you made no batch under ${id}`, "batch_not_found");
    }
    if (request !== undefined && request !== batch.digest) {
      throw conflict("duplicate_id", "that id was already used for another batch");
    }
    return { tasks: batch.ids.map((t) => this.view(this.state.messages.get(t)!)) };
  }

  // ---- Tasks: reading -----------------------------------------------------------------------

  /** The principals and actors a handle or an ID names, the value itself included. */
  private named(value: string): Set<string> {
    const out = new Set([value]);
    for (const a of this.state.actors.values()) {
      if (a.handle.toLowerCase() === value.toLowerCase()) {
        out.add(a.id);
        out.add(a.id.split("+")[0]!);
      }
    }
    return out;
  }

  listTasks(caller: Caller, filter: Filter, q: { state?: string; owner?: string; for?: string; needs?: string; after?: string; limit?: number }) {
    const now = this.clock();
    const wanted = q.state ?? "open";
    const limit = q.limit ?? PAGE_DEFAULT;
    const after = this.cursorOf(q.after) ?? 0;
    const owners = q.owner === undefined ? null : this.named(q.owner);
    const assignees = q.for === undefined ? null : this.named(q.for);
    const needed = q.needs === undefined ? null : (this.find(q.needs)?.id ?? null);
    const found: Message[] = [];
    let last = after;
    for (const id of this.state.tasks) {
      const root = this.state.messages.get(id)!;
      if (root.seq <= after || !caller.access.readable(root.channel)) {
        continue;
      }
      const task = root.task!;
      const state = this.stateNow(root, now);
      const stateOk = wanted === "all" || (wanted === "open" ? (OPEN_STATES as readonly string[]).includes(state) : state === wanted);
      const ok =
        stateOk &&
        (owners === null || owners.has(task.owner)) &&
        (assignees === null || (task.for !== null && assignees.has(task.for))) &&
        (q.needs === undefined || (needed !== null && task.needs.includes(needed))) &&
        matches(this.view(root), null, filter);
      if (ok) {
        found.push(root);
        last = root.seq;
        if (found.length === limit) {
          break;
        }
      }
    }
    const cursor = found.length === limit ? last : this.state.head;
    return { tasks: found.map((root) => this.summary(root)), cursor: String(cursor) };
  }

  // ---- Tasks: claims ------------------------------------------------------------------------

  claimTask(caller: Caller, ref: string, lease: number | undefined) {
    checkLease(lease);
    return this.mutate((w, now) => {
      const root = this.taskOf(caller, ref);
      this.require(caller, "label", root.channel);
      this.claimable(root, caller, now);
      this.seen(w, caller);
      const claim = this.claiming(w, root, caller, lease, now);
      return () => ({ ...this.taskResult(root.id), claim });
    });
  }

  /** One attempt at the oldest ready task there the caller takes: assigned to it first, then its principal's (or `from`'s). */
  claimNext(caller: Caller, body: { channel: string; label?: Record<string, string>; from?: string[]; lease?: number }) {
    checkLease(body.lease);
    const subtree = body.channel.endsWith("/");
    const path = subtree ? body.channel.slice(0, -1) : body.channel;
    if (!caller.access.can("label", path)) {
      throw forbidden(`claiming a task needs label in ${path}`);
    }
    const owners = new Set([caller.principal.id]);
    for (const value of body.from ?? []) {
      if (!/^[^\s:]+:\S+$/.test(value)) {
        throw badRequest(`from: ${value} is a handle, which several can share: name the owner by ID`, "invalid_from");
      }
      owners.add(value);
    }
    return this.mutate((w, now) => {
      let mine: Message | null = null;
      let pool: Message | null = null;
      for (const id of this.state.tasks) {
        const root = this.state.messages.get(id)!;
        if (!inChannel(root.channel, { path, subtree }) || !caller.access.can("label", root.channel) || this.stateNow(root, now) !== "ready") {
          continue;
        }
        if (Object.entries(body.label ?? {}).some(([k, v]) => root.labels[k] !== v)) {
          continue;
        }
        const task = root.task!;
        if (this.assignedTo(task, caller)) {
          mine = root;
          break;
        }
        if (task.for === null && pool === null && owners.has(task.owner)) {
          pool = root;
        }
      }
      const root = mine ?? pool;
      if (!root) {
        return () => null;
      }
      this.seen(w, caller);
      const claim = this.claiming(w, root, caller, body.lease, now);
      return () => ({ ...this.taskResult(root.id), claim });
    });
  }

  renewTask(caller: Caller, ref: string, body: { epoch: number; token: string; lease?: number }) {
    checkLease(body.lease);
    return this.mutate((w, now) => {
      const root = this.taskOf(caller, ref);
      this.fenced(root, body, now);
      const until = iso(now + (body.lease ?? LEASE_DEFAULT_S) * 1000);
      w.add("task.renewed", { id: root.id, thread: root.thread, epoch: body.epoch, until, by: this.by(caller) });
      return () => ({ ...this.taskResult(root.id), until });
    });
  }

  /** What ends a claim, by the claim: released, completed, or failed. A completion readies what waited only for it. */
  settleTask(caller: Caller, ref: string, how: "release" | "complete" | "fail", body: { epoch: number; token: string; result?: string; reason?: string }) {
    checkNote("result", body.result);
    checkNote("reason", body.reason);
    return this.mutate((w, now) => {
      const root = this.taskOf(caller, ref);
      this.fenced(root, body, now);
      const about = { id: root.id, thread: root.thread, epoch: body.epoch, by: this.by(caller) };
      if (how === "release") {
        w.add("task.released", about);
      } else if (how === "fail") {
        w.add("task.failed", { ...about, reason: body.reason });
      } else {
        w.add("task.completed", { ...about, result: body.result ?? null });
        for (const id of this.state.tasks) {
          const other = this.state.messages.get(id)!;
          const task = other.task!;
          if (task.state === "waiting" && task.needs.includes(root.id) && this.satisfied(task, root.id)) {
            w.add("task.ready", { id, thread: other.thread });
          }
        }
      }
      return () => this.taskResult(root.id);
    });
  }

  // ---- Tasks: the owner's changes -----------------------------------------------------------

  blockTask(caller: Caller, ref: string, body: { reason: string; kind?: string; epoch?: number; token?: string }) {
    checkNote("reason", body.reason);
    if (body.kind !== undefined && (!HOLD_KIND.test(body.kind) || body.kind === EDITED_HOLD)) {
      throw badRequest("kind: a kind is up to 64 lowercase letters, numbers, and _.-, and edited is the board's own");
    }
    const proof = body.epoch !== undefined && body.token !== undefined ? { epoch: body.epoch, token: body.token } : null;
    return this.mutate((w, now) => {
      const root = this.taskOf(caller, ref);
      if (proof) {
        this.fenced(root, proof, now);
      } else {
        this.owns(caller, root);
        const state = this.stateNow(root, now);
        if (state === "claimed") {
          throw conflict("task_claimed", `${root.id} is claimed: only its claim holds it`);
        }
        if (state === "blocked") {
          throw conflict("task_blocked", `${root.id} is held already`);
        }
        if (finished(root.task!)) {
          throw conflict("task_finished", `${root.id} is ${root.task!.state}`);
        }
      }
      w.add("task.blocked", { id: root.id, thread: root.thread, kind: body.kind ?? null, reason: body.reason, by: this.by(caller) });
      return () => this.taskResult(root.id);
    });
  }

  unblockTask(caller: Caller, ref: string) {
    return this.mutate((w) => {
      const root = this.taskOf(caller, ref);
      this.owns(caller, root);
      const task = root.task!;
      if (finished(task)) {
        throw conflict("task_finished", `${root.id} is ${task.state}`);
      }
      if (task.state !== "blocked") {
        return () => this.taskResult(root.id);
      }
      w.add("task.unblocked", { id: root.id, thread: root.thread, by: this.by(caller) });
      if (task.needs.length > 0 && this.satisfied(task)) {
        w.add("task.ready", { id: root.id, thread: root.thread });
      }
      return () => this.taskResult(root.id);
    });
  }

  reopenTask(caller: Caller, ref: string) {
    return this.mutate((w) => {
      const root = this.taskOf(caller, ref);
      this.owns(caller, root);
      const task = root.task!;
      if (task.state === "completed" || task.state === "canceled") {
        throw conflict("task_finished", `${root.id} is ${task.state}`);
      }
      if (task.state === "failed") {
        w.add("task.reopened", { id: root.id, thread: root.thread, by: this.by(caller) });
      }
      return () => this.taskResult(root.id);
    });
  }

  assignTask(caller: Caller, ref: string, actor: string | null) {
    return this.mutate((w) => {
      const root = this.taskOf(caller, ref);
      this.owns(caller, root);
      const task = root.task!;
      const assigned = this.ownActor(task.owner, actor);
      if (finished(task)) {
        throw conflict("task_finished", `${root.id} is ${task.state}`);
      }
      if (task.for !== assigned) {
        w.add("task.assigned", { id: root.id, thread: root.thread, for: assigned, by: this.by(caller) });
      }
      return () => this.taskResult(root.id);
    });
  }

  setNeeds(caller: Caller, ref: string, refs: string[]) {
    if (new Set(refs).size > NEEDS_MAX) {
      throw badRequest(`needs: a task waits for at most ${NEEDS_MAX} tasks`);
    }
    return this.mutate((w, now) => {
      const root = this.taskOf(caller, ref);
      this.owns(caller, root);
      const task = root.task!;
      if (finished(task)) {
        throw conflict("task_finished", `${root.id} is ${task.state}`);
      }
      const over = this.lapsed(task, now) && this.policyOf(root) === "requeue";
      if (task.state === "claimed" && !over) {
        throw conflict("task_claimed", `${root.id} is claimed: what it needs changes once no one holds it`);
      }
      const needs = this.resolveNeeds(caller, refs, root.id);
      if (needs.ids.length === task.needs.length && needs.ids.every((id) => task.needs.includes(id))) {
        return () => this.taskResult(root.id);
      }
      this.acyclic(caller, root.id, needs.ids.filter((id) => !task.needs.includes(id)));
      if (over) {
        w.add("task.expired", { id: root.id, thread: root.thread, epoch: task.epoch });
      }
      w.add("task.needs_changed", { id: root.id, thread: root.thread, needs: needs.ids, by: this.by(caller) });
      if (needs.ids.length > 0 && needs.completed && task.state !== "blocked") {
        w.add("task.ready", { id: root.id, thread: root.thread });
      }
      return () => this.taskResult(root.id);
    });
  }

  cancelTask(caller: Caller, ref: string, reason: string) {
    checkNote("reason", reason);
    return this.mutate((w) => {
      const root = this.taskOf(caller, ref);
      this.owns(caller, root);
      const task = root.task!;
      if (task.state === "completed" || task.state === "canceled") {
        throw conflict("task_finished", `${root.id} is ${task.state}`);
      }
      w.add("task.canceled", { id: root.id, thread: root.thread, reason, by: this.by(caller) });
      return () => this.taskResult(root.id);
    });
  }

  // ---- Lease sweeper ------------------------------------------------------------------------

  /** Arms one timer for the earliest live claim's lease; when it fires, lapsed claims expire. */
  private armSweep(): void {
    if (this.sweep) {
      clearTimeout(this.sweep);
      this.sweep = null;
    }
    if (this.closed || this.state.claims.size === 0) {
      return;
    }
    const due = Math.min(...this.state.claims.values());
    this.sweep = setTimeout(() => {
      this.sweep = null;
      this.expire().catch((error) => console.error("[csf-board] lease sweep failed:", error));
    }, Math.max(0, due - this.clock()));
  }

  /** Expires every lapsed claim by its policy: back to ready, or held with a `lease_expired` label. */
  expire(): Promise<number> {
    return this.mutate((w, now) => {
      let count = 0;
      for (const id of this.state.claims.keys()) {
        const root = this.state.messages.get(id)!;
        const task = root.task!;
        if (!this.lapsed(task, now)) {
          continue;
        }
        count += 1;
        w.add("task.expired", { id, thread: root.thread, epoch: task.epoch });
        if (this.policyOf(root) === "hold") {
          w.add("task.blocked", { id, thread: root.thread, kind: LEASE_HOLD_KIND, reason: `lease of claim ${task.epoch} ran out`, by: BOARD_BY });
          w.add("labels.changed", { id, thread: root.thread, set: { [LEASE_HOLD_LABEL]: String(task.epoch) }, unset: [], by: BOARD_BY });
        }
      }
      return () => count;
    });
  }
}
