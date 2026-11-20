import { z } from "zod";

/**
 * What requests may carry, route by route, as the Board protocol's route table says. Written here
 * from the protocol, not imported from an SDK: the board checks its own input.
 */

const SEGMENT = "[a-z0-9][a-z0-9_-]*";
const storable = (value: string) => !value.includes("\0") && value.isWellFormed();
const INHERITED = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]);
const notInherited = (name: string) => !INHERITED.has(name);

export const ChannelPath = z
  .string()
  .max(2048)
  .regex(new RegExp(`^${SEGMENT}(?:/${SEGMENT})*$`), "invalid channel path");
const ChannelOrSubtree = z
  .string()
  .max(2049)
  .regex(new RegExp(`^${SEGMENT}(?:/${SEGMENT})*/?$`), "name a channel, or a channel and its subtree (work/)");
const Ref = z.string().min(1).max(128);
const Revision = z.number().int().positive();
const ClientId = z.string().min(1).max(200).refine(storable, "id has a NUL character or a lone surrogate");
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const repeated = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v]));
const LabelFilter = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_.-]*(=.*)?$/, "label filters look like key, key=value, or key=a|b");
const LabelKey = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, "a label key is 1 to 64 lowercase letters, numbers, ., _, and -, starting with a letter or number")
  .refine(notInherited, "label key is a reserved name");
const LabelValue = z.string().max(256).refine(storable, "label value has a NUL character or a lone surrogate");
const NewLabels = z.record(LabelKey, LabelValue.refine((v) => !/\p{Cc}/u.test(v), "label value has a control character"));
const Labels = z.record(LabelKey, LabelValue);
const Emoji = z.string().max(64).regex(/^[a-z0-9_+-]+$/, "invalid emoji name").refine(notInherited, "emoji name is a reserved name");
const ActorId = z.string().min(1).max(256);
const SentText = z
  .string()
  .refine((t) => t.trim().length > 0, "message text is empty")
  .refine(storable, "message text has a NUL character or a lone surrogate");
const TaskNote = z
  .string()
  .refine((t) => t.trim().length > 0, "it is empty")
  .refine(storable, "it has a NUL character or a lone surrogate");
const TaskState = z.enum(["waiting", "ready", "claimed", "blocked", "completed", "failed", "canceled"]);
const Claimed = { epoch: z.number().int().positive(), token: z.string().min(1).max(128) };
const limit = z.coerce.number().int().min(1).max(500).optional();

const Filters = z.object({
  channel: z.string().optional(),
  re: Ref.optional(),
  by: z.string().optional(),
  mentions: z.string().optional(),
  label: repeated.pipe(z.array(LabelFilter)).optional(),
  from: z.string().min(1).max(165).optional(),
  text: z.string().min(1).max(200).optional(),
});
export type FilterQuery = z.infer<typeof Filters>;

export const ChannelsQuery = z.strictObject({ prefix: z.string().min(1).max(501).optional(), after: z.string().min(1).max(1024).optional(), limit });
export const CreateChannelBody = z.strictObject({ path: ChannelPath });
export const ChannelMessagesQuery = z.strictObject({ channel: ChannelPath, after: Ref.optional(), limit });
export const ThreadQuery = z.strictObject({ after: Ref.optional(), limit });
export const ThreadsQuery = Filters.extend({ after: Ref.optional(), before: z.string().min(1).max(1024).optional(), limit }).refine(
  (q) => q.before === undefined || q.after === undefined,
  { message: "`before` pages back from a page's `older`, and `after` reads forward: pass one", path: ["before"] },
);
export const EventsQuery = Filters.extend({
  after: Ref.optional(),
  wait: z.coerce.number().min(0).max(300).optional(),
  all: flag.optional(),
  last: z.coerce.number().int().min(1).max(100).optional(),
}).refine((q) => q.last === undefined || (q.after === undefined && q.wait === undefined), {
  message: "`last` reads the newest events at once: it takes no `after` or `wait`",
  path: ["last"],
});

export const PostBody = z
  .object({
    channel: ChannelPath.optional(),
    re: Ref.optional(),
    text: z.string().default(""),
    labels: NewLabels.optional(),
    noSync: z.boolean().optional(),
    sync: z.array(z.unknown()).max(10).optional(),
    id: ClientId.optional(),
    attachments: z.array(z.string()).optional(),
    after: Ref.optional(),
  })
  .refine((b) => b.text.trim().length > 0 || (b.attachments?.length ?? 0) > 0, { message: "message text is empty", path: ["text"] })
  .refine((b) => storable(b.text), { message: "message text has a NUL character or a lone surrogate", path: ["text"] })
  .refine((b) => (b.channel === undefined) !== (b.re === undefined), { message: "a post needs `channel`; a reply needs `re`" })
  .refine((b) => !(b.noSync && b.sync?.length), { message: "`noSync` and `sync` contradict each other" })
  .refine((b) => b.after === undefined || b.re !== undefined, { message: "`after` is for replies: it names the newest message in `re`'s thread", path: ["after"] });
