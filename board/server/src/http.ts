import type { Server } from "bun";
import { z } from "zod";
import { Access } from "./access.ts";
import type { Board, Caller } from "./board.ts";
import { HTTP, HttpError, badRequest, errorResponse, forbidden, notFound, notKept } from "./errors.ts";
import { channelFilter, parseLabelFilter, type Filter } from "./filters.ts";
import { seqOf, messageId, type Actor } from "./state.ts";
import type { Principal, Tokens } from "./tokens.ts";
import * as wire from "./wire.ts";

/** The protocol version this board speaks, as discovery reports it. */
export const VERSION = "0.51.1";
const PROFILE = /^[A-Za-z][A-Za-z0-9-]{0,31}$/;
const BOARD_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CLAIM_WAIT_MAX_S = 300;

export type Options = {
  boards: Map<string, Board>;
  tokens: Tokens;
  /** Where clients reach the server, when that isn't the URL requests arrive at (a proxy). */
  publicUrl?: string;
};

type Params = Record<string, string>;
type Ctx = { req: Request; url: URL; server: Server<unknown> | undefined; board: Board; caller: Caller; params: Params };
type Handler = (ctx: Ctx) => Promise<Response> | Response;

const json = (body: unknown, status: number = HTTP.ok) => Response.json(body, { status });

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    throw badRequest(`${path}${issue.message}`);
  }
  return result.data;
}

/** A query string as an object: a key given twice is an array. */
function queryObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length === 1 ? all[0]! : all;
  }
  return out;
}

async function body(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("the request's body isn't JSON");
  }
}

