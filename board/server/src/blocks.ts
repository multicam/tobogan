/**
 * Structured data in messages (BOARD-9): a top-level code fence whose info string is
 * `json#<name>@<version>`, holding a JSON object that matches that registered schema version.
 * Written from the protocol's description (HTTP API, "Schemas"), not from Board's source.
 */

const SCHEMA_NAME = /^[a-z][a-z0-9._-]{0,79}$/;
const SCHEMA_ID = /^([a-z][a-z0-9._-]{0,79})@([1-9][0-9]{0,4})$/;
export const SCHEMA_VERSION_MAX = 99_999;
export const SCHEMA_DESCRIPTION_MAX = 2000;
const SCHEMA_BYTES_MAX = 32_768;
const SCHEMA_NODES_MAX = 512;
const SCHEMA_SUBSCHEMAS_MAX = 64;
const SCHEMA_DEPTH_MAX = 16;

export type SchemaDefinition = Record<string, unknown>;
export type Block = { schema: string; version: number; data: Record<string, unknown> };
export type FoundBlock = { name?: string; version?: number; data?: Record<string, unknown>; problem?: string };

export const isSchemaName = (name: string) => SCHEMA_NAME.test(name);

export function parseSchemaId(id: string): { name: string; version: number } | null {
  const found = SCHEMA_ID.exec(id);
  return found ? { name: found[1]!, version: Number(found[2]) } : null;
}

const SHA = { type: "string", pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$", description: "Full lowercase commit SHA" };

/** The two schemas every Board has (protocol constants), which may use `pattern`. */
export const BUILT_IN_SCHEMAS: { name: string; version: number; description: string; schema: SchemaDefinition }[] = [
  {
    name: "git-commit",
    version: 1,
    description: "A Git commit, by its full SHA and the first line of its message.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sha", "title"],
      properties: { sha: SHA, title: { type: "string", minLength: 1, maxLength: 1024 } },
    },
  },
  {
    name: "vercel-deployment",
    version: 1,
    description: "A Vercel deployment, by its URL and optionally the commit it was built from.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: {
        url: { type: "string", format: "uri", pattern: "^https://", maxLength: 2048 },
        gitSha: SHA,
      },
    },
  },
];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON with every object's keys sorted: two definitions that say the same compare equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, child) =>
    isObject(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : child,
  );
}

// ---- Finding blocks -------------------------------------------------------------------------

type Fence = { char: string; length: number; info: string };
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const CONTAINER = /^ {0,3}(?:>[ \t]?|[-*+][ \t]+|\d{1,9}[.)][ \t]+)/;

function opens(line: string): Fence | null {
  const found = FENCE_OPEN.exec(line);
  if (!found) {
    return null;
  }
  const marks = found[1]!;
  const info = found[2]!.trim();
  // A backtick fence's info string holds no backtick: that would be inline code.
  if (marks[0] === "`" && info.includes("`")) {
    return null;
  }
  return { char: marks[0]!, length: marks.length, info };
}

function closes(line: string, fence: Fence): boolean {
  const found = FENCE_CLOSE.exec(line);
  return found !== null && found[1]![0] === fence.char && found[1]!.length >= fence.length;
}

function readBlock(id: string, source: string): FoundBlock {
  const named = parseSchemaId(id);
  if (!named) {
    return { problem: `json#${id} names no schema: one is name@version, like sandbox@1` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ...named, problem: `the ${id} block isn't JSON` };
  }
  if (!isObject(parsed)) {
    return { ...named, problem: `the ${id} block isn't a JSON object` };
  }
  return { ...named, data: parsed };
}

/**
 * Every top-level `json#…` fence in `text`, in order. A fence inside another fence is its text;
 * one opened inside a quote or a list item belongs to that container and is never a block.
 */
export function findBlocks(text: string): FoundBlock[] {
  if (!text.includes("json#")) {
    return [];
  }
  const found: FoundBlock[] = [];
  let open: (Fence & { lines: string[] }) | null = null;
  let nested: Fence | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (open) {
      if (closes(line, open)) {
        const id = /^json#(\S*)/.exec(open.info)?.[1];
        if (id !== undefined) {
          found.push(readBlock(id, open.lines.join("\n")));
        }
        open = null;
      } else {
        open.lines.push(line);
      }
      continue;
    }
    const container = CONTAINER.exec(line);
    if (nested) {
      const inner = container ? line.slice(container[0].length) : line.startsWith("  ") ? line.trimStart() : null;
      if (inner !== null) {
        if (closes(inner, nested)) {
          nested = null;
        }
        continue;
      }
      nested = null;
    }
    if (container) {
      nested = opens(line.slice(container[0].length));
      continue;
    }
    const fence = opens(line);
    if (fence) {
      open = { ...fence, lines: [] };
    }
  }
  if (open) {
    const id = /^json#(\S*)/.exec(open.info)?.[1];
    if (id !== undefined) {
      found.push({ ...(parseSchemaId(id) ?? {}), problem: `the ${id} block's fence never closes` });
    }
  }
  return found;
}

