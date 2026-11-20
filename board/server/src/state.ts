import { blocksIn, type Block, type SchemaDefinition } from "./blocks.ts";
import type { StoredEvent } from "./store.ts";

/**
 * The in-memory projections of one board's log, and the fold that builds them. `apply` is the
 * only writer and never reads the clock, so replaying the log rebuilds exactly what was served.
 */

export const TASK_LABEL = "board.task";
export const RESERVED_LABEL_PREFIX = "board.";
export const OPEN_STATES = ["waiting", "ready", "claimed", "blocked"] as const;
export type TaskState = "waiting" | "ready" | "claimed" | "blocked" | "completed" | "failed" | "canceled";

export type By = { actor: string; principal: string; profile: string | null };
export type Via = { name: string; environment: string | null };
export type Actor = { id: string; kind: string; handle: string; name: string; avatar: string | null; via?: Via };

export type Task = {
  state: TaskState;
  owner: string;
  by: string;
  for: string | null;
  needs: string[];
  epoch: number;
  /** `token` is the claim secret's SHA-256 (hex): views never show it. */
  claim: { actor: string; until: string; token: string } | null;
  blocked: { kind: string | null; reason: string } | null;
  result: string | null;
  reason: string | null;
};

export type Message = {
  id: string;
  seq: number;
  channel: string;
  text: string;
  re: string | null;
  replyTo: string | null;
  thread: string;
  labels: Record<string, string>;
  reactions: Record<string, string[]>;
  by: By;
  noSync: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  task?: Task;
  version: number;
  revision: number;
};

export type TaskView = Omit<Task, "claim"> & { claim: { actor: string; until: string } | null };
export type ActorView = { kind: string; handle: string; name: string; avatar: string | null; via?: Via };
export type MessageView = {
  id: string;
  channel: string;
  text: string;
  re: string | null;
  replyTo: string | null;
  thread: string;
  labels: Record<string, string>;
  reactions: Record<string, string[]>;
  by: By;
  noSync: boolean;
  origin: null;
  from: null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  undelivered: Record<string, string>;
  attachments: never[];
  links: never[];
  task?: TaskView;
  version: number;
  revision: number;
  author: ActorView | null;
  blocks: Block[];
};

export type Channel = { path: string; lastIndex: number; messages: number; threads: number };
export type PostRecord = { id: string; principal: string; channel: string; root: string | null; kind: "post" | "task" };
export type SchemaRecord = { name: string; version: number; description: string | null; schema: SchemaDefinition; by: string; at: string };
export type BatchRecord = { principal: string; channel: string; digest: string; ids: string[] };

/** One event as the feed serves it: the message as it was before and right after it. */
export type FeedEntry = {
  event: StoredEvent;
  messageId: string | null;
  before: MessageView | null;
  after: MessageView | null;
  /** For a reply's event: its root as it was then, which label filters also match. */
  root: MessageView | null;
  actor: (ActorView & { id: string }) | null;
};

export const messageId = (seq: number) => `msg_${seq}`;

/** A cursor or a message ID as a log position, or null for neither. */
export function seqOf(ref: string): number | null {
  const found = /^(?:msg_)?(\d{1,15})$/.exec(ref);
  return found ? Number(found[1]) : null;
}

export function taskView(task: Task): TaskView {
  const { claim, ...rest } = task;
  return {
    ...rest,
    needs: [...task.needs],
    claim: claim ? { actor: claim.actor, until: claim.until } : null,
    blocked: task.blocked ? { kind: task.blocked.kind, reason: task.blocked.reason } : null,
  };
}

export function actorView(actor: Actor): ActorView {
  return { kind: actor.kind, handle: actor.handle, name: actor.name, avatar: actor.avatar, ...(actor.via ? { via: { ...actor.via } } : {}) };
}

export class State {
  head = 0;
  readonly messages = new Map<string, Message>();
  /** Root ID → its replies' IDs, oldest first (deleted ones included). */
  readonly replies = new Map<string, string[]>();
  /** Channel → its messages' IDs, oldest first. */
  readonly byChannel = new Map<string, string[]>();
  readonly channels = new Map<string, Channel>();
  readonly actors = new Map<string, Actor>();
  readonly posts = new Map<string, PostRecord>();
  readonly schemas = new Map<string, SchemaRecord>();
  readonly batches = new Map<string, BatchRecord>();
  /** Task roots in the order they became tasks. */
  readonly tasks: string[] = [];
  /** Live claims: task ID → when the lease runs out (ms). */
  readonly claims = new Map<string, number>();
  readonly feed: FeedEntry[] = [];
  private readonly latest = new Map<string, MessageView>();

  view(m: Message): MessageView {
    const author = this.actors.get(m.by.actor);
    return {
      id: m.id,
      channel: m.channel,
      text: m.text,
      re: m.re,
      replyTo: m.replyTo,
      thread: m.thread,
      labels: { ...m.labels },
      reactions: Object.fromEntries(Object.entries(m.reactions).map(([k, v]) => [k, [...v]])),
      by: { ...m.by },
      noSync: m.noSync,
      origin: null,
      from: null,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      deleted: m.deleted,
      undelivered: {},
      attachments: [],
      links: [],
      ...(m.task ? { task: taskView(m.task) } : {}),
      version: m.version,
      revision: m.revision,
      author: author ? actorView(author) : null,
      blocks: m.deleted ? [] : blocksIn(m.text),
    };
  }

