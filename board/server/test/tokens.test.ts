import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Tokens, hashToken } from "../src/tokens.ts";

test("the committed example is a valid tokens file that admits no real token", () => {
  const tokens = Tokens.parse(readFileSync(join(import.meta.dir, "..", "tokens.example.json"), "utf8"), "example");
  expect(tokens.lookup("")).toBeNull();
  expect(tokens.lookup("example")).toBeNull();
});

test("a token is found by its hash, and a file holding anything but hashes is refused", () => {
  const tokens = Tokens.parse(JSON.stringify({ tokens: [{ sha256: hashToken("s3cret-for-test"), principal: "csf:user:ada", handle: "ada", name: "Ada" }] }), "t");
  expect(tokens.lookup("s3cret-for-test")).toEqual({ id: "csf:user:ada", handle: "ada", name: "Ada" });
  expect(tokens.lookup("other")).toBeNull();
  expect(() => Tokens.parse(JSON.stringify({ tokens: [{ token: "plain", principal: "csf:user:ada", handle: "ada", name: "Ada" }] }), "t")).toThrow();
  expect(() => Tokens.fromEnv({ CSF_BOARD_TOKENS_FILE: "/nonexistent/csf-board/tokens.json" })).toThrow(/no tokens/);
});