/** `x-board-profile`, an RFC 8941 item: `fixer` or `fixer;avatar="https://…"`. */
export function parseProfile(value: string): { name: string; avatar: string | null } {
  const fail = (why: string): never => {
    throw badRequest(`x-board-profile is a structured header, like fixer;avatar="https://example.com/fixer.png": ${why}`);
  };
  let at = 0;
  const string = () => {
    at++;
    let out = "";
    while (at < value.length) {
      const char = value[at++]!;
      if (char === "\\") {
        const next = value[at++];
        if (next !== '"' && next !== "\\") {
          fail('a string escapes only " and \\');
        }
        out += next;
      } else if (char === '"') {
        return out;
      } else if (char < " " || char > "~") {
        fail("a string is printable ASCII");
      } else {
        out += char;
      }
    }
    return fail('a string is missing its closing "');
  };
  const token = () => {
    const start = at;
    while (at < value.length && /[!#$%&'*+\-.^_`|~0-9A-Za-z:/]/.test(value[at]!)) {
      at++;
    }
    return value.slice(start, at);
  };
  while (value[at] === " ") {
    at++;
  }
  const name = value[at] === '"' ? string() : /[A-Za-z*]/.test(value[at] ?? "") ? token() : fail("it names no profile");
  let avatar: string | null = null;
  while (value[at] === ";") {
    at++;
    while (value[at] === " ") {
      at++;
    }
    const start = at;
    while (at < value.length && /[a-z0-9_\-.*]/.test(value[at]!)) {
      at++;
    }
    const key = value.slice(start, at);
    if (key === "" || !/[a-z*]/.test(key[0]!)) {
      fail("a parameter starts with a lowercase letter");
    }
    let param: string | null = null;
    if (value[at] === "=") {
      at++;
      param = value[at] === '"' ? string() : (token() || fail("a parameter has no value after its =")) && null;
    }
    if (key === "avatar") {
      if (param === null) {
        fail("avatar is a string, in quotes");
      }
      avatar = param;
    }
  }
  while (value[at] === " ") {
    at++;
  }
  if (at < value.length) {
    fail(`${JSON.stringify(value.slice(at, at + 20))} follows the profile`);
  }
  return { name, avatar };
}

/** The caller a request is: its token's principal, as itself or as the profile its header names. */
export function callerOf(principal: Principal, headers: Headers): Caller {
  const header = headers.get("x-board-profile");
  let actor: Actor;
  let profile: string | null = null;
  if (header !== null && header.trim() !== "") {
    const { name, avatar } = parseProfile(header);
    if (!PROFILE.test(name)) {
      throw badRequest(`as: ${name}: profiles start with a letter and use up to 32 letters, numbers, and hyphens`);
    }
    if (avatar !== null && !/^https:\/\/[^\s]+$/.test(avatar)) {
      throw badRequest("x-board-profile: an avatar is an https URL");
    }
    profile = name.toLowerCase();
    actor = {
      id: `${principal.id}+${profile}`,
      kind: "agent",
      handle: `${principal.handle}/${profile}`,
      name,
      avatar,
      via: { name: principal.handle, environment: null },
    };
  } else {
    actor = { id: principal.id, kind: "person", handle: principal.handle, name: principal.name, avatar: null };
  }
  const can = headers.get("x-board-can");
  return { principal, actor, profile, access: can === null ? Access.full() : Access.narrowed(can) };
}

/** The read filters, as the board matches them: `re` as the thread it names, `mentions` as IDs and handles. */
function filterOf(board: Board, q: wire.FilterQuery): Filter {
  const filter: Filter = {};
  if (q.channel !== undefined) {
    filter.channel = channelFilter(q.channel);
  }
  if (q.re !== undefined) {
    const seq = seqOf(q.re);
    const m = seq === null ? undefined : board.state.messages.get(messageId(seq));
    filter.re = m ? m.thread : q.re;
  }
  if (q.by !== undefined) {
    filter.by = q.by;
  }
  if (q.mentions !== undefined) {
    const value = q.mentions;
    const ids = [value, ...[...board.state.actors.values()].filter((a) => a.handle.toLowerCase() === value.toLowerCase()).map((a) => a.id)];
    filter.mentions = { ids, handles: [value] };
  }
  if (q.label !== undefined) {
    filter.labels = q.label.map(parseLabelFilter);
  }
  if (q.from !== undefined) {
    filter.from = q.from;
  }
  if (q.text !== undefined) {
    filter.text = q.text;
  }
  return filter;
}

/** Holds a long-poll open past Bun's idle timeout, which would otherwise cut it at 10s. */
function holdOpen(ctx: Ctx): void {
  ctx.server?.timeout(ctx.req, 0);
}

/** A long-poll request (see `Board.poll`), held open past Bun's idle timeout while it waits. */
async function longPoll(ctx: Ctx, deadline: number, attempt: (final: boolean) => Promise<unknown>): Promise<Response> {
  return json(await ctx.board.poll(deadline, ctx.req.signal, attempt, () => holdOpen(ctx)));
}

const notSupported =(what: string): Handler => () => {
  throw notKept("not_supported", `${what} isn't kept on this board`);
};

// ---- Routes ---------------------------------------------------------------------------------

const routes: [string, string, Handler][] = [
  ["GET", "/me", ({ board, caller }) => json(board.me(caller))],
  ["GET", "/actors", ({ board, caller }) => json(board.actors(caller))],
  ["GET", "/channels", ({ board, caller, url }) => json(board.channels(caller, parse(wire.ChannelsQuery, queryObject(url))))],
  [
    "POST",
    "/channels",
    async ({ board, caller, req }) => {
      const { path } = parse(wire.CreateChannelBody, await body(req));
      const out = await board.createChannel(caller, path);
      return json(out.body, out.status);
    },
  ],
  ["GET", "/messages", ({ board, caller, url }) => json(board.channelMessages(caller, parse(wire.ChannelMessagesQuery, queryObject(url))))],
  ["GET", "/messages/:id", ({ board, caller, url, params }) => json(board.thread(caller, params.id!, parse(wire.ThreadQuery, queryObject(url))))],
  [
    "GET",
    "/threads",
    ({ board, caller, url }) => {
      const q = parse(wire.ThreadsQuery, queryObject(url));
      return json(board.threads(caller, filterOf(board, q), q));
    },
  ],
  [
    "POST",
    "/messages",
    async ({ board, caller, req }) => {
      const b = parse(wire.PostBody, await body(req));
      if (b.sync?.length) {
        throw notKept("not_supported", "sync targets aren't kept on this board");
      }
      if (b.attachments?.length) {
        throw notKept("no_files", "this board keeps no files");
      }
      return json(await board.post(caller, b), HTTP.created);
    },
  ],
  ["POST", "/messages/:id/edit", async ({ board, caller, req, params }) => json(await board.edit(caller, params.id!, parse(wire.EditBody, await body(req))))],
  ["POST", "/messages/:id/delete", async ({ board, caller, req, params }) => json(await board.delete(caller, params.id!, parse(wire.DeleteBody, await body(req)) ?? {}))],
  ["POST", "/messages/:id/reactions", async ({ board, caller, req, params }) => json(await board.react(caller, params.id!, parse(wire.ReactBody, await body(req))))],
  ["POST", "/messages/:id/labels", async ({ board, caller, req, params }) => json(await board.label(caller, params.id!, parse(wire.LabelBody, await body(req))))],
  ["POST", "/messages/:id/sync", notSupported("sync")],
  ["GET", "/messages/:id/sync", notSupported("sync")],
  ["POST", "/messages/:id/typing", notSupported("typing")],
  ["GET", "/links", notSupported("links")],
  ["GET", "/posts/:id", ({ board, caller, params }) => json(board.posted(caller, params.id!))],
  [
    "GET",
    "/events",
    async (ctx) => {
      const { board, caller, url, req } = ctx;
      if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
        throw notKept("not_supported", "this board streams no events: read /events with wait");
      }
      const q = parse(wire.EventsQuery, queryObject(url));
      const filter = filterOf(board, q);
      if (q.last !== undefined) {
        return json(board.lastEvents(caller, filter, { last: q.last, all: q.all }));
      }
      const deadline = Date.now() + (q.wait ?? 0) * 1000;
      let after = q.after ?? String(board.state.head);
      return longPoll(ctx, deadline, async (final) => {
        const page = board.events(caller, filter, { after, all: q.all });
        after = page.cursor;
        return page.events.length > 0 || final ? page : null;
      });
    },
  ],
  ["GET", "/schemas", ({ board }) => json(board.schemas())],
  ["GET", "/schemas/:id", ({ board, params }) => json(board.schema(params.id!))],
  [
    "POST",
    "/schemas",
    async ({ board, caller, req }) => {
      const b = parse(wire.SchemaBody, await body(req));
      const out = await board.createSchema(caller, b as Parameters<Board["createSchema"]>[1]);
      return json(out.body);
    },
  ],
  [
    "GET",
    "/tasks",
    ({ board, caller, url }) => {
      const q = parse(wire.TasksQuery, queryObject(url));
      return json(board.listTasks(caller, filterOf(board, { channel: q.channel, label: q.label, by: q.by }), q));
    },
  ],
  [
    "POST",
    "/tasks",
    async ({ board, caller, req }) => {
      const b = parse(wire.CreateTaskBody, await body(req));
      if (b.attachments?.length) {
        throw notKept("no_files", "this board keeps no files");
      }
      const out = b.re !== undefined ? await board.adoptTask(caller, { ...b, re: b.re }) : await board.createTask(caller, { ...b, channel: b.channel! });
      return json(out, HTTP.created);
    },
  ],
  [
    "POST",
    "/tasks/batch",
    async ({ board, caller, req }) => {
      const b = parse(wire.CreateTasksBody, await body(req));
      if (b.tasks.some((t) => t.attachments?.length)) {
        throw notKept("no_files", "this board keeps no files");
      }
      return json(await board.createTasks(caller, b), HTTP.created);
    },
  ],
  ["GET", "/tasks/batch/:id", ({ board, caller, params, url }) => json(board.createdTasks(caller, params.id!, parse(wire.CreatedTasksQuery, queryObject(url)).request))],
  [
    "POST",
    "/tasks/claim",
    async (ctx) => {
      const { board, caller, req } = ctx;
      const b = parse(wire.ClaimReadyTaskBody, await body(req));
      const deadline = Date.now() + Math.min(b.wait ?? 0, CLAIM_WAIT_MAX_S) * 1000;
      return longPoll(ctx, deadline, async (final) => {
        const got = await board.claimNext(caller, b);
        return got ?? (final ? { task: null } : null);
      });
    },
  ],
  ["POST", "/tasks/:id/claim", async ({ board, caller, req, params }) => json(await board.claimTask(caller, params.id!, parse(wire.ClaimTaskBody, await body(req))?.lease))],
  ["POST", "/tasks/:id/renew", async ({ board, caller, req, params }) => json(await board.renewTask(caller, params.id!, parse(wire.RenewTaskBody, await body(req))))],
  ["POST", "/tasks/:id/release", async ({ board, caller, req, params }) => json(await board.settleTask(caller, params.id!, "release", parse(wire.ReleaseTaskBody, await body(req))))],
  ["POST", "/tasks/:id/complete", async ({ board, caller, req, params }) => json(await board.settleTask(caller, params.id!, "complete", parse(wire.CompleteTaskBody, await body(req))))],
  ["POST", "/tasks/:id/fail", async ({ board, caller, req, params }) => json(await board.settleTask(caller, params.id!, "fail", parse(wire.FailTaskBody, await body(req))))],
  ["POST", "/tasks/:id/block", async ({ board, caller, req, params }) => json(await board.blockTask(caller, params.id!, parse(wire.BlockTaskBody, await body(req))))],
  ["POST", "/tasks/:id/unblock", async ({ board, caller, params }) => json(await board.unblockTask(caller, params.id!))],
  ["POST", "/tasks/:id/reopen", async ({ board, caller, params }) => json(await board.reopenTask(caller, params.id!))],
  ["POST", "/tasks/:id/assign", async ({ board, caller, req, params }) => json(await board.assignTask(caller, params.id!, parse(wire.AssignTaskBody, await body(req)).for))],
  ["POST", "/tasks/:id/needs", async ({ board, caller, req, params }) => json(await board.setNeeds(caller, params.id!, parse(wire.TaskNeedsBody, await body(req)).needs))],
  ["POST", "/tasks/:id/cancel", async ({ board, caller, req, params }) => json(await board.cancelTask(caller, params.id!, parse(wire.CancelTaskBody, await body(req)).reason))],
  // Watchers aren't an optional group to conformance, so these answer as a board that takes watchers
  // only from a deployment's project would: an empty list, and 403 `watchers_need_project` to register.
  ["GET", "/watchers", () => json({ watchers: [] })],
  [
    "POST",
    "/watchers",
    async ({ req }) => {
      const b = (await body(req).catch(() => undefined)) as { path?: unknown } | undefined;
      if (b && typeof b === "object" && typeof b.path === "string") {
        throw notKept("no_wake_by_path", "this board wakes no one by path");
      }
      throw forbidden("only a deployment's project registers watchers here", "watchers_need_project");
    },
  ],
  ["GET", "/watchers/matches", () => { throw forbidden("only a deployment's project has watchers here", "watchers_need_project"); }],
  ["POST", "/watchers/matches/:id/ack", () => { throw forbidden("only a deployment's project has watchers here", "watchers_need_project"); }],
];

