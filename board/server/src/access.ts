import { badRequest } from "./errors.ts";

export const PERMISSIONS = ["read", "post", "react", "label", "sync", "manage"] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** The longest `x-board-can` header the board reads (protocol: 4000). */
const CAN_MAX = 4000;
const SEGMENT = "[a-z0-9][a-z0-9_-]*";
const PATTERN = new RegExp(`^(?:\\*|${SEGMENT}(?:/${SEGMENT})*/?)$`);

/** `react`, `label` and `sync` imply `read`; `manage` implies everything. */
function implied(perms: Iterable<Permission>): Set<Permission> {
  const out = new Set<Permission>(perms);
  if (out.has("manage")) {
    return new Set(PERMISSIONS);
  }
  if (out.has("react") || out.has("label") || out.has("sync")) {
    out.add("read");
  }
  return out;
}

const ordered = (perms: Set<Permission>): Permission[] => PERMISSIONS.filter((p) => perms.has(p));

/**
 * What a caller may do, channel by channel. A token's principal has every permission everywhere
 * (ceiling: no grants yet — upgrade trigger: a second person or an agent token that must be
 * confined, BOARD-7); `x-board-can` only narrows it. Under a narrowing the most specific pattern
 * that covers a channel decides: the channel itself, then the longest `prefix/`, then `*`.
 */
export class Access {
  private constructor(private readonly entries: Map<string, Set<Permission>> | null) {}

  static full(): Access {
    return new Access(null);
  }

  /** Parses `dev/=read,post;ci/=read` (or `dev/=all`, or `dev/=` for nothing). */
  static narrowed(header: string): Access {
    if (header.length > CAN_MAX) {
      throw badRequest(`x-board-can is at most ${CAN_MAX} characters`, "invalid_scope");
    }
    const entries = new Map<string, Set<Permission>>();
    for (const raw of header.split(";")) {
      const entry = raw.trim();
      if (entry === "") {
        continue;
      }
      const at = entry.indexOf("=");
      if (at <= 0) {
        throw badRequest(`x-board-can takes pattern=permissions, like dev/=read,post: got ${entry}`, "invalid_scope");
      }
      const pattern = entry.slice(0, at).trim();
      if (!PATTERN.test(pattern)) {
        throw badRequest(`x-board-can: ${pattern} isn't a channel pattern`, "invalid_scope");
      }
      const words = entry
        .slice(at + 1)
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean);
      const perms = new Set<Permission>();
      for (const word of words) {
        if (word === "all") {
          PERMISSIONS.forEach((p) => perms.add(p));
        } else if ((PERMISSIONS as readonly string[]).includes(word)) {
          perms.add(word as Permission);
        } else {
          throw badRequest(`x-board-can: ${word} isn't a permission`, "invalid_scope");
        }
      }
      entries.set(pattern, implied(perms));
    }
    return new Access(entries);
  }

  get narrowedAtAll(): boolean {
    return this.entries !== null;
  }

  /** The permissions at the pattern that decides `channel`. */
  private at(channel: string): Set<Permission> {
    if (this.entries === null) {
      return new Set(PERMISSIONS);
    }
    const exact = this.entries.get(channel);
    if (exact) {
      return exact;
    }
    let best: string | null = null;
    for (const pattern of this.entries.keys()) {
      if (!pattern.endsWith("/")) {
        continue;
      }
      const base = pattern.slice(0, -1);
      const covers = channel === base || channel.startsWith(pattern);
      if (covers && (best === null || pattern.length > best.length)) {
        best = pattern;
      }
    }
    return this.entries.get(best ?? "*") ?? new Set();
  }

  can(permission: Permission, channel: string): boolean {
    return this.at(channel).has(permission);
  }

  readable(channel: string): boolean {
    return this.can("read", channel);
  }

  /** Board-wide permission (`manage at *`, as schema registration needs). */
  atStar(permission: Permission): boolean {
    return this.entries === null || (this.entries.get("*")?.has(permission) ?? false);
  }

  /** Whether some pattern gives `permission`. */
  anywhere(permission: Permission): boolean {
    return this.entries === null || [...this.entries.values()].some((set) => set.has(permission));
  }

  /**
   * Whether the caller holds `manage` at `pattern` and everywhere under it: what granting there
   * takes, since a grant gives what it names to the whole subtree a narrowing may carve out of.
   */
  managesAll(pattern: string): boolean {
    if (this.entries === null) {
      return true;
    }
    if (pattern === "*") {
      return [...this.entries.values()].every((perms) => perms.has("manage"));
    }
    const subtree = pattern.endsWith("/");
    const base = subtree ? pattern.slice(0, -1) : pattern;
    if (!this.can("manage", base)) {
      return false;
    }
    return !subtree || [...this.entries].every(([p, perms]) => p === "*" || !(p === base || p.startsWith(pattern)) || perms.has("manage"));
  }

  /** What `/me` reports: each pattern and its permissions, implications included. */
  summary(): Record<string, Permission[]> {
    if (this.entries === null) {
      return { "*": [...PERMISSIONS] };
    }
    return Object.fromEntries([...this.entries].map(([pattern, perms]) => [pattern, ordered(perms)]));
  }
}
