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

// Adds a row inside the registry table (rows outside it are not registry rows).
function withRegistryRow(row) {
  return good["DOCTRINES.md"].replace("| ABC | `t` | `t/a.md` |\n", (last) => `${last}${row}\n`);
}

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

test("fails on a doctrine definition whose prefix has a digit or lowercase letters, naming ID, file and line", () => {
  const doc = good["t/a.md"] + "\n**V2MAIL-1. Digit prefix.**\n- Basis: Decision\n\n**abc-4. Lowercase prefix.**\n- Basis: Decision\n";
  const text = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /V2MAIL-1 \(t\/a\.md:12\) uses prefix V2MAIL, which is not capital letters only/);
  assert.match(text, /abc-4 \(t\/a\.md:15\) uses prefix abc, which is not capital letters only/);
});

test("an illegal definition still ends the previous doctrine's block", () => {
  const doc = "# ABC\n\n**ABC-1. No basis.**\nText.\n**V2MAIL-1. Next.**\n- Basis: Decision\n";
  const text = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /ABC-1 .* has no "- Basis:" line/);
});

test("fails on a registry row whose prefix is not letters only", () => {
  const doctrines = withRegistryRow("| V2MAIL | `t` | `t/a.md` |");
  const text = checkRepo(repo({ ...good, "DOCTRINES.md": doctrines }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /DOCTRINES\.md:5 registers prefix V2MAIL, which is not letters only/);
});

test("fails on hyphen and underscore prefixes, ending the ID at the last -digits, and they end the previous block", () => {
  const doc = "# ABC\n\n**ABC-1. No basis.**\nText.\n**V2-MAIL-1. Hyphen.**\n- Basis: Decision\n\n**A_B-1. Underscore.**\n- Basis: Decision\n";
  const text = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems.join("\n");
  assert.match(text, /V2-MAIL-1 \(t\/a\.md:5\) uses prefix V2-MAIL, which is not capital letters only/);
  assert.match(text, /A_B-1 \(t\/a\.md:8\) uses prefix A_B, which is not capital letters only/);
  assert.match(text, /ABC-1 .* has no "- Basis:" line/);
});

test("an illegal prefix that carries a Basis line yields exactly one problem", () => {
  const doc = good["t/a.md"] + "\n**V2MAIL-1. Digit prefix.**\n- Basis: Decision\n";
  const { problems } = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] });
  assert.equal(problems.length, 1);
});

test("an illegal prefix with no Basis line reports two separate defects: the prefix and the missing Basis", () => {
  const doc = good["t/a.md"] + "\n**V2MAIL-1. Digit prefix.**\nText.\n";
  const { problems } = checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /uses prefix V2MAIL, which is not capital letters only/);
  assert.match(problems[1], /V2MAIL-1 .* has no "- Basis:" line/);
});

test("a bold doctrine ID with no space after the period is still a definition", () => {
  const bare = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "\n**ABC-3.**\nText.\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(bare, /ABC-3 \(t\/a\.md:12\) has no "- Basis:" line/);
  const glued = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "\n**abc-4.**\n- Basis: Decision\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(glued, /abc-4 \(t\/a\.md:12\) uses prefix abc, which is not capital letters only/);
  const eol = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "\n**XYZ-1.\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(eol, /XYZ-1 .* does not register/);
});

test("a three-column table elsewhere in DOCTRINES.md is not read as a registry row", () => {
  const other = "\n| Level | Meaning | Where |\n| --- | --- | --- |\n| Tested | covered | `t/missing.md` |\n";
  const before = "| Level | Meaning | Where |\n| --- | --- | --- |\n| Tested | covered | `t/missing.md` |\n\n";
  const doctrines = before + good["DOCTRINES.md"] + other;
  assert.deepEqual(checkRepo(repo({ ...good, "DOCTRINES.md": doctrines }), { trackedFiles: [] }).problems, []);
});

test("fails on a lowercase registry prefix, and on an illegal prefix inside a multi-prefix cell", () => {
  const lower = checkRepo(repo({ ...good, "DOCTRINES.md": withRegistryRow("| abc | `t` | `t/a.md` |") }), { trackedFiles: [] }).problems.join("\n");
  assert.match(lower, /DOCTRINES\.md:5 registers prefix abc, which is not letters only/);
  const multi = good["DOCTRINES.md"].replace("| W, R |", "| W, R, r2 |");
  const { problems } = checkRepo(repo({ ...good, "DOCTRINES.md": multi }), { trackedFiles: [] });
  assert.deepEqual(problems, ["DOCTRINES.md:3 registers prefix r2, which is not letters only."]);
});

test("prose-like bold lines that look like definitions fail loud", () => {
  const step = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "\n**Step-1. Do this.**\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(step, /Step-1 \(t\/a\.md:12\) uses prefix Step, which is not capital letters only/);
  const iso = checkRepo(repo({ ...good, "t/a.md": good["t/a.md"] + "\n**ISO-8601. A standard.**\n" }), { trackedFiles: [] }).problems.join("\n");
  assert.match(iso, /ISO-8601 .* uses prefix ISO, which DOCTRINES.md does not register/);
});

test("accepts a withdrawn doctrine without a Basis line", () => {
  const doc = good["t/a.md"] + "\n**ABC-3. Withdrawn.**\nReplaced by ABC-2.\n";
  assert.deepEqual(checkRepo(repo({ ...good, "t/a.md": doc }), { trackedFiles: [] }).problems, []);
});
