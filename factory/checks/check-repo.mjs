#!/usr/bin/env node
/**
 * Repository check (LADDER-1, LADDER-2; those doctrines live in csf-research, tracks/factory/harness-loops-graphs.md). Exits 1 with a list of problems, 0 when green.
 *
 * Checks:
 *  1. Every doctrine is defined once, has a Basis line, and uses a prefix registered in DOCTRINES.md.
 *  2. Every doctrine ID cited anywhere is defined (no dangling references).
 *  3. Every registered prefix points to an existing document.
 *  4. Every track listed in the root README has a README whose document table lists each of its
 *     documents, and every listed document exists (R-2, R-3).
 *  5. No secret-bearing file is tracked by git (R-5).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Any bold line shaped like a definition; a prefix that is not capital letters is reported, never skipped.
// The period must be followed by a space, the closing `**`, or the end of the line.
const DEFINITION = /^\*\*([A-Za-z0-9_-]+-\d+)\.(\s|\*\*|$)/;
const REGISTRY_HEADER = /^\|\s*Prefix\s*\|\s*Track\s*\|\s*Document\s*\|\s*$/;
const LEGAL_PREFIX = /^[A-Z]+$/;
const REFERENCE = /\b([A-Z]{2,}-\d+)\b/g;
const SECRET_FILE = /(^|\/)(\.env(\.[^/]*)?|.*\.pem|.*\.pfx|id_rsa[^/]*|credentials\.json)$/;
const ALLOWED_SECRET_LIKE = /(^|\/)\.env\.example$/;

export function checkRepo(root, { trackedFiles } = {}) {
  const problems = [];
  const read = (p) => readFileSync(join(root, p), "utf8");

  // All Markdown files outside dependencies, build output and .claude (agent worktrees there are copies).
  const markdown = [];
  (function walk(dir) {
    for (const name of readdirSync(join(root, dir))) {
      if (["node_modules", ".next", ".git", ".claude"].includes(name)) continue;
      const path = dir ? `${dir}/${name}` : name;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (name.endsWith(".md")) markdown.push(path);
    }
  })("");

  // Registered prefixes from the DOCTRINES.md ID table.
  const registry = new Map();
  if (!existsSync(join(root, "DOCTRINES.md"))) problems.push("DOCTRINES.md is missing.");
  else {
    // Only rows of the table that opens with the `| Prefix | Track | Document |` header are registry rows.
    let inRegistry = false;
    read("DOCTRINES.md").split("\n").forEach((line, i) => {
      if (REGISTRY_HEADER.test(line)) {
        inRegistry = true;
        return;
      }
      if (!line.startsWith("|")) inRegistry = false;
      if (!inRegistry) return;
      const m = line.match(/^\|\s*([^|`]+?)\s*\|\s*[^|]*\|\s*`([^`]+)`\s*\|$/);
      if (!m) return;
      for (const prefix of m[1].split(",").map((p) => p.trim()).filter(Boolean)) {
        if (!LEGAL_PREFIX.test(prefix)) problems.push(`DOCTRINES.md:${i + 1} registers prefix ${prefix}, which is not letters only.`);
        else registry.set(prefix, m[2]);
      }
    });
  }
  for (const [prefix, doc] of registry) {
    if (!existsSync(join(root, doc))) problems.push(`Prefix ${prefix} is registered to ${doc}, which does not exist.`);
  }

  // Definitions and references.
  const defined = new Map();
  const cited = new Map();
  for (const file of markdown) {
    const lines = read(file).split("\n");
    let inFence = false;
    lines.forEach((line, i) => {
      if (line.startsWith("```")) inFence = !inFence;
      if (inFence) return;
      const def = line.match(DEFINITION);
      if (def) {
        const id = def[1];
        const prefix = id.replace(/-\d+$/, "");
        const legal = LEGAL_PREFIX.test(prefix);
        if (!legal) problems.push(`${id} (${file}:${i + 1}) uses prefix ${prefix}, which is not capital letters only.`);
        if (defined.has(id)) problems.push(`${id} is defined twice: ${defined.get(id)} and ${file}:${i + 1}.`);
        defined.set(id, `${file}:${i + 1}`);
        if (!legal) {
          // Already reported as an illegal prefix; no second message.
        } else if (!registry.has(prefix)) problems.push(`${id} (${file}:${i + 1}) uses prefix ${prefix}, which DOCTRINES.md does not register.`);
        else if (registry.get(prefix) !== file) problems.push(`${id} is defined in ${file}, but ${prefix} is registered to ${registry.get(prefix)}.`);
        // A doctrine block runs until the next blank line followed by a heading or definition.
        const block = [];
        for (let j = i + 1; j < lines.length && !DEFINITION.test(lines[j]) && !lines[j].startsWith("#"); j++) block.push(lines[j]);
        // Repository rules and withdrawn doctrines (DOCTRINES.md, "Doctrine IDs") carry no Basis.
        const withdrawn = line.startsWith(`**${id}. Withdrawn.**`);
        const needsBasis = prefix !== "W" && prefix !== "R" && !withdrawn;
        if (needsBasis && !block.some((l) => l.startsWith("- Basis:"))) problems.push(`${id} (${file}:${i + 1}) has no "- Basis:" line.`);
      }
      for (const m of line.matchAll(REFERENCE)) {
        const prefix = m[1].split("-")[0];
        if (registry.has(prefix) && !cited.has(m[1])) cited.set(m[1], `${file}:${i + 1}`);
      }
    });
  }
  for (const [id, where] of cited) if (!defined.has(id)) problems.push(`${id} is cited at ${where} but defined nowhere.`);

  // Tracks and their lookup tables.
  const tracks = [];
  if (existsSync(join(root, "README.md"))) {
    for (const line of read("README.md").split("\n")) {
      const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+)\/`\s*\|/);
      if (m) tracks.push(m[2]);
    }
  }
  for (const track of tracks) {
    if (track === "archive") continue;
    const readme = `${track}/README.md`;
    if (!existsSync(join(root, readme))) {
      problems.push(`Track ${track} has no README.md.`);
      continue;
    }
    const text = read(readme);
    const listed = [...text.matchAll(/^\|\s*`([^`/]+\.md)`\s*\|/gm)].map((m) => m[1]);
    const present = readdirSync(join(root, track)).filter((n) => n.endsWith(".md") && n !== "README.md");
    for (const doc of present) if (!listed.includes(doc)) problems.push(`${track}/${doc} is not listed in ${readme} (R-3).`);
    for (const doc of listed) if (!present.includes(doc)) problems.push(`${readme} lists ${doc}, which does not exist.`);
  }

  // Secrets (R-5).
  const files = trackedFiles ?? gitFiles(root);
  for (const file of files) {
    if (SECRET_FILE.test(file) && !ALLOWED_SECRET_LIKE.test(file)) problems.push(`${file} is tracked by git and may hold secrets (R-5).`);
  }

  return { problems, stats: { documents: markdown.length, doctrines: defined.size, tracks: tracks.length } };
}

function gitFiles(root) {
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? ".";
  const { problems, stats } = checkRepo(root);
  if (problems.length > 0) {
    console.error(`FAIL: ${problems.length} problem(s) in ${relative(process.cwd(), root) || "."}`);
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  console.log(`OK: ${stats.doctrines} doctrines, ${stats.documents} Markdown files, ${stats.tracks} tracks.`);
}