  rootOf(m: Message): Message {
    return m.re ? (this.messages.get(m.re) ?? m) : m;
  }

  /** Folds one committed event in. */
  apply(event: StoredEvent): void {
    if (event.seq !== this.head + 1) {
      throw new Error(`event ${event.seq} applied after ${this.head}`);
    }
    this.head = event.seq;
    const changed = this.fold(event);
    if (changed) {
      changed.version = event.seq;
      if (event.type === "message.posted" || event.type === "message.edited" || event.type === "message.deleted") {
        changed.revision = event.seq;
      }
    }
    this.record(event, changed);
  }

  private record(event: StoredEvent, changed: Message | undefined): void {
    const id = changed?.id ?? (typeof event.payload.id === "string" && this.messages.has(event.payload.id) ? event.payload.id : null);
    const by = event.payload.by as By | undefined;
    const actor = by ? this.actors.get(by.actor) : undefined;
    const entry: FeedEntry = {
      event,
      messageId: id,
      before: null,
      after: null,
      root: null,
      actor: actor ? { id: actor.id, ...actorView(actor) } : null,
    };
    if (id) {
      const message = this.messages.get(id)!;
      entry.before = this.latest.get(id) ?? null;
      entry.after = changed ? this.view(message) : (entry.before ?? this.view(message));
      this.latest.set(id, entry.after);
      if (message.re) {
        entry.root = this.latest.get(message.re) ?? null;
      }
    }
    this.feed.push(entry);
  }

  private fold(event: StoredEvent): Message | undefined {
    const p = event.payload;
    const target = typeof p.id === "string" ? this.messages.get(p.id) : undefined;
    switch (event.type) {
      case "message.posted":
        return this.posted(event);
      case "message.edited":
        if (!target || target.deleted) {
          return undefined;
        }
        target.text = p.text as string;
        target.editedAt = event.at;
        return target;
      case "message.deleted":
        if (!target || target.deleted) {
          return undefined;
        }
        target.deleted = true;
        target.text = "";
        target.labels = {};
        target.reactions = {};
        return target;
      case "reaction.added":
      case "reaction.removed":
        return target && !target.deleted ? this.react(target, event) : undefined;
      case "labels.changed": {
        if (!target || target.deleted) {
          return undefined;
        }
        Object.assign(target.labels, p.set as Record<string, string>);
        for (const key of p.unset as string[]) {
          delete target.labels[key];
        }
        return target;
      }
      case "channel.created":
        this.channel(p.channel as string);
        return undefined;
      case "actor.seen": {
        const { actor, kind, handle, name, avatar, via } = p as Record<string, unknown>;
        this.actors.set(actor as string, {
          id: actor as string,
          kind: kind as string,
          handle: handle as string,
          name: name as string,
          avatar: (avatar as string | null) ?? null,
          ...(via ? { via: via as Via } : {}),
        });
        return undefined;
      }
      case "schema.created": {
        const s = p as { name: string; version: number; description: string | null; schema: SchemaDefinition; by: string };
        this.schemas.set(`${s.name}@${s.version}`, { ...s, at: event.at });
        return undefined;
      }
      case "tasks.batched": {
        const b = p as { key: string } & BatchRecord;
        this.batches.set(b.key, { principal: b.principal, channel: b.channel, digest: b.digest, ids: [...b.ids] });
        return undefined;
      }
      default:
        return event.type.startsWith("task.") && target ? this.taskEvent(target, event) : undefined;
    }
  }

  private channel(path: string): Channel {
    let channel = this.channels.get(path);
    if (!channel) {
      channel = { path, lastIndex: 0, messages: 0, threads: 0 };
      this.channels.set(path, channel);
    }
    return channel;
  }

  private posted(event: StoredEvent): Message {
    const p = event.payload as { id: string; channel: string; text: string; re: string | null; replyTo: string | null; thread: string; labels: Record<string, string>; noSync: boolean; by: By };
    const message: Message = {
      id: p.id,
      seq: event.seq,
      channel: p.channel,
      text: p.text,
      re: p.re,
      replyTo: p.replyTo,
      thread: p.thread,
      labels: { ...p.labels },
      reactions: {},
      by: { ...p.by },
      noSync: p.noSync,
      createdAt: event.at,
      editedAt: null,
      deleted: false,
      version: event.seq,
      revision: event.seq,
    };
    this.messages.set(message.id, message);
    if (message.re) {
      const list = this.replies.get(message.re) ?? [];
      list.push(message.id);
      this.replies.set(message.re, list);
    }
    const ids = this.byChannel.get(message.channel) ?? [];
    ids.push(message.id);
    this.byChannel.set(message.channel, ids);
    const channel = this.channel(message.channel);
    channel.lastIndex = event.seq;
    channel.messages += 1;
    if (!message.re) {
      channel.threads += 1;
    }
    const clientId = event.meta?.clientId;
    if (typeof clientId === "string") {
      this.posts.set(clientId, {
        id: message.id,
        principal: message.by.principal,
        channel: message.channel,
        root: message.re,
        kind: event.meta?.kind === "task" ? "task" : "post",
      });
    }
    return message;
  }

