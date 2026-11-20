import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Board, MAX_WAITERS_DEFAULT, type LeaseConfig } from "./board.ts";
import { FileStore } from "./file-store.ts";
import { createHandler } from "./http.ts";
import { Tokens } from "./tokens.ts";

const BOARD_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** The largest request body the board reads; text is capped far below it. */
const BODY_MAX = 8 * 1024 * 1024;

export type Config = {
  host: string;
  port: number;
  dataDir: string;
  boards: string[];
  publicUrl?: string;
  /** Long-polls each board holds at once; past it, 429 `too_many_waiters`. */
  maxWaiters?: number;
  tokens: Tokens;
};

/** Configuration from the environment; nothing is read from any `.env` file. */
export function configFromEnv(env: Record<string, string | undefined> = process.env): Config {
  const boards = (env.CSF_BOARD_BOARDS ?? "general").split(",").map((b) => b.trim()).filter(Boolean);
  for (const name of boards) {
    if (!BOARD_NAME.test(name)) {
      throw new Error(`CSF_BOARD_BOARDS: ${name} isn't a board name: lowercase letters, numbers, and -`);
    }
  }
  const port = Number(env.CSF_BOARD_PORT ?? "4710");
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`CSF_BOARD_PORT: ${env.CSF_BOARD_PORT} isn't a port`);
  }
  const maxWaiters = Number(env.CSF_BOARD_MAX_WAITERS ?? MAX_WAITERS_DEFAULT);
  if (!Number.isInteger(maxWaiters) || maxWaiters < 1) {
    throw new Error(`CSF_BOARD_MAX_WAITERS: ${env.CSF_BOARD_MAX_WAITERS} isn't a positive whole number`);
  }
  return {
    host: env.CSF_BOARD_HOST ?? "127.0.0.1",
    maxWaiters,
    port,
    dataDir: env.CSF_BOARD_DATA_DIR ?? join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "csf-board"),
    boards,
    ...(env.CSF_BOARD_PUBLIC_URL ? { publicUrl: env.CSF_BOARD_PUBLIC_URL } : {}),
    tokens: Tokens.fromEnv(env),
  };
}

const Policy = z.enum(["requeue", "hold"]);
const BoardConfig = z.strictObject({
  leaseExpiry: z.strictObject({ default: Policy.optional(), byLabel: z.record(z.string(), Policy).optional() }).optional(),
});

/** A board's own settings, from `<dataDir>/<board>/config.json` when there is one. */
function leaseConfig(dir: string): LeaseConfig {
  let text: string;
  try {
    text = readFileSync(join(dir, "config.json"), "utf8");
  } catch {
    return {};
  }
  const parsed = BoardConfig.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`${join(dir, "config.json")}: ${parsed.error.issues[0]!.message}`);
  }
  return parsed.data.leaseExpiry ?? {};
}

export type Running = { url: string; port: number; boards: Map<string, Board>; stop(): Promise<void> };

/** Opens every configured board and serves them; `stop` closes the listener, then the boards. */
export async function start(config: Config): Promise<Running> {
  const boards = new Map<string, Board>();
  try {
    for (const name of config.boards) {
      const dir = join(config.dataDir, name);
      boards.set(name, await Board.open(new FileStore(dir), { leases: leaseConfig(dir), ...(config.maxWaiters ? { maxWaiters: config.maxWaiters } : {}) }));
    }
  } catch (error) {
    await Promise.all([...boards.values()].map((b) => b.close()));
    throw error;
  }
  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    maxRequestBodySize: BODY_MAX,
    fetch: createHandler({ boards, tokens: config.tokens, ...(config.publicUrl ? { publicUrl: config.publicUrl } : {}) }),
  });
  const port = server.port!;
  return {
    url: `http://${config.host}:${port}`,
    port,
    boards,
    async stop() {
      await server.stop(true);
      await Promise.all([...boards.values()].map((b) => b.close()));
    },
  };
}

if (import.meta.main) {
  const running = await start(configFromEnv());
  console.log(`csf-board listening on ${running.url} (boards: ${[...running.boards.keys()].join(", ")})`);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await running.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