export const EditBody = z.object({ text: SentText, revision: Revision.optional() });
export const DeleteBody = z.object({ revision: Revision.optional() }).optional();
export const ReactBody = z.object({ emoji: Emoji, remove: z.boolean().optional() });
export const LabelBody = z
  .object({
    set: NewLabels.optional(),
    unset: z.array(LabelKey).optional(),
    if: z.record(LabelKey, LabelValue.nullable()).refine((e) => Object.keys(e).length <= 16, "at most 16 labels").optional(),
  })
  .refine((b) => b.set !== undefined || b.unset !== undefined, { message: "nothing to change: pass `set` or `unset`" });

export const TasksQuery = z.object({
  channel: z.string().optional(),
  state: z.union([z.enum(["open", "all"]), TaskState]).optional(),
  label: repeated.pipe(z.array(LabelFilter)).optional(),
  by: z.string().optional(),
  owner: z.string().optional(),
  for: z.string().optional(),
  needs: Ref.optional(),
  after: Ref.optional(),
  limit,
});
export const CreateTaskBody = z
  .object({
    channel: ChannelPath.optional(),
    re: Ref.optional(),
    text: z.string().optional(),
    labels: NewLabels.optional(),
    noSync: z.boolean().optional(),
    attachments: z.array(z.string()).optional(),
    needs: z.array(Ref).optional(),
    for: ActorId.nullable().optional(),
    claim: z.boolean().optional(),
    lease: z.number().optional(),
    id: ClientId.optional(),
  })
  .refine((b) => (b.channel === undefined) !== (b.re === undefined), { message: "a task needs `channel` and `text` for a new thread, or `re` for a thread that's there" })
  .refine((b) => b.channel === undefined || (b.text ?? "").trim().length > 0 || (b.attachments?.length ?? 0) > 0, { message: "message text is empty", path: ["text"] })
  .refine((b) => b.text === undefined || storable(b.text), { message: "message text has a NUL character or a lone surrogate", path: ["text"] })
  .refine((b) => b.re === undefined || (b.text === undefined && b.labels === undefined && b.noSync === undefined && b.attachments === undefined && b.id === undefined), {
    message: "`text`, `labels`, `noSync`, `attachments`, and `id` are a new thread's: `re` makes a task of a thread as it is",
  })
  .refine((b) => b.lease === undefined || b.claim === true, { message: "`lease` goes with `claim`", path: ["lease"] });
const TaskKey = z.string().min(1).refine(storable, "key has a NUL character or a lone surrogate");
export const CreateTasksBody = z.object({
  channel: ChannelPath,
  tasks: z
    .array(
      z
        .object({
          key: TaskKey.optional(),
          text: z.string(),
          labels: NewLabels.optional(),
          noSync: z.boolean().optional(),
          attachments: z.array(z.string()).optional(),
          needs: z.array(z.union([Ref, z.strictObject({ key: TaskKey })])).optional(),
          for: ActorId.nullable().optional(),
        })
        .refine((t) => t.text.trim().length > 0 || (t.attachments?.length ?? 0) > 0, { message: "message text is empty", path: ["text"] })
        .refine((t) => storable(t.text), { message: "message text has a NUL character or a lone surrogate", path: ["text"] }),
    )
    .min(1),
  id: ClientId.optional(),
  request: z.string().min(1).max(64).optional(),
});
export const CreatedTasksQuery = z.object({ request: z.string().min(1).max(64).optional() });
export const ClaimTaskBody = z.object({ lease: z.number().optional() }).optional();
export const ClaimReadyTaskBody = z.object({
  channel: ChannelOrSubtree,
  label: Labels.optional(),
  from: z.array(z.string().min(1).max(256)).optional(),
  lease: z.number().optional(),
  wait: z.number().min(0).max(300).optional(),
});
export const RenewTaskBody = z.object({ ...Claimed, lease: z.number().optional() });
export const ReleaseTaskBody = z.object(Claimed);
export const CompleteTaskBody = z.object({ ...Claimed, result: TaskNote.optional() });
export const FailTaskBody = z.object({ ...Claimed, reason: TaskNote });
export const BlockTaskBody = z
  .object({
    reason: TaskNote,
    kind: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_.-]*$/, "a kind is lowercase letters, numbers, and _.-")
      .refine((k) => k !== "edited", "`edited` is the board's own kind, for a task whose root someone else edited: name another")
      .optional(),
    epoch: Claimed.epoch.optional(),
    token: Claimed.token.optional(),
  })
  .refine((b) => (b.epoch === undefined) === (b.token === undefined), { message: "a claim is its `epoch` and its `token`: pass both, or neither" });
export const AssignTaskBody = z.object({ for: ActorId.nullable() });
export const TaskNeedsBody = z.object({ needs: z.array(Ref) });
export const CancelTaskBody = z.object({ reason: TaskNote });

export const SchemaBody = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9._-]*$/, "a schema name is lowercase letters, numbers, and ._-, starting with a letter"),
  version: z.number().int().min(1),
  description: z.string().min(1).refine(storable, "a description has a NUL character or a lone surrogate").optional(),
  schema: z.record(z.string(), z.unknown()),
});