  private react(message: Message, event: StoredEvent): Message | undefined {
    const emoji = event.payload.emoji as string;
    const actor = (event.payload.by as By).actor;
    const had = Object.hasOwn(message.reactions, emoji) ? message.reactions[emoji]! : [];
    if (event.type === "reaction.added") {
      if (had.includes(actor)) {
        return undefined;
      }
      message.reactions[emoji] = [...had, actor];
      return message;
    }
    if (!had.includes(actor)) {
      return undefined;
    }
    const left = had.filter((a) => a !== actor);
    if (left.length > 0) {
      message.reactions[emoji] = left;
    } else {
      delete message.reactions[emoji];
    }
    return message;
  }

  /** A task event, applied only from the states it can leave (the writes checked first). */
  private taskEvent(message: Message, event: StoredEvent): Message | undefined {
    const p = event.payload;
    if (event.type === "task.created") {
      if (message.deleted || message.re !== null || message.task) {
        return undefined;
      }
      const by = p.by as By;
      const needs = p.needs as string[];
      message.task = {
        state: needs.length > 0 ? "waiting" : "ready",
        owner: by.principal,
        by: by.actor,
        for: (p.for as string | null) ?? null,
        needs: [...needs],
        epoch: 0,
        claim: null,
        blocked: null,
        result: null,
        reason: null,
      };
      this.tasks.push(message.id);
      return this.labeled(message);
    }
    const task = message.task;
    if (!task || !foldTask(task, event)) {
      return undefined;
    }
    if (task.state === "claimed" && task.claim) {
      this.claims.set(message.id, Date.parse(task.claim.until));
    } else {
      this.claims.delete(message.id);
    }
    return this.labeled(message);
  }

  private labeled(message: Message): Message {
    if (!message.deleted && message.task) {
      message.labels[TASK_LABEL] = message.task.state;
    }
    return message;
  }
}

const holds = (task: Task, epoch: unknown) => task.state === "claimed" && task.epoch === epoch;

/** The task state machine: whether `event` changed `task`. */
function foldTask(task: Task, event: StoredEvent): boolean {
  const p = event.payload;
  switch (event.type) {
    case "task.assigned":
      task.for = (p.for as string | null) ?? null;
      return true;
    case "task.needs_changed":
      if (task.state !== "waiting" && task.state !== "ready" && task.state !== "blocked") {
        return false;
      }
      task.needs = [...(p.needs as string[])];
      if (task.state !== "blocked") {
        task.state = task.needs.length > 0 ? "waiting" : "ready";
      }
      return true;
    case "task.ready":
      if (task.state !== "waiting") {
        return false;
      }
      task.state = "ready";
      return true;
    case "task.claimed":
      if (task.state !== "ready" || p.epoch !== task.epoch + 1) {
        return false;
      }
      task.state = "claimed";
      task.epoch = p.epoch as number;
      task.claim = { actor: (p.by as By).actor, until: p.until as string, token: event.meta?.token as string };
      return true;
    case "task.renewed":
      if (!holds(task, p.epoch) || !task.claim) {
        return false;
      }
      task.claim.until = p.until as string;
      return true;
    case "task.released":
    case "task.expired":
      if (!holds(task, p.epoch)) {
        return false;
      }
      task.state = "ready";
      task.claim = null;
      return true;
    case "task.completed":
      if (!holds(task, p.epoch)) {
        return false;
      }
      task.state = "completed";
      task.claim = null;
      task.result = (p.result as string | null) ?? null;
      return true;
    case "task.failed":
      if (!holds(task, p.epoch)) {
        return false;
      }
      task.state = "failed";
      task.claim = null;
      task.reason = p.reason as string;
      return true;
    case "task.blocked":
      if (task.state !== "waiting" && task.state !== "ready" && task.state !== "claimed") {
        return false;
      }
      task.state = "blocked";
      task.claim = null;
      task.blocked = { kind: (p.kind as string | null) ?? null, reason: p.reason as string };
      return true;
    case "task.unblocked":
      if (task.state !== "blocked") {
        return false;
      }
      task.state = task.needs.length > 0 ? "waiting" : "ready";
      task.blocked = null;
      return true;
    case "task.canceled":
      if (task.state === "completed" || task.state === "canceled") {
        return false;
      }
      task.state = "canceled";
      task.claim = null;
      task.blocked = null;
      task.reason = p.reason as string;
      return true;
    case "task.reopened":
      if (task.state !== "failed") {
        return false;
      }
      task.state = "ready";
      task.reason = null;
      return true;
    default:
      return false;
  }
}
