import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/** Who a bearer token stands for. */
export type Principal = { id: string; handle: string; name: string };

const TokensFile = z.strictObject({
  tokens: z.array(
    z.strictObject({
      /** The token's SHA-256, hex: the file never holds a token itself. */
      sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 is 64 lowercase hex characters"),
      principal: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]{0,63}$/, "a principal ID looks like csf:user:jm"),
      handle: z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/, "a handle is lowercase letters, numbers, and ._-"),
      name: z.string().min(1).max(200),
    }),
  ),
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Token hash → principal. */
export class Tokens {
  private constructor(private readonly byHash: Map<string, Principal>) {}

  /** Parses a tokens file's JSON. Throws, naming the problem, on anything malformed. */
  static parse(json: string, source: string): Tokens {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (error) {
      throw new Error(`${source}: not JSON: ${(error as Error).message}`);
    }
    const parsed = TokensFile.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new Error(`${source}: ${issue.path.join(".")}: ${issue.message}`);
    }
    const byHash = new Map<string, Principal>();
    for (const entry of parsed.data.tokens) {
      byHash.set(entry.sha256, { id: entry.principal, handle: entry.handle, name: entry.name });
    }
    return new Tokens(byHash);
  }

  /**
   * From `CSF_BOARD_TOKENS` (the file's JSON itself) or the file `CSF_BOARD_TOKENS_FILE` names,
   * by default `$XDG_CONFIG_HOME/csf-board/tokens.json`: outside the repo, never committed.
   */
  static fromEnv(env: Record<string, string | undefined> = process.env): Tokens {
    if (env.CSF_BOARD_TOKENS) {
      return Tokens.parse(env.CSF_BOARD_TOKENS, "CSF_BOARD_TOKENS");
    }
    const file = env.CSF_BOARD_TOKENS_FILE ?? join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "csf-board", "tokens.json");
    let json: string;
    try {
      json = readFileSync(file, "utf8");
    } catch (error) {
      throw new Error(`no tokens: set CSF_BOARD_TOKENS or CSF_BOARD_TOKENS_FILE, or write ${file} (${(error as Error).message})`);
    }
    return Tokens.parse(json, file);
  }

  lookup(token: string): Principal | null {
    return this.byHash.get(hashToken(token)) ?? null;
  }
}