/**
 * Grants aren't kept (ceiling: each token's principal has full access, narrowed by x-board-can —
 * upgrade trigger: a principal that must be confined board-side, BOARD-7). A grant write still
 * answers as one would to a caller narrowed out of what it names: 403 before 501, since no
 * board lets a caller give past its own `can`.
 */
const noGrants: Handler = async ({ req, caller }) => {
  if (req.method !== "GET" && caller.access.narrowedAtAll) {
    const b = (await body(req).catch(() => undefined)) as { can?: unknown; grants?: { can?: unknown }[] } | undefined;
    const cans = [b?.can, ...(Array.isArray(b?.grants) ? b.grants.map((g) => g?.can) : [])];
    const patterns = cans.flatMap((can) => (can && typeof can === "object" ? Object.keys(can) : []));
    const past = patterns.find((p) => !caller.access.managesAll(p));
    if (past !== undefined) {
      throw forbidden(`granting on ${past} needs manage there and everywhere under it, past this caller's x-board-can`);
    }
  }
  throw notKept("no_grants", "this board keeps no grants: its tokens' principals have full access, narrowed by x-board-can");
};
for (const path of ["/grants", "/grants/batch", "/grants/:id", "/grants/explain", "/grants/:id/revoke"]) {
  for (const method of ["GET", "POST", "PATCH"]) {
    routes.push([method, path, noGrants]);
  }
}
for (const path of ["/schedules", "/schedules/:id/cancel"]) {
  for (const method of ["GET", "POST"]) {
    routes.push([method, path, () => { throw notKept("no_scheduler", "this board schedules nothing"); }]);
  }
}
for (const path of ["/attachments", "/attachments/:id", "/attachments/uploads", "/attachments/uploads/:id"]) {
  for (const method of ["GET", "POST"]) {
    routes.push([method, path, () => { throw notKept("no_files", "this board keeps no files"); }]);
  }
}
for (const path of ["/inbox/:key", "/inbox/:key/next", "/inbox/:key/:id/ack", "/sync/imports", "/sync/receipts", "/sync/threads/:id", "/sync/find", "/sync/copies", "/sources/:key/read", "/sources/:key/join", "/webhooks/:key", "/wake"]) {
  for (const method of ["GET", "POST"]) {
    routes.push([method, path, notSupported(path.split("/")[1]!)]);
  }
}