/** The well-formed blocks a message carries, as views list them. */
export function blocksIn(text: string): Block[] {
  return findBlocks(text).flatMap((b) =>
    b.name !== undefined && b.version !== undefined && b.data !== undefined ? [{ schema: b.name, version: b.version, data: b.data }] : [],
  );
}

// ---- Checking definitions -------------------------------------------------------------------

const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const FORMATS = new Set(["date-time", "date", "time", "email", "uri", "uuid", "hostname", "ipv4", "ipv6"]);
const isSubschema = (v: unknown) => isObject(v) || typeof v === "boolean";
const isCount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isFinite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown) => typeof v === "string";
const isSchemaList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(isSubschema);

/** Structural keywords only: no `$ref`, `pattern` or `uniqueItems`, nothing that runs or follows. */
const KEYWORDS: Record<string, (v: unknown) => boolean> = {
  $schema: isText,
  title: isText,
  description: isText,
  type: (v) => (typeof v === "string" && TYPES.has(v)) || (Array.isArray(v) && v.length > 0 && v.every((t) => TYPES.has(t)) && new Set(v).size === v.length),
  properties: (v) => isObject(v) && Object.values(v).every(isSubschema),
  required: (v) => Array.isArray(v) && v.every(isText) && new Set(v).size === v.length,
  additionalProperties: isSubschema,
  items: isSubschema,
  minItems: isCount,
  maxItems: isCount,
  minLength: isCount,
  maxLength: isCount,
  minimum: isFinite,
  maximum: isFinite,
  exclusiveMinimum: isFinite,
  exclusiveMaximum: isFinite,
  multipleOf: (v) => isFinite(v) && (v as number) > 0,
  enum: (v) => Array.isArray(v) && v.length > 0,
  const: () => true,
  oneOf: isSchemaList,
  anyOf: isSchemaList,
  allOf: isSchemaList,
  not: isSubschema,
  format: (v) => typeof v === "string" && FORMATS.has(v),
};

/** Why a definition can't be registered, or null when it can. */
export function checkDefinition(schema: unknown): string | null {
  if (!isObject(schema) || schema.type !== "object") {
    return 'a schema describes a JSON object: give it "type": "object"';
  }
  if (new TextEncoder().encode(JSON.stringify(schema)).length > SCHEMA_BYTES_MAX) {
    return `a schema is at most ${SCHEMA_BYTES_MAX} bytes of JSON`;
  }
  let nodes = 0;
  let subschemas = 0;
  const count = (depth: number) => {
    nodes += 1;
    if (nodes > SCHEMA_NODES_MAX || depth > SCHEMA_DEPTH_MAX) {
      throw new Error(`a schema has at most ${SCHEMA_NODES_MAX} nodes and ${SCHEMA_DEPTH_MAX} levels`);
    }
  };
  const data = (value: unknown, depth: number): void => {
    count(depth);
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach((child) => data(child, depth + 1));
    }
  };
  const subschema = (value: unknown, depth: number, at: string): void => {
    count(depth);
    if (!isObject(value)) {
      return;
    }
    subschemas += 1;
    if (subschemas > SCHEMA_SUBSCHEMAS_MAX) {
      throw new Error(`a schema has at most ${SCHEMA_SUBSCHEMAS_MAX} subschemas`);
    }
    for (const [keyword, child] of Object.entries(value)) {
      const ok = Object.hasOwn(KEYWORDS, keyword) ? KEYWORDS[keyword] : undefined;
      if (!ok) {
        throw new Error(`schemas don't take "${keyword}"${at ? ` (at ${at})` : ""}: no references, patterns, uniqueItems, or keywords of your own`);
      }
      if (!ok(child)) {
        throw new Error(`"${keyword}"${at ? ` at ${at}` : ""} has a value it doesn't take`);
      }
      if (keyword === "enum" || keyword === "const") {
        data(child, depth + 1);
      } else if (keyword === "properties") {
        count(depth + 1);
        for (const [name, prop] of Object.entries(child as Record<string, unknown>)) {
          subschema(prop, depth + 2, `${at}/properties/${name}`);
        }
      } else if (Array.isArray(child)) {
        child.forEach((item, i) => (isSubschema(item) && keyword !== "required" && keyword !== "type" ? subschema(item, depth + 1, `${at}/${keyword}/${i}`) : count(depth + 1)));
      } else if (isObject(child)) {
        subschema(child, depth + 1, `${at}/${keyword}`);
      } else {
        count(depth + 1);
      }
    }
  };
  try {
    subschema(schema, 0, "");
  } catch (error) {
    return (error as Error).message;
  }
  return null;
}

