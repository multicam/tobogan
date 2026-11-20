import type { MessageView } from "./state.ts";

/** The read filters `/threads`, `/events` and `/tasks` share. All of them must match. */
export type Filter = {
  channel?: { path: string; subtree: boolean };
  re?: string;
  by?: string;
  /** Actor IDs and handles a message's text must mention one of. */
  mentions?: { ids: string[]; handles: string[] };
  /** `[key, null]` has the key; `[key, values]` has one of the values. */
  labels?: [string, string[] | null][];
  from?: string;
  text?: string;
};

/** `www` is that channel; `www/` is it and every channel under it. */
export function channelFilter(value: string): { path: string; subtree: boolean } {
  return value.endsWith("/") ? { path: value.slice(0, -1), subtree: true } : { path: value, subtree: false };
}

export function inChannel(channel: string, filter: Filter["channel"]): boolean {
  if (!filter) {
    return true;
  }
  return channel === filter.path || (filter.subtree && channel.startsWith(`${filter.path}/`));
}

/** `key`, `key=value`, or `key=a|b`. */
export function parseLabelFilter(value: string): [string, string[] | null] {
  const at = value.indexOf("=");
  return at === -1 ? [value, null] : [value.slice(0, at), value.slice(at + 1).split("|")];
}

function labelled(labels: Record<string, string>, key: string, values: string[] | null): boolean {
  if (!Object.hasOwn(labels, key)) {
    return false;
  }
  return values === null || values.includes(labels[key]!);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `message` (with its thread's `root`, which label filters also read) matches. */
export function matches(message: MessageView, root: MessageView | null, filter: Filter): boolean {
  if (!inChannel(message.channel, filter.channel)) {
    return false;
  }
  if (filter.re !== undefined && message.thread !== filter.re) {
    return false;
  }
  if (filter.by !== undefined) {
    const by = filter.by.toLowerCase();
    if (message.by.actor.toLowerCase() !== by && message.author?.handle.toLowerCase() !== by) {
      return false;
    }
  }
  if (filter.from !== undefined && filter.from !== "board") {
    return false;
  }
  if (filter.text !== undefined && !message.text.toLowerCase().includes(filter.text.toLowerCase())) {
    return false;
  }
  if (filter.mentions) {
    const { ids, handles } = filter.mentions;
    const byId = ids.some((id) => message.text.includes(`@[${id}]`));
    const byHandle = handles.some((h) => new RegExp(`(^|[^\\w@])@${escape(h)}(?![\\w/-])`, "i").test(message.text));
    if (!byId && !byHandle) {
      return false;
    }
  }
  for (const [key, values] of filter.labels ?? []) {
    if (!labelled(message.labels, key, values) && !(root && labelled(root.labels, key, values))) {
      return false;
    }
  }
  return true;
}

export function isEmpty(filter: Filter): boolean {
  return Object.values(filter).every((v) => v === undefined || (Array.isArray(v) && v.length === 0));
}