const compiled = routes.map(([method, path, handler]) => {
  const names: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, name: string) => (names.push(name), "([^/]+)"))}$`);
  return { method, pattern, names, handler };
});

function match(method: string, path: string): { handler: Handler; params: Params } | "method" | null {
  let pathMatched = false;
  for (const route of compiled) {
    const found = route.pattern.exec(path);
    if (!found) {
      continue;
    }
    pathMatched = true;
    if (route.method !== method) {
      continue;
    }
    const params: Params = {};
    route.names.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(found[i + 1]!);
      } catch {
        throw badRequest(`${found[i + 1]} isn't URI-encoded`);
      }
    });
    return { handler: route.handler, params };
  }
  return pathMatched ? "method" : null;
}

/** The server's request handler: boards under `/boards/<name>`, each with the whole protocol. */
export function createHandler(options: Options) {
  return async (req: Request, server?: Server<unknown>): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const mount = /^\/boards\/([^/]+)(\/.*)?$/.exec(url.pathname);
      const name = mount?.[1];
      const board = name !== undefined && BOARD_NAME.test(name) ? options.boards.get(name) : undefined;
      if (!mount || !board) {
        throw notFound(`no board at ${url.pathname}`);
      }
      const rest = (mount[2] ?? "/").replace(/\/+$/, "") || "/";
      const base = `${(options.publicUrl ?? url.origin).replace(/\/+$/, "")}/boards/${name}`;
      if (rest === "/") {
        if (req.method !== "GET") {
          throw new HttpError(HTTP.methodNotAllowed, "method_not_allowed", `${req.method} ${url.pathname}: discovery is GET`);
        }
        return json({ version: VERSION, url: base, audience: base, team_id: null, project_id: null, sync: [] });
      }
      const found = match(req.method, rest);
      if (found === null) {
        throw notFound(`no route: ${req.method} ${url.pathname}`);
      }
      if (found === "method") {
        throw new HttpError(HTTP.methodNotAllowed, "method_not_allowed", `no route: ${req.method} ${url.pathname}`);
      }
      const auth = req.headers.get("authorization") ?? "";
      const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
      const principal = token ? options.tokens.lookup(token) : null;
      if (!principal) {
        throw new HttpError(HTTP.unauthorized, "unauthorized", token ? "that token isn't one this board knows" : "this board needs a bearer token: Authorization: Bearer <token>");
      }
      const caller = callerOf(principal, req.headers);
      return await found.handler({ req, url, server, board, caller, params: found.params });
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error);
      }
      console.error("[csf-board] internal error:", error);
      return errorResponse(new HttpError(HTTP.internal, "internal", "the board failed on this request: see its log"));
    }
  };
}
