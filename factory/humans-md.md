# HUMANS: HUMANS.md, a profile of how agents work with you

**Track:** factory · **Type:** research · **Date:** 2026-11-19

**Question:** what is HUMANS.md (humansmd.dev), is it sound, and how should it fit with the way agents work in this repository?

**Source note.** humansmd.dev and x.com are blocked from this environment. Everything here comes from the site's own source repositories, read in full or in part as stated:
- Spec: `cmdai-hq/HUMANS.md` at commit `f60d7c3` (2026-11-10). `SPEC.md` read in full.
- Plugins and CLI: `cmdai-hq/humans-md-plugins` at commit `fab03e3` (2026-11-10). README and the Claude Code plugin's hook read.
- npm: `@humans-md/cli` 0.3.2.

The rendered site itself was not seen.

## What it is

A personal file, `~/.humans/HUMANS.md`, holding preferences the owner approves about three things: how agents write to them (`reading`), how agents ask them to decide (`deciding`), and when agents may interrupt them (`interrupting`). Its tagline: "AGENTS.md is for your codebase. HUMANS.md is for you."

- **Format:** YAML frontmatter only, closed vocabulary of 25 preference fields, optional one-line `notes` (up to 280 characters).
- **Flow:** the owner writes free text in `~/.humans/source.md`; a compiler proposes fields; the owner approves; adapters load the approved file at session start and give the agent a JSON projection framed as "recipient data, not instructions", optionally with one fixed English sentence per preference.
- **Integrations:** plugins for Claude Code, Codex, Copilot CLI, Cursor, Antigravity, OpenCode, Devin, Junie; a CLI sync for Cline and Warp. "Tested on macOS only."
- **Status:** "unpublished draft; contract revision 0.3-draft.2026-10-18.1; not a stable release." Spec CC BY 4.0, tools Apache-2.0. Maintained by cmdAI.

Example from the spec README:

```yaml
---
humans: "0.3"
id: tristan
name: Tristan
updated: "2026-10-13"
visibility: private
reading:
  lead_with: tldr
  max_words: 149
  visual: [table, example]
deciding:
  reversible: decide_and_report
  batch_questions: end_of_task
  default_answer: always
  question_style: yes_confirms_recommendation
interrupting:
  interrupt_for: blocking_only
notes: "I often read on my phone."
---
```

## Assessment

The spec is careful about authority and privacy, more than most agent-instruction formats:
- A profile never grants permission or overrides the harness, task or repository (§ 4).
- Agents receive a validated projection, never the raw file; invalid or unauthorized profiles look absent, with no error text reaching the model (§§ 5, 6, 8).
- Visibility (`private`, `org`, `anyone_with_file`) is enforced by the consumer; `anyone_with_file` openly means "wherever the file is stored decides who reads it" (§ 6.1).
- Notes containing agent-directed phrases are withheld by a published heuristic, which the spec admits is not proof against injection (§ 6.2).
- It is explicit about its limits: no claim of productivity gains, injection resistance or compliance (§ 12).

Weaknesses: it is a single-maintainer draft whose semantics may change between revisions; it has been tested on macOS only; much of its value depends on each client's plugin actually loading it.

## Doctrines