// ---- Checking values ------------------------------------------------------------------------

const FORMAT_CHECKS: Record<string, (s: string) => boolean> = {
  "date-time": (s) => /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)),
  time: (s) => /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?$/.test(s),
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  uri: (s) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) && URL.canParse(s),
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  hostname: (s) => s.length <= 253 && /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i.test(s),
  ipv4: (s) => /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|0?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|0?\d?\d)$/.test(s),
  ipv6: (s) => s.includes(":") && URL.canParse(`http://[${s}]/`),
};

function typeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function hasType(value: unknown, type: string): boolean {
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  return typeOf(value) === type;
}

/** Why `value` doesn't match `schema`, naming the field, or null when it does. */
export function checkValue(schema: unknown, value: unknown, at = ""): string | null {
  if (schema === true) {
    return null;
  }
  if (schema === false || !isObject(schema)) {
    return `${at || "the value"} isn't allowed`;
  }
  const where = at || "the value";
  const s = schema;
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!types.some((t) => hasType(value, t))) {
      return `${where} must be ${types.join(" or ")}`;
    }
  }
  if (s.enum !== undefined && !(s.enum as unknown[]).some((option) => canonical(option) === canonical(value))) {
    return `${where} must be one of ${JSON.stringify(s.enum)}`;
  }
  if (s.const !== undefined && canonical(s.const) !== canonical(value)) {
    return `${where} must be ${JSON.stringify(s.const)}`;
  }
  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof s.minLength === "number" && length < s.minLength) {
      return `${where} must be at least ${s.minLength} characters`;
    }
    if (typeof s.maxLength === "number" && length > s.maxLength) {
      return `${where} must be at most ${s.maxLength} characters`;
    }
    if (typeof s.format === "string" && !(FORMAT_CHECKS[s.format]?.(value) ?? true)) {
      return `${where} must be a ${s.format}`;
    }
    if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(value)) {
      return `${where} must match ${s.pattern}`;
    }
  }
  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) {
      return `${where} must be at least ${s.minimum}`;
    }
    if (typeof s.maximum === "number" && value > s.maximum) {
      return `${where} must be at most ${s.maximum}`;
    }
    if (typeof s.exclusiveMinimum === "number" && value <= s.exclusiveMinimum) {
      return `${where} must be above ${s.exclusiveMinimum}`;
    }
    if (typeof s.exclusiveMaximum === "number" && value >= s.exclusiveMaximum) {
      return `${where} must be below ${s.exclusiveMaximum}`;
    }
    if (typeof s.multipleOf === "number" && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9) {
      return `${where} must be a multiple of ${s.multipleOf}`;
    }
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) {
      return `${where} must have at least ${s.minItems} items`;
    }
    if (typeof s.maxItems === "number" && value.length > s.maxItems) {
      return `${where} must have at most ${s.maxItems} items`;
    }
    if (s.items !== undefined) {
      for (const [i, item] of value.entries()) {
        const each = Array.isArray(s.items) ? (s.items as unknown[])[i] ?? true : s.items;
        const problem = checkValue(each, item, `${at}[${i}]`);
        if (problem) {
          return problem;
        }
      }
    }
  }
  if (isObject(value)) {
    const props = isObject(s.properties) ? s.properties : {};
    for (const name of (s.required as string[] | undefined) ?? []) {
      if (!Object.hasOwn(value, name)) {
        return `${at ? `${at}.` : ""}${name} is required`;
      }
    }
    for (const [name, child] of Object.entries(value)) {
      const path = at ? `${at}.${name}` : name;
      const rule = Object.hasOwn(props, name) ? props[name] : s.additionalProperties;
      if (rule === undefined) {
        continue;
      }
      if (rule === false) {
        return `${path} isn't a property this schema takes`;
      }
      const problem = checkValue(rule, child, path);
      if (problem) {
        return problem;
      }
    }
  }
  for (const sub of (s.allOf as unknown[] | undefined) ?? []) {
    const problem = checkValue(sub, value, at);
    if (problem) {
      return problem;
    }
  }
  if (Array.isArray(s.anyOf) && !s.anyOf.some((sub) => checkValue(sub, value, at) === null)) {
    return `${where} matches none of anyOf`;
  }
  if (Array.isArray(s.oneOf) && s.oneOf.filter((sub) => checkValue(sub, value, at) === null).length !== 1) {
    return `${where} must match exactly one of oneOf`;
  }
  if (s.not !== undefined && checkValue(s.not, value, at) === null) {
    return `${where} matches what not excludes`;
  }
  return null;
}
