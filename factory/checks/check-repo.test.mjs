import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkRepo } from "./check-repo.mjs";

const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "check-repo-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const good = {
  "DOCTRINES.md": "| Prefix | Track | Document |\n| --- | --- | --- |\n| W, R | (repository) | `DOCTRINES.md` |\n| ABC | `t` | `t/a.md` |\n\n**W-1. Ask one at a time.**\n",
  "README.md": "| Track | Directory |\n| --- | --- |\n| `t` | `t/` | x |\n",
  "t/README.md": "| Document | Type |\n| --- | --- |\n| `a.md` | Research |\n",
  "t/a.md": "# ABC\n\n**ABC-1. Do it.**\nText.\n- Basis: Decision\n\n**ABC-2. Also.**\n- Basis: Verified\n\nSee ABC-1 and W-1.\n",
};

test("green on a consistent repository", () => {
  const { problems, stats } = checkRepo(repo(good), { trackedFiles: [] });
  assert.deepEqual(problems, []);
  assert.equal(stats.doctrines, 3);
});

test("fails on a dangling reference", () => {
  const { problems } = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "Also ABC-9.\n" }), { trackedFiles: [] });
  assert.match(problems.join("\n"), /ABC-9 is cited/);
});

test("fails on a duplicate definition, a missing Basis and an unregistered prefix", () => {
  const doc = good["t/a.md"] + "\n**ABC-1. Again.**\n- Basis: Decision\n\n**ABC-3. No basis.**\nText.\n\n**XYZ-1. Stray.**\n- Basis: Decision\n";
  const text = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /ABC-1 is defined twice/);
  assert.match(text, /ABC-3 .* has no "- Basis:" line/);
  assert.match(text, /prefix XYZ, which DOCTRINES.md does not register/);
});

test("ignores IDs inside code fences", () => {
  const doc = good["t/a.md"] + "\n```\n**ABC-7. In a code sample.**\nABC-8\n```\n";
  assert.deepEqual(checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems, []);
});

test("fails when a document is missing from its track's lookup table, or listed but absent", () => {
  const text = checkRepo(repo({ ...good, "t/b.md": "# B\n", "t/README.md": good["t/README.md"] + "| `gone.md` | Research |\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /t\/b.md is not listed/);
  assert.match(text, /lists gone.md, which does not exist/);
});

test("fails when a secret-bearing file is tracked, but allows .env.example", () => {
  const { problems } = checkRepo(repo(good), { trackedFiles: [".env.example", "app/.env.local", "key.pem", "src/env.ts"] });
  assert.deepEqual(problems.map((p) => p.split(" ")[0]), ["app/.env.local", "key.pem"]);
});