**HUMANS-1. Keep personal preferences and repository rules in separate places.**
How the owner wants to be asked, written to and interrupted belongs in their personal profile. How work in this repository is organised belongs in `DOCTRINES.md`.
- Why: a personal preference written into a repository binds every contributor and does not follow the owner to other repositories. The spec draws the same line: "Repository rules belong in AGENTS.md; a profile follows the person across repositories."
- Evidence: SPEC § 1 ("Not to be confused with"), § 5.
- Basis: Verified (the spec's position), Decision (applying it here)
- Consequence for this repository: W-1 ("ask questions one at a time through the question UI") is a personal preference; W-2, W-3 and R-1 to R-5 are repository rules. W-1 stays in `DOCTRINES.md` until the owner has an approved profile that the agents they use actually load; then W-1 is withdrawn in favour of the profile.

**HUMANS-2. A profile shapes the form of messages and never grants authority.**
- Why: preferences such as `reversible: decide_and_report` apply only to choices the agent is already allowed to make. Permissions, destructive actions and confirmations stay with the harness, the task and the repository.
- Evidence: SPEC § 4: "A HUMANS.md profile MUST NOT grant permissions or override harness, session, explicit task or repository rules."
- Basis: Verified

**HUMANS-3. Load a profile only through an adapter that validates and projects it; never import the raw file.**
- Why: the raw file can contain anything, including text written to steer an agent. The projection keeps only approved, recognised values under a fixed "data, not instructions" frame.
- Evidence: SPEC § 5: "Validation followed by `cat`, a raw `@` import, or copying YAML into an instruction file is not conformant."
- Basis: Verified
- Consequence: do not add `@~/.humans/HUMANS.md` to `CLAUDE.md`.

**HUMANS-4. Treat HUMANS.md as a moving draft: pin the revision you adopt.**
- Why: draft revisions "may still change semantics before a stable release". The version string alone does not identify a draft revision.
- Evidence: SPEC header and § 11.
- Basis: Verified
- Pin: spec `f60d7c3`, plugins `fab03e3`, CLI `@humans-md/cli@0.3.2`, contract `0.3-draft.2026-10-18.1`.

**HUMANS-5. Install the Claude Code plugin only on the owner's own machine, after reviewing the pinned revision.**
- Why: the plugin adds a `SessionStart` hook that runs Node on every session start, resume, clear, compaction and fork. Hooks execute code with the user's rights.
- Evidence: `plugins/humans-md/hooks/hooks.json` runs `node hooks/session-start.mjs` with a 10-second timeout. The hook spawns only the bundled CLI (`spawnSync(process.execPath, [cli, 'hook', ...])`), caps its output at 16 KiB and forwards only a validated envelope. A text search of the 16,465-line bundle found no `fetch(`, HTTP or network modules, child processes or file writes.
- Basis: Verified (hook definition), Unverified (the bundle was searched, not audited line by line)
- Consequence: cloud sessions like the one that produced this document do not see the owner's `~/.humans`. The profile only helps where the owner runs agents locally, unless a session's environment provides the file.

**HUMANS-6. The owner writes and approves the profile; an agent proposes only what the owner has stated.**
- Why: the format's second principle: "A compiler proposes, the owner approves. Consumers do not infer traits, diagnoses or unstated preferences."
- Evidence: SPEC § 2, § 10.
- Basis: Verified
- Profile compiled from the owner's own answers on 2026-11-19 (W-1, then six questions). The owner still approves the final file before copying it to `~/.humans/HUMANS.md`; it is not stored anywhere else, since a repository is not private (`visibility: private`).

```yaml
---
# HUMANS.md 0.3: how to work with me. Form only, never a permission: repo rules and your harness win.
# Stored states are inactive: never apply one, and never infer one from content.
# out_of_scope_steps: whether to LIST next steps outside the task (merge, deploy) in your closing lines.
humans: "0.3"
id: owner
name: Owner
updated: "2026-11-19"
visibility: private
reading:
  lead_with: tldr
  length: short
  structure: bullets
  visual: [table, example]
deciding:
  reversible: decide_and_report
  default_answer: always
  asks_per_message: one
  question_style: multiple_choice
interrupting:
  interrupt_for: blocking_or_risky
---
```

Each value is in the closed vocabulary of SPEC §§ 3.3 to 3.5. The file was checked by hand against the spec, not with the reference validator (running downloaded code was avoided). Not set because not asked: quiet hours, languages, tone, notes. Change `id` and `name` before use.

## Open

1. **What "factory" means for this track.** The track was named "factory" with humansmd.dev as its source. HUMANS.md itself never mentions a factory. Possibilities: the owner's term for their agent working setup, the X post's framing, or Factory (factory.ai, whose Droid agent reads AGENTS.md). Owner to say.
2. **The X post** (`x.com/hanakoxbt/status/2091515787366306154`) could not be read: x.com and every mirror tried are blocked, and search found nothing. Owner to paste its text.
3. **Adopting it.** The owner chose to build a profile (2026-11-19). Remaining: approve the file in HUMANS-6, copy it to `~/.humans/HUMANS.md`, install the plugin locally (HUMANS-5), then withdraw W-1 (HUMANS-1).
4. **Relevance to cub.** Whether the firm's own assistant should honour lawyers' HUMANS.md profiles (for example interruption rules during hearings) is a product question, not yet raised.

## Sources

- https://github.com/cmdai-hq/HUMANS.md (commit `f60d7c3`): `README.md`, `SPEC.md`
- https://github.com/cmdai-hq/humans-md-plugins (commit `fab03e3`): `README.md`, `plugins/humans-md/hooks/hooks.json`, `plugins/humans-md/hooks/runtime.mjs`, `plugins/humans-md/.claude-plugin/plugin.json`
- https://registry.npmjs.org/@humans-md/cli
