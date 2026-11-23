# PPACK: How pstack is packaged, ported, checked and automated, and what Qara and csf should take from it

**Track:** pstack · **Type:** research · **Date:** 2026-11-23

**Question:** how does pstack ship as a Cursor plugin and a generated Claude Code plugin, what does its generator and CI actually guarantee, what does installing it ask a user to accept, what do its benny automation pack and `make-bot-ui` do and need, and is any of that worth having in Qara or csf given that the owner has ruled out installing external machinery?

**Scope.** `pstack/` manifests, README and LICENSE; the generated copy `harness/pstack/`; `scripts/`, `schemas/`, the two root marketplace manifests, `.github/workflows/`, `third_party/` (looked at for its role only); `pstack/automations/benny/` in full; `pstack/skills/make-bot-ui`; `pstack/skills/setup-pstack` only for where it writes its rule file; `pstack/docs/guide/README.md`, `01-setup.md` and `pstack/docs/harness/claude-code.md`. The other six documents own the content of the skills and playbooks: PMODE (routing), PPRIN (principles), PPAR (parallel work, autonomous runs, shipping), PPROOF (verification), PLEARN (memory, recall, explanation), PWRITE (writing and style). They are cited here only where packaging or an install step touches them.

**Sources.**
- pstack in `cursor/plugins` at commit `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` (2026-11-21), a shallow clone, read only. Paths without a prefix are relative to the repository root of that clone. Nothing was run: no script, no node, no install, no `/plugin` command.
- Qara at `$HOME/qara`, read 2026-11-23: `package.json` (the `check:*` entries), `config/harnesses.toml`, `scripts/{harnesses-codegen,settings-render,harness-topology,harness-topology-rows,harness-links,codex-sync,check-mode-parity,check-skill-definitions,nightly-ops}.ts`, `scripts/lib/codex-link-reconciliation.ts`, `.claude/settings-src/{base,linux,mac}.json`, `.claude/skills/{sync-host,docs-sync,triage-issue,triage-resolution,core/skill-structure.md}`, `.claude/context/hooks-guide.md`.
- csf-build as installed in `/media/ssdev/tg-pro/cub/node_modules/csf-build` (read only; nothing run in cub): `package.json`, `src/distribution/`, `src/admission/csf-admit.ts`.
- tobogan: `noodle/cli-config-observability.md` (NVIEW-10 and NVIEW-16), `board/README.md`, `board/vercel-board.md` (BOARD-13), `DOCTRINES.md`.

"Verified" means read in the clone or in the Qara and csf files, with `path:line`. Every judgement about fit for Qara or csf is Unverified until tested. Nothing here is Tested.

**Short answer.**
- Removals first. Of the roughly 3,700 lines of Qara and csf code in the packaging area that I counted, about 350 could go: the report-only topology audit (`harness-topology.ts`, 236 lines, "NOT wired into any blocking commit/push gate") and the trigger-overlap check (`check-skill-trigger-overlap.ts`, 120 lines), each replaced by a written audit workflow. About 600 more could shrink after reading. The rest guards live hosts, settings, links or admission, and stays code. pstack offers no prose equivalent for any of them: its packaging is a generator, a CI check and a table, and its automation pack is prose with no enforcement behind it.
- pstack is one source directory (`pstack/`) that is a Cursor plugin as it stands. Claude Code gets a second, generated plugin in `harness/pstack/claude-code/`. The generator copies skills, agents, guide, README and licence almost byte for byte, adds one "read the adapter" line to 22 of the 58 skills, and rewrites links to files the copy leaves out. It does not rewrite Cursor tool names. A table (`pstack/docs/harness/claude-code.md`) tells the model to translate them at run time.
- CI checks the generated copy byte for byte against what the generator would write, but only on pull requests that touch listed paths. It does not run the docs-versus-tree checker (`scripts/check-pstack-docs.mjs`) and does not run the `poteto-mode` script tests. "Cursor-only steps are skipped with a one-line note" is a prose rule in the adapter. No code enforces it.
- Installing means adding a marketplace and a plugin: 58 skills, 22 playbooks and 2 agents (124 Markdown files under `skills/` and `agents/`), plus scripts. 57 of the 58 skills are marked `disable-model-invocation: true`, so they run only when the user types them. One script (`poteto-mode/scripts/bootstrap.ts`) runs `bun install --frozen-lockfile` on first use of a tool. `setup-pstack` writes an always-loaded rule file under `~/.claude/rules/`.
- benny is a Slack triage and reproduce-and-fix pack for Cursor Automations. It is built from prose rules: frozen thread coordinates, one Slack poster, a marker handshake between the two automations, fail closed when anything is missing, draft pull requests only. Nothing in it is code. It cannot run outside Cursor. `make-bot-ui` is the riskiest file in the plugin: it binds a server to `0.0.0.0`, serves plain HTTP, handles a webhook key, and tells the agent to run `curl ... | sudo sh`.
- For Qara, the generated-copy method is not better. Qara has no copies to go stale: its skills are one tree reached by symlink from each harness, and the places where harnesses differ (settings, registry, Codex config) are already generated with a `check` command. The one idea that transfers is small: a check that every harness-specific term used in a skill has a row in a translation table.
- For cub's issue intake, benny's Slack and tracker plumbing is of no use. Four of its rules are worth writing into csf's existing admission and triage text if the owner agrees: verify an existing fix before authoring one, reproduce twice before calling it a repro, do not race a person who claimed the fix, and compensate a ticket when the follow-up step fails.
- Trial install versus copying under MIT: the trial costs a third-party marketplace entry, a persistent plugin cache, and an always-loaded rule file, on a host whose settings Qara renders and checks. Copying costs nothing in machinery but carries a duty to keep the copyright and permission notice. Neither is needed to take the borrows below, which are conventions and one check.

## Doctrines

**PPACK-1. Treat `pstack/` as one plugin directory with three manifests, and quote the keys from the files, not from the README.**
`pstack/plugin.json` is the neutral manifest (`$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) with keys `name`, `version` (`0.15.46`), `description`, `author {name: "Lauren Tan"}`, `homepage`, `repository`, `license` (`MIT`), `keywords`. `pstack/.cursor-plugin/plugin.json` adds `displayName`, `logo` (`assets/logo.png`), `category` (`developer-tools`), `tags`, and the two path keys `"skills": "./skills/"` and `"agents": "./agents/"`. The generated tree has `plugin.json` and `.claude-plugin/plugin.json`, both byte copies of `pstack/plugin.json`, with no `skills` or `agents` key.
- Why: a reader who copies "the manifest" copies one of three different files. The Claude Code manifest names no component paths, so it relies on Claude Code finding `skills/` and `agents/` by their default directory names. That is the client's behaviour, not something the repository states.
- Evidence: `pstack/plugin.json`; `pstack/.cursor-plugin/plugin.json`; `scripts/generate-pstack-harness-trees.mjs:15` (`MANIFESTS = ["plugin.json", ".claude-plugin/plugin.json"]`) and `:137` (both written from `pstack/plugin.json`); `schemas/plugin.schema.json` (`required: ["name"]`, `additionalProperties: false`, `name` pattern `^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$`, optional `minClientVersions` with keys `cursor`, `grokbot`, `sand`, and the string `"never"` to hide a plugin from a client). Note that `pstack/plugin.json` itself has a `$schema` key that the Cursor schema would reject (`additionalProperties: false`), which is why only the `.cursor-plugin/` file is validated against it (PPACK-2).
- Basis: Verified (files); that Claude Code discovers the directories without a path key is Unverified.
- Code: `pstack/plugin.json`, `pstack/.cursor-plugin/plugin.json`, `harness/pstack/claude-code/{plugin.json,.claude-plugin/plugin.json}`.

**PPACK-2. Know which manifests are schema-checked and which are only name-checked.**
`scripts/validate-plugins.mjs` validates `.cursor-plugin/marketplace.json` and each plugin's `.cursor-plugin/plugin.json` against the two JSON Schemas with Ajv. For the Claude Code marketplace it checks only that each entry's source holds `.claude-plugin/plugin.json` and that the `name` matches. It then compares `version` across `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json` and `plugin.json` inside each plugin directory and fails on a mismatch.
- Why: the Claude manifests carry no schema guarantee in this repository, and the version check runs inside each source directory, not across `pstack/` and `harness/pstack/claude-code/`. Equality across the two is enforced only indirectly, by the byte check of the generated copy (PPACK-5).
- Evidence: `scripts/validate-plugins.mjs:34-49` (Cursor marketplace schema), `:52-93` (per plugin, schema plus name match), `:95-117` (Claude marketplace: existence and name only), `:119-145` (version equality per directory). `.claude-plugin/marketplace.json` has `name: "cursor-plugins"`, `owner {name: "Cursor", email: "plugins@cursor.com"}` and two plugins: `origin-apps` (source `./origin-apps`) and `pstack` (source `./harness/pstack/claude-code`). `.cursor-plugin/marketplace.json` lists the whole catalogue (`teaching`, `cursor-team-kit`, `orchestrate`, `pstack`, `dyl-stack` and others, with `source` `pstack` for pstack). The marketplace schema allows only `name`, `owner`, `metadata`, `plugins` at top level and `name`, `source`, `description`, `minClientVersions` per entry.
- Basis: Verified
- Code: `scripts/validate-plugins.mjs`, `schemas/*.json`. Gap: no schema for the Claude manifests.

**PPACK-3. The generator is a copier plus one rewrite plus one link fixer, and its list of what it copies is the whole contract.**
`scripts/generate-pstack-harness-trees.mjs` writes `harness/pstack/` from: every file under `pstack/skills` and `pstack/agents` and `pstack/docs/guide`, plus `docs/harness/claude-code.md`, `README.md`, `LICENSE` and `plugin.json`. It leaves out `pstack/automations`, `pstack/assets`, `.cursor-plugin/` and `.gitignore`. It writes a `harness/pstack/README.md` that says "Do not edit it by hand". For each skill whose `SKILL.md` has an H1 and uses a Cursor name (PPACK-4), it inserts one line after the H1. It rewrites a relative Markdown link to a pstack file the tree leaves out into an absolute `https://github.com/cursor/plugins/{blob|tree}/main/pstack/<path>` link. It preserves the executable bit. It deletes and rebuilds `harness/pstack/` on every normal run.
- Why: nothing else changes. The scripts (including the whole `statechart` test corpus) travel into the Claude Code plugin unchanged, so the installed plugin is about 7.4 MB in 539 files, against 553 files and 7.9 MB for `pstack/`.
- Evidence: `generate-pstack-harness-trees.mjs:7-26` (paths and README text), `:118-149` (`render()`), `:128-135` (the inserted line), `:136-137` (licence, manifests), `:138-147` (link rewrite, using `GITHUB = "https://github.com/cursor/plugins"` at `:17`), `:151-165` (fail when a link leaves `pstack/` or points inside the tree at a missing file), `:180-185` (rebuild, `chmod`). The inserted line reads: "In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code." Counted in the clone: 22 of 58 `SKILL.md` files carry it (`arena`, `poteto-help`, `poteto-mode`, `swarm`, `setup-pstack`, `make-bot-ui` and others). `pstack/README.md` differs in one paragraph (the benny links become GitHub URLs). `docs/guide/01-setup.md` is identical in both trees.
- Basis: Verified
- Code: `scripts/generate-pstack-harness-trees.mjs`.

**PPACK-4. The port is a run-time translation done by the model, driven by a regex list, not a rewrite of the skills.**
The generator classifies each skill by scanning every `.md` file in it against 22 patterns (`TERMS`): `Task`, `AskQuestion`, "todolist", `generalPurpose`, `poteto-agent`, `comment-sicko`, `readonly: true|false`, `environment: "cloud"|"local"`, `cloud_base_branch`, `run_in_background`, `resume`, `file_attachments`, `claude-<family>-<n>`, `grok-<n>`, `gpt-<n>`, `inherit-parent`, `pstack-models.mdc`, `.cursor/skills/`, `~/.cursor/plugins/` or `.cursor-plugin`, `.cursor/rules/`, `agent-transcripts` or `.cursor/projects`, and Cursor-only product names (Bugbot, Cursor Automation, cloud agent, built-in PR tool), plus one pattern for "run the **name** skill" without a link. A skill that matches any of them gets the adapter line. The adapter's four tables (Tools, Subagent fields, Models, Paths) then say what each becomes: `Task` is `Agent`, `AskQuestion` is `AskUserQuestion` (absent in `-p` mode, so ask in plain text), `readonly: true` is `subagent_type: "Explore"` plus a "do not edit files" line and a `git status` check, `environment: "cloud"` is `isolation: "worktree"`, `resume` is "spawn a new agent and paste the earlier result", a Cursor model slug such as `claude-opus-5-5-xhigh` becomes `model: "opus"` and `effort: "xhigh"`, a non-Claude slug is dropped and the session model runs. The two agent files are copied unchanged, so `poteto-agent.md` still carries `model: claude-opus-5-5-xhigh-fast`, and the adapter tells the parent to pass `model` and `effort` on every spawn so that slug never reaches the API.
- Why: it keeps one text for two clients, at the price that the Claude Code run depends on a model reading a table once per session and applying 30-odd mappings correctly every time. A skill that does not match any pattern (36 of 58) gets no line and is assumed to be portable.
- Evidence: `generate-pstack-harness-trees.mjs:28-51` (`TERMS`), `:52` (`ROUTE_KEY`), `:69-85` (`classify`), `:99-102` (the check that the adapter text contains each key the skills use: `adapter.includes(key)`, a substring test, so a table row that merely mentions the key passes). `pstack/docs/harness/claude-code.md:3` ("If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects."), `:12` ("The `Skill` tool refuses most pstack skills"), `:21`, `:22-23`, `:35-39`. `pstack/agents/poteto-agent.md:1-6` (frontmatter `is_background: true`, `model: claude-opus-5-5-xhigh-fast`).
- Basis: Verified (mechanism); whether the translation is reliable in practice is Unverified.
- Code: `pstack/docs/harness/claude-code.md`; the classifier above. Gap: no test that a skill text and the adapter agree beyond the substring check.

**PPACK-5. CI detects a stale generated copy by regenerating in memory and comparing bytes and the executable bit, but only for pull requests that touch listed paths.**
`node scripts/generate-pstack-harness-trees.mjs --check` builds the expected tree in memory, reads `harness/pstack/`, and lists up to 20 paths that are missing, extra, differ in bytes, or differ in the executable flag. On any difference it prints `harness/pstack is out of date. Run \`node scripts/generate-pstack-harness-trees.mjs\` and commit the result.` and exits 1. `.gitattributes` marks `harness/pstack/**` as `linguist-generated=true`.
- Why: this is the strongest part of the method. Drift is unauthorable in a reviewed PR. Its limit: the workflow triggers only on `pull_request` with `paths` `.cursor-plugin/marketplace.json`, `.claude-plugin/marketplace.json`, `**/plugin.json`, `schemas/**`, `pstack/**`, `harness/**`, `scripts/**` and the workflow file. A direct push to the default branch is not checked by this workflow, and nothing here shows whether pushes are blocked. The workflow installs `ajv`, `ajv-formats` and `fast-check@4.5.3` with `npm install --no-save` (the first two unpinned).
- Evidence: `generate-pstack-harness-trees.mjs:167-178`; `.github/workflows/validate-plugins.yml:1-13` (trigger and paths), `:25-26` (install), `:28-29` (validate), `:31-32` (the `--check` step), `:34-35` (tests). `.gitattributes:1`.
- Basis: Verified
- Code: `scripts/generate-pstack-harness-trees.mjs --check`, `.github/workflows/validate-plugins.yml`.

**PPACK-6. Two checks the repository has are not in CI, and one test set is outside CI's glob.**
`scripts/check-pstack-docs.mjs` (README and guide against the tree: slash commands, relative links and anchors, counts such as "twenty-three playbooks", `subagent_type` names, model names) is not referenced by the workflow, the README or the generator. A search of the clone for its name finds no caller. The CI test step runs `node --test pstack/skills/*/scripts/test/*.test.ts`. Only `statechart` has a `scripts/test/` directory. The `poteto-mode` tests (`scripts/watch-pr/*.test.ts`, run by `bun test watch-pr` through that package's `test` script) match no part of the glob.
- Why: README claims such as "ci fails while the generated copy is out of date" are true for the copy and not for the prose checks. The docs checker is a good design (PPACK-7) that depends on a person running it.
- Evidence: `.github/workflows/validate-plugins.yml:35`; `pstack/skills/poteto-mode/scripts/package.json` (`"test": "bun test watch-pr"`); `fd` for `test` directories under `pstack/skills` finds `statechart/scripts/test/` and a skill named `principle-test-behavior-not-implementation` only; `pstack/README.md:32` ("ci fails while the generated copy is out of date"). The step also needs a Node with TypeScript stripping; `statechart/scripts/statechart` selects node 22.18+ or 23.6+ by version arithmetic (`:11-18`).
- Basis: Verified (absence rests on a clone-wide search with no hit)
- Code: Gap: no CI step for `check-pstack-docs.mjs`; none for the `poteto-mode` tests.

**PPACK-7. The docs-versus-tree checker is the one pstack check worth copying in spirit: it makes a stated count or a named command a tested claim.**
It lists skills, playbooks, agents from the tree and then fails on: a "the N skills/principles/playbooks/agents" count that disagrees with the tree (it reads number words up to ninety-nine and ignores subset phrases such as "three playbooks scale it up"); a `/name` that no pstack skill, no `cursor-team-kit` skill and no listed built-in provides (an `EXTERNAL` allow list of six names, with a rule that a name is added only after a public doc shows it, and a `RENAMED` map); a relative link or `#anchor` that does not exist; a `subagent_type` that `agents/` does not ship; a model id or "opus 5.5" that `setup-pstack` does not use; a skill, playbook or agent that the README does not list.
- Why: it is what keeps a 290-line README and ten guide pages true while the tree changes. The costs: it is bespoke regex over prose, and it only reaches claims of a fixed shape.
- Evidence: `scripts/check-pstack-docs.mjs:16-19` (allow list, rename map), `:21-29` (patterns), `:76-124` (the claim, slash, link, agent and model checks), `:126-135` (README lists every skill, playbook, agent). `pstack/README.md:53` says "twenty-two playbooks", and the tree has 22 playbook files.
- Basis: Verified
- Code: `scripts/check-pstack-docs.mjs`. Qara compare: `check:stated-caps`, `check:doc-citations`, `check:doc-terms`, `check:indexes` exist (PPACK-15); whether they cover a prose count of skills was not checked.

**PPACK-8. The install and update path puts the trust decision on a third-party marketplace with a manual update by default, and the README's auto-update statement is the vendor's claim about the client.**
Cursor: `/add-plugin pstack`. Claude Code: `/plugin marketplace add cursor/plugins`, then `/plugin install pstack@cursor-plugins`. The README says: "claude code leaves auto-update off for third-party marketplaces, so pstack stays on the version you installed. to turn it on, run `/plugin`, open the **marketplaces** tab, select `cursor-plugins`, and choose **enable auto-update**. to update once by hand, run `claude plugin update pstack@cursor-plugins`." The Claude marketplace entry for pstack has no `version`, commit or hash: it points at a directory, and what is installed is whatever that directory holds at install or update time. The plugin's own `version` (`0.15.46`) is a string the author edits.
- Why: what a user accepts by installing is the whole directory in PPACK-3: 124 Markdown files of agent instructions, two agent definitions, and scripts, from an author who can change them with the next push. A reader should treat each update as new instructions to review, as NVIEW-16 found for Noodle's unpinned `INSTALL.md` fetches. Auto-update off is a safer default but needs the client behaviour to be as stated.
- Evidence: `pstack/README.md:15-32`; `pstack/docs/guide/01-setup.md:5-15`; `.claude-plugin/marketplace.json`; `noodle/cli-config-observability.md` NVIEW-16 item 1.
- Basis: Verified (what the files say); the client's auto-update default is Unverified.
- Code: not applicable. Qara's `base.json:664-670` already has one `extraKnownMarketplaces` entry (`svelte`, `sveltejs/ai-tools`), and `mac.json:7-10` has `enabledPlugins` for two LSP plugins, with `enabledPlugins` treated as a host-local key (`scripts/lib/live-settings-diff.ts:32`). So Qara tolerates plugins; the owner's ruling is about pstack, not about the mechanism.

**PPACK-9. Executable content rides along in the plugin, and one script installs dependencies on first use.**
Scripts in the plugin: `poteto-mode/scripts/watch-pr/` (a Bun CLI, with `bootstrap.ts`, `package.json` depending on `commander` `14.0.0` and `bun.lock`), `poteto-mode/scripts/worktree-audit.sh` (documented read-only: "Never deletes anything"), `show-me-your-work/scripts/log.sh` (appends a TSV row, neutralises spreadsheet-formula prefixes), and the `statechart` TypeScript pipeline with a launcher script and a corpus of TLA+ examples. `bootstrap.ts` runs `Bun.spawnSync([process.execPath, "install", "--frozen-lockfile"], { cwd: scriptsDirectory })` when `node_modules` or its install-key hash is missing, then restarts the same command.
- Why: the first run of `watch-pr` fetches packages from the registry into the plugin's own directory, with no prompt other than the one the agent gets for running the command. The frozen lockfile pins versions; it does not remove the supply-chain exposure and it does not need the user's consent as such. `bun` must exist on the host. Qara forbids a foreign installer writing a second lockfile (global CLAUDE.md, `check:pm-integrity`); here it is Bun in a vendor directory.
- Evidence: `pstack/skills/poteto-mode/scripts/bootstrap.ts:25-62`; `.../watch-pr/watch-pr:1-5`; `.../scripts/package.json`; `show-me-your-work/scripts/log.sh:1-40`; `worktree-audit.sh:1-8`; `statechart/scripts/package.json` (`devDependencies`: `fast-check` `4.5.3`); `statechart/scripts/statechart:11-18`.
- Basis: Verified
- Code: not applicable (we do not install). Content owned by PPAR (`watch-pr`), PLEARN or PPROOF (`log.sh`, `statechart`).

**PPACK-10. `setup-pstack` is the only skill that writes outside the project, and it writes one rule file whose location is the whole harness difference.**
Cursor: `~/.cursor/rules/pstack-models.mdc` with frontmatter `description`, `alwaysApply: true`. Claude Code: `~/.claude/rules/pstack-models.md`, "with no frontmatter, then the comment lines, the `# budget` line, and one line per role", "Overwrite the whole file. Never put the role lines in `CLAUDE.md` or `AGENTS.md`." The file holds nine role lines (`feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, `judgment and prose`, `arena runners`, `arena cross-judge pool`, `swarm workers`, `interrogate reviewers`) with Cursor model slugs, a `# defaults: 3` marker and a `# budget` line. The skill also offers once to generate a project verification skill and a formal verification skill.
- Why: an always-loaded file steers every later session, so it is the persistence point of the whole trial. The Cursor slugs in it are mapped by the adapter. The file also decides models for the roles, which in Qara is owned by the model roster in `settings-src` and the routing docs (PMODE and PPAR cover the roles themselves).
- Evidence: `pstack/skills/setup-pstack/SKILL.md:8,48-68`; `pstack/docs/harness/claude-code.md:38,41-47`; `pstack/docs/guide/01-setup.md:15,25`. That Claude Code loads every `.md` in `~/.claude/rules/` is the adapter's statement, Unverified here.
- Basis: Verified (file contents); client behaviour Unverified.
- Code: not applicable. Gap for a trial: Qara's `check:live-settings` and `harness-topology` row set do not list `~/.claude/rules/pstack-models.md`; whether they would flag it was not tested.

**PPACK-11. MIT with one copyright holder: copying text means carrying the notice, and nothing else in the repository adds a duty.**
`pstack/LICENSE` is the standard MIT text, "Copyright (c) 2026 Lauren Tan". The condition: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." No skill file has its own licence header (a clone-wide search of skills, agents and automations for `copyright`, `licence`, `adapted from`, `based on`, `inspired by` finds nothing that credits a third party), there is no NOTICE file, and `comment-sicko` treats licence headers in code as comments to keep. `third_party/*` carries separate licences (for example `third_party/google-slides/LICENSE`) and is not part of pstack. `dyl-stack` is an in-repo precedent for building on pstack: it layers its own skills and routes through `poteto-mode` without copying pstack text.
- Why: copying one principle file or a paragraph is a "portion". Whether a short quotation or a restatement in our own words is a "substantial portion" is a legal question; the safe practice is a one-line source and licence reference in any file that copies pstack text verbatim, and a copy of the licence in the folder.
- Evidence: `pstack/LICENSE:1-17`; `pstack/plugin.json` (`"license": "MIT"`); `pstack/agents/comment-sicko.md:16`.
- Basis: Verified (the text); the legal reading is Unverified and not legal advice.
- Code: Gap: neither Qara nor csf has a place for third-party notices that was found in this pass.

**PPACK-12. benny is two Slack-triggered Cursor automations plus a setup procedure, all instruction files, installed by an agent that copies and merges.**
The pack: `FOR_AGENTS.md` (the human's intent, lower-case prose, then agent steps), `README.md`, three `SKILL.md` (`skills/setup-benny`, `skills/triage-issue-reports`, `skills/reproduce-and-fix-issues`, each `disable-model-invocation: true`), `references/` (`routing.example.md`, `control-adapter.md`, `verify-existing-fix.md`, `feature-map.example.md`), `templates/` (`configuration.example.yaml`, `triage-automation-prompt.md`, `reproduce-automation-prompt.md`). Setup: the human points Cursor at `FOR_AGENTS.md` and names a repository; the agent merges the whole pack into `<target-repository>/.cursor/automations/benny/` "preserving every destination-only file", merges `{"plugins":{"pstack":{"enabled":true}}}` into the target's `.cursor/settings.json` (jsonc-aware), checks from a fresh agent that nine pstack skills resolve at project scope, creates the two live automations one at a time through Cursor's built-in `/automate` skill, and runs a seven-point thread-safety test before enabling.
- Why: it is a sound shape for something that touches a team channel: nothing is enabled until a test passes, config lives outside the copied pack so a refresh cannot overwrite it, and the live prompts read committed repository paths, never a plugin cache path. It is also an install done by an agent following prose, with a "merge, review diffs, ask if ambiguous" rule where csf has code (PPACK-16).
- Evidence: `pstack/automations/benny/FOR_AGENTS.md:55-89`; `README.md:7-23`; `skills/setup-benny/SKILL.md:17-69` (copy and settings), `:166-241` (create via `automate`), `:243-247` ("Never call a direct automation backend service ... Never build or open a Cursor protocol deep link"), `:249-265` (the seven checks). `pstack/README.md:284-286` ("benny runs on cursor automations, so it is cursor-only"). The adapter lists "Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests" as skip-with-a-line (`claude-code.md:65`), and the generator leaves `automations/` out of the Claude tree.
- Basis: Verified
- Code: none; the seven checks are manual. Gap: no script validates the configuration YAML or the feature map.

**PPACK-13. benny's safety is a set of prose invariants that are well chosen and unenforced by code; the two best are the marker handshake and the single poster.**
Triage freezes `SOURCE_CHANNEL_ID` and `SOURCE_THREAD_TS` before anything else, preflights the parent before every write, posts exactly one threaded verdict ending in one marker (`[benny:bug]`, `[benny:performance]`, `[benny:other]`, optionally `tracker=<url>`), creates a ticket only for a clear new live bug with no plausible duplicate, and compensates (cancel, close or delete the ticket and verify) if the verdict does not land. Repro starts only when the marker comes from the configured triage identity as a reply in that thread, stops when a person claims the fix, switches to verify mode when a pull request or merged commit exists, needs the exact symptom twice through real UI, lets state inspection confirm but never inject, needs a read-only media review that the evidence shows the broken state, tries one bounded fix only after a rejection window passes with no valid rejection, proves it with before and after recordings, smokes the blast radius, and opens a draft pull request only. "No confirmed repro means no authored fix." Delegated workers are read-only with "no Slack credentials or write actions", and "If worker isolation cannot enforce those limits, do the work in the coordinator."
- Why: the pack does name the failure modes (a root post in a public channel, a duplicate ticket, a competing patch, a faked repro) and gives each one a gate. All of it depends on the Cursor automation runtime honouring tool isolation and on the model following 15 numbered sections; the only test is a human running seven checks once.
- Evidence: `skills/triage-issue-reports/SKILL.md:13-28` (hard rules), `:30-42` (freeze), `:127-142` (tracker adapter contract and "If a required operation is unavailable, fail closed for that write"), `:144-183` (dedupe, create gates), `:200-228` (verdict, marker contract, compensation), `:230-240` (one follow-up window). `skills/reproduce-and-fix-issues/SKILL.md:13-32`, `:56-78` (marker wait), `:80-103` (ownership and artifact gates), `:163-183` (repro twice), `:185-216` (media review, rejection window), `:226-238` (fix gate), `:284-299` (draft PR only; "Never merge or deploy from this workflow"). `references/verify-existing-fix.md:19-60` (baseline twice, patched twice, three outcomes), `references/control-adapter.md:11-125` (seven capabilities) and `:155-169` (a nine-step setup check). Weak lines: "Use only the configured marker strings" proves identity only as far as a Slack user id in a config file; "Prefer no ticket over a guessed or duplicate ticket" is a preference, not a measure.
- Basis: Verified (text); that it works is Unverified, and not testable here.
- Code: none. Qara compare: PPACK-17.

**PPACK-14. benny needs a Slack integration with read and thread-reply rights, a tracker integration, a repository integration that can open a draft pull request, an app-control skill, and optionally a bot token; it opens no listener of its own.**
Configuration lives in `configuration.example.yaml` (copied outside the pack, for example `.cursor/benny/configuration.yaml` or `~/.config/benny/configuration.yaml`): `schema_version`; `automations.{triage_name,reproduce_name}`; `slack.{source_channel_id, operations_channel_id, triage_identity_user_id, read_action, thread_post_action, file_download_action, operations_edit_action, prefer_cursor_actions, optional_bot_token_env: "BENNY_SLACK_BOT_TOKEN", allow_source_root_posts: false, allow_worker_slack_writes: false}`; `repository.{url, default_branch, pull_request_action, pull_request_url_format, draft_only: true}`; `tracker.{type, adapter_skill_name, team, project, labels.{bug,performance,intake,needs_repro}, status, source_link_title, require_compensation_action: true}`; `routing.{map_path, owner_pings_default: false, allow_feature_owner_ping, allow_confirmed_regression_author_ping}`; `control.{skill_name, feature_map_path, environment, artifact_directory: "/tmp/benny-artifacts", artifact_retention_hours: 24}`; `verdict_markers`; `status_emoji`; `budgets` (`poll_seconds: 45`, `verdict_wait_minutes: 45`, `triage_follow_up_minutes: 10`, `triage_total_minutes: 30`, `repro_minutes: 60`, `rejection_window_minutes: 10`, `fix_minutes: 90`, `operations_follow_up_minutes: 45`); `models` (four roles). The trigger is a Cursor automation Slack trigger with `source_channel_id`, `message_ts`, `thread_ts`. The only secret named is `BENNY_SLACK_BOT_TOKEN`, "to fill a narrow gap such as editing one operations status message or downloading an attachment", "in a secret manager or environment, not in YAML". The control adapter is the user's own skill and must supply bring-up, real-UI driving, read-only inspection, screenshots, screen recording and cleanup.
- Why: the credential surface is small and mostly delegated to Cursor's integrations, which is the right instinct. Committed configuration still holds channel ids, a triage user id and tracker team names ("secret-free", not private), and the artifact directory is world-readable `/tmp` by default. The hard dependency is the control adapter: with none, repro "must fail closed", so the "fix with UI evidence" half exists only where a user has already built a UI-driving skill.
- Evidence: `templates/configuration.example.yaml:1-84`; `skills/setup-benny/SKILL.md:93-115` (required choices), `:117-137` (capabilities, "Do not use undocumented integration endpoints"), `:150-164`; `FOR_AGENTS.md:38-53`.
- Basis: Verified
- Code: none.

**PPACK-15. The list of what benny does without a human is short and bounded: reply once in a thread, create or update a ticket, post status in an operations channel, open a draft pull request.**
No merge, no deploy, no root post in the source channel (stated as a boundary four times), owner pings off by default, one reply per run, a fixed follow-up window, and a stop rule ("Stop when asked"). One root post is allowed, in the optional operations channel only.
- Why: that is a small, auditable action set, and the rule that a bot is "evidence, not delegation or fix ownership" (a rule for reading other bots' messages) is a good one. The unattended part is the trigger itself: each new top-level report in the channel starts both automations with no approval step, and the ticket creation, ticket update, and draft PR happen inside the run.
- Evidence: `FOR_AGENTS.md:26-36`; `skills/triage-issue-reports/SKILL.md:13-28`; `skills/reproduce-and-fix-issues/SKILL.md:105-124` (operations thread), `:284-299`, `:301-310`.
- Basis: Verified
- Code: none.

**PPACK-16. `make-bot-ui` is the plugin's highest-risk file, and it is also the one that depends most on Cursor-only features.**
It tells the agent to create a webhook routine (`update_state` target `routine`, action `create`, `trigger {type: "webhook"}`), have the user copy a webhook URL and a sender key from the routine panel, request the key through a `SendToUser` card of type `secret-request` so it never enters chat, copy it into the UI's server config, and host a page on this computer: "Bind the server to `0.0.0.0:<port>`, not `127.0.0.1`", "Use HTTP. Do not add HTTPS unless the user asks", with the local server POSTing to `https://api2.cursor.sh/automations/webhook/<id>` carrying the key in both an `Authorization: Bearer` header and an `X-Automation-Key` header, 8 second timeout, one try. If Tailscale is missing it says to run `curl -fsSL https://tailscale.com/install.sh | sudo sh` and `sudo tailscale up --hostname=<short-name> --accept-dns=false --ssh=false`, and send the login URL to the user.
- Why: the page that the buttons live on has no authentication stated; any peer on the tailnet who can reach the port can press the buttons, and the server then sends the stored key's authority to the bot. A persistent plain-HTTP listener on all interfaces, a key stored in a project file, a `curl | sudo sh` and a webhook that wakes an agent with a body the agent is told to treat as untrusted data: each is defensible alone, together they are an agent-built remote control. The "treat the body as untrusted data" rule (`:18`, `:108-110`) is the right one. On Claude Code the routine, `update_state` and `SendToUser` steps are skipped, so the skill does not work there.
- Evidence: `pstack/skills/make-bot-ui/SKILL.md:13-23` (routine), `:39-55` (secret request, storing key), `:57-73` (bind, headers, timeout, retry rule), `:75-103` (Tailscale), `:105-115` (wake format); `claude-code.md:65`. Compare BOARD-13 (`board/vercel-board.md`): csf-board answers every request but discovery only with a bearer token, stored as a SHA-256 hash (`src/tokens.ts`), which is the stronger pattern for a bot surface.
- Basis: Verified (text); the risk assessment is Unverified.
- Code: not applicable.

**PPACK-17. Qara's cross-harness method is a different kind of thing from pstack's generated copy, and it is already ahead where drift matters.**
Qara keeps one skills tree, `.claude/skills` (93 entries), and reaches it from each harness by link: `~/.claude/skills` is a link to the repository tree, `~/.codex/skills` is a directory of links, `~/.agents/skills` (pi) is a directory of links, with `.claude/skills-external` for upstream skills. `harness-topology-rows.ts` declares the expected shape of each path and `check:harness-links` reconciles only declared links, refusing to replace a non-link or an unexplained link. What differs per harness is generated from one source with a drift check: `config/harnesses.toml` becomes `shared-ts/qara-paths/harnesses.generated.ts` (`check:harnesses`); `.claude/settings-src/base.json` plus a per-host overlay become the settings templates (`check:settings-render`, `check:live-settings`, `check:codex-config-parity`, `check:codex-sync`, `check:mode-parity`, `check:droid-*`). Skill structure is `core/skill-structure.md` (four archetypes, mandated frontmatter) enforced by `check:skills` (`check-skill-definitions`, `check-skill-route-conflicts`, `check-skill-trigger-overlap`, `check-wrapper-externals`) and authored through `system-create-skill`.
- Why: pstack needs a generated copy because a Claude Code plugin must be a self-contained directory and the Cursor plugin directory must not contain the second tree. Neither holds for Qara, whose consumers are the owner's own hosts. Qara's drift problem is the configuration the harnesses read, and there it has the same pattern as pstack (single source, rendered output, `check` mode that exits non-zero) in more places. pstack's `--check` compares a whole tree byte for byte; Qara's compare per surface and per host.
- Evidence: `config/harnesses.toml:1-60` (and the header of `scripts/harnesses-codegen.ts:1-23`); `scripts/settings-render.ts:1-23` ("Drift between the host templates is therefore unauthorable"); `scripts/harness-topology-rows.ts:99,139-148`; `scripts/lib/codex-link-reconciliation.ts:28-37` (`assertManagedLinkTarget`: "Refusing to replace non-symlink managed target"); `package.json:48-60,70,74` and `:57` for `check:skills`; `.claude/skills/core/skill-structure.md:1-30`.
- Basis: Verified (Qara files); that Qara's method is better for Qara is Unverified (a judgement).
- Code: Qara scripts above. Gap: in the head of `check-skill-definitions.ts` no check was found that a skill using one harness's tool names has a translation for the others; `rg` for `AskUserQuestion` in it finds nothing. Whether that matters depends on how pi, Codex and Droid read skills written for Claude Code, which this pass did not test.

**PPACK-18. csf-build's packaging is code where benny's is prose, so benny's install procedure has nothing to teach csf.**
csf-build is `private`, `version 0.0.0`, depends on `git+ssh` repositories (`csf-root`, `csf-validate`, base-services) and is installed into cub as a package. It publishes 18 bins (`csf-drain`, `csf-admit`, `csf-gate`, `csf-onboard`, `csf-setup`, `csf-session-init`, `csf-validate-write` and others). `csf-onboard` is "Files-only successor onboarding": it targets hosts `.claude` and `.factory`, plans each link as create, keep, replace-an-older-bundle-release, or refuse, and checks that parent directories are real and writable before touching anything; hook bins are registered under `SessionStart`, `PreToolUse`, `PostToolUse`, `Setup`. There is a test file for the link plan and for published bins.
- Why: benny's "merge the pack, review diffs, ask if ambiguous" is a rule an agent follows; `csf-onboard`'s plan is a function with tests. Where the two meet (do not overwrite what a person owns), csf has the harder guarantee. Whether csf-onboard keeps user config outside the managed bundle (benny's best convention) was not read.
- Evidence: `/media/ssdev/tg-pro/cub/node_modules/csf-build/package.json` (`bin`, `dependencies`); `src/distribution/csf-onboard.ts:1-22`; `src/distribution/onboard-link-plan.ts:1-25`; `src/distribution/published-bins.test.ts`. NVIEW-10 notes that csf has `csf-onboard`, `csf-setup` and `csf-session-init`, and found no agent-run install test.
- Basis: Verified
- Code: `csf-build/src/distribution/`. Gap: no agent-run install test (as NVIEW-10).

**PPACK-19. For cub's issue intake, take four benny rules into csf's existing text; do not take its Slack or tracker plumbing.**
cub's intake is work-order admission by a named person: `csf-admit <WO-id> --by <text> [--attest <text>]...`, with a drain that processes admitted orders. There is no Slack, tracker or unattended trigger in that path. The transferable rules are: (1) if an open pull request or merged commit may already fix it, verify that fix on baseline and patched builds, twice each, and do not author a competing change; (2) a reproduction counts only if the discriminating symptom appears twice from a reset state through the real interface, and inspection may confirm but never force it; (3) if a person has claimed the fix (judged by the action requested, not by whether a bot is involved), stop; (4) when a ticket or work order is created by the same run that then fails its next step, compensate and verify the compensation. Qara's `triage-issue` already has "bounded reproduction", code and history inspection, and RED-GREEN criteria, and records Findings; `triage-resolution` runs a bounded, authorised, independently verified pass. Neither text, as read, states rules 1, 3 or 4 (a search of both skills for "twice" and "compensat" finds no hit).
- Why: these are the parts of benny that cost a few lines and prevent the common mistakes (a fix over someone's work, a repro that was one lucky run, a half-created ticket). They do not need Slack, Cursor, or an unattended trigger.
- Evidence: `reproduce-and-fix-issues/SKILL.md:80-103,163-183`; `verify-existing-fix.md:7-60`; `triage-issue-reports/SKILL.md:225-228`; `csf-admit.ts:1-25`; `.claude/skills/triage-issue/SKILL.md:9,25-31,65`; `.claude/skills/triage-resolution/SKILL.md:12-18`. nightly-ops is already the scheduled path in Qara (`scripts/nightly-ops.ts:1-6`: serial, opt-in, each op in a dedicated detached session, one flock per cron line, receipts per lane), with `sync-host` as a scheduled lane (`.claude/skills/sync-host/SKILL.md:28-30`), so Qara has unattended runs and no need of Cursor Automations.
- Basis: Verified (what the files say and do not say); fit is Unverified.
- Code: Gap in `.claude/skills/triage-issue/SKILL.md` and the csf triage or admission text.

**PPACK-20. Do not install pstack for a trial; if text is wanted, copy the smallest unit under MIT with the notice, and write the rest in our own words.**
A trial install costs: a third-party marketplace entry added to a host whose settings Qara renders from `settings-src` and verifies (`check:settings-render`, `check:live-settings`); a plugin cache with 539 files and scripts that can fetch packages; 58 namespaced slash commands (`/pstack:...`) alongside Qara's 93 skills, with overlapping job names (`tdd`, `why`, `recall`, `reflect`); a rule file loaded into every new session; and no way to see updates as a diff unless auto-update stays off and each update is read. The adapter itself says the `Skill` tool "refuses most pstack skills", so the plugin works by the model reading files by path, which also bypasses Qara's keyword router and `check:skills`. The risks are the instructions in PPACK-8 to PPACK-16 acting on a live host. A read-only clone, which is what this track used, gives the same learning at none of that cost.
- Why: the owner's frame (nothing installed or run) and Qara's direction (deleting machinery) point the same way as the cost list. Copying a file brings its Cursor vocabulary with it, so a copy needs the PPACK-4 translation rewritten into Qara's terms anyway; at that point the text is ours and the MIT duty is a source line.
- Evidence: PPACK-3, 8, 9, 10, 11; `pstack/docs/harness/claude-code.md:12`; `.claude/settings-src/base.json:664-670`; `mac.json:7-10`.
- Basis: Decision (owner's ruling of 2026-11-23, recorded in the shared brief); costs Unverified.
- Code: not applicable.

**PPACK-21. Overall judgement: about 350 lines of Qara packaging code could be replaced by workflows, about 600 may shrink, and roughly 2,700 lines must stay code because they guard live hosts or admission.**
Line counts (`wc -l`): `harness-topology.ts` 236, `harness-topology-rows.ts` 154, `harness-links.ts` 91, `harnesses-codegen.ts` 276, `settings-render.ts` 130 plus `lib/settings-render-core.ts` 205 plus `lib/settings-merge.ts` 144, `check-skill-definitions.ts` 300, `check-skill-route-conflicts.ts` 131, `check-skill-trigger-overlap.ts` 120, `check-wrapper-externals.ts` 202, `sync-host.ts` 72, `nightly-ops.ts` 300, `check-mode-parity.ts` 33, `codex-sync.ts` 174, `docs-sync/scripts/docs-sync.ts` 262 and `engine.ts` 209; csf `csf-onboard.ts` 297, `onboard-link-plan.ts` 106, `csf-admit.ts` 178. What stays: anything that writes links, settings or Codex config on a live host, refuses to overwrite a non-link, runs unattended, or admits work. What can go: code that only reports or only judges similarity.
- Why: pstack's own prose gates (the skip note, the seven benny checks, "always pause") have no code behind them, so prose is the right replacement only where nothing irreversible hangs on it.
- Evidence: see "What this could replace" below; counts above; `scripts/harness-topology.ts:11-17`.
- Basis: line counts Verified; the verdicts Unverified.
- Code: no change made; proposals only.

## What this could replace

(csf line counts taken from the installed package, not independently re-checked in review.)

| Qara or csf code (lines) | Job | pstack prose doing the same job | What the code guarantees that prose cannot | Verdict | Risk |
| --- | --- | --- | --- | --- | --- |
| `scripts/harness-topology.ts` (236), expected-shape rows `harness-topology-rows.ts` (154) stay | Reports each host path's shape against a declared table. Header: not wired into any blocking gate, "expected to be RED on mac" | none; nearest is the benny "setup check" list (`control-adapter.md:155-169`), also manual | Nothing blocks on it: `check:harness-links` and `check:harness-topology` (package.json:70,73) are package scripts with `just` aliases, and neither is named under `scripts/gate/`, so I found no commit or push gate for either. `harness-topology` is also a standing-audits entry (`registry.ts:94`), so this proposal and the standing-audits runner shrink in PPROOF-21 touch the same code and must be decided together. A written audit would lose the one-command matrix | replace the 236-line reporter with a written audit workflow that reads the rows file; keep the rows | low: rows still feed `harness-links.ts` |
| `scripts/check-skill-trigger-overlap.ts` (120) | Flags skills whose triggers overlap | none; judgement a model does from a paragraph (`poteto-help` routes by description) | A commit fails on a new overlap. Prose reminds only at authoring time | replace with a paragraph in `system-create-skill` and `core/skill-structure.md` ("read the neighbours' USE WHEN before adding one"); keep `check-skill-route-conflicts.ts` (131), which is exact-match | medium: overlaps could creep in; recheck after a month |
| `scripts/check-skill-definitions.ts` (300) | Frontmatter, class clause, path lints | adapter row check is the analogue (`generate-pstack-harness-trees.mjs:90-102`) | Structure errors fail a commit; a model forgets a field | shrink: keep exact frontmatter and path rules, drop anything that is advice | low |
| `scripts/check-wrapper-externals.ts` (202) | Drift gate for wrapper skills and external targets | none | Fails when an external skill lands ungated | keep (an outward-facing trust boundary) | n/a |
| `scripts/check-mode-parity.ts` (33) plus `lib/mode-parity.ts` | Declared versus installed execution modes per host | none | Detects host drift | keep (small) | n/a |
| `scripts/settings-render.ts` (130), core (205), merge (144) | Render host settings from `base.json` plus overlay | none; the adapter's "write a file" lines are prose | Drift "unauthorable" (`settings-render.ts:7-9`); a live settings file is gitignored and invisible to git | keep as code (settings guard permissions) | n/a |
| `scripts/harnesses-codegen.ts` (276) | TOML registry to typed module | none | Literal types for every consumer. Its drift check `check:harnesses` (`package.json:74`) runs inside `check:indexes` (`package.json:114`), which the daily state-hygiene cron runs row by row, report-only (`scripts/lib/state-hygiene-checks.sh:29-51`); it is not a commit gate | shrink only if the TOML is read at run time; not a prose job | medium |
| `scripts/harness-links.ts` (91), `codex-sync.ts` (174), `lib/codex-link-reconciliation.ts` | Create and reconcile links on a host | benny setup merge rules (`FOR_AGENTS.md:60-65`) | Refuses to replace a non-link (`codex-link-reconciliation.ts:28-37`); a paragraph would let an agent overwrite | keep | n/a |
| `scripts/nightly-ops.ts` (300), `sync-host.ts` (72) | Unattended runs, receipts, locking | benny's budgets and follow-up windows (prose only) | Locks, timeouts, receipts, exit codes (`sync-host/SKILL.md:44-52`) | keep (unattended and outward-facing) | n/a |
| `.claude/skills/docs-sync/scripts/docs-sync.ts` (262), `engine.ts` (209) | Mirror vendor docs | none | Network fetch, per-source isolation | keep (not a prose job) | n/a |
| csf `csf-onboard.ts` (297), `onboard-link-plan.ts` (106) | Plan and write links in a project | benny's "merge the pack" prose | Create/keep/replace/refuse plan with tests | keep (writes outside the tool's own state) | n/a |
| csf `csf-admit.ts` (178) | Admit a work order by a named person | benny triage text | Records who admitted | keep (admission) | n/a |

Candidates I could not size: Qara's TDD state machinery, keyword router, mode runners and orch-state sit in other tracks' areas (PPROOF, PMODE) and were not read for this document.

## Reference

### R1. Files in the packaging chain

| Path (clone root) | Role | Note |
| --- | --- | --- |
| `pstack/plugin.json` | neutral manifest, `$schema` agent-plugins.org | source for both generated manifests |
| `pstack/.cursor-plugin/plugin.json` | Cursor manifest | `skills`, `agents`, `logo`, `category`, `tags` |
| `pstack/LICENSE`, `pstack/README.md` | licence, README | both copied to the Claude tree |
| `pstack/agents/{poteto-agent,comment-sicko}.md` | subagent definitions | copied byte for byte |
| `pstack/docs/harness/claude-code.md` | the adapter | the only file under `docs/harness/` |
| `pstack/docs/guide/` | 10 chapters, README, 5 images | copied |
| `pstack/automations/benny/` | benny pack | not in Claude tree |
| `pstack/assets/logo.png` | logo | not in Claude tree |
| `.cursor-plugin/marketplace.json` | Cursor marketplace (whole catalogue) | schema-validated |
| `.claude-plugin/marketplace.json` | Claude marketplace (`origin-apps`, `pstack`) | name-checked only |
| `schemas/plugin.schema.json`, `schemas/marketplace.schema.json` | draft-07, `$id` `https://cursor.com/schemas/cursor-plugin/...` | Cursor's, not Claude's |
| `scripts/generate-pstack-harness-trees.mjs` | generator and `--check` | 189 lines |
| `scripts/validate-plugins.mjs` | schema, name, version checks | Ajv |
| `scripts/check-pstack-docs.mjs` | docs versus tree | not in CI |
| `.github/workflows/validate-plugins.yml` | CI, PR-triggered | 3 steps after install |
| `.gitattributes` | `harness/pstack/** linguist-generated=true` | |
| `harness/pstack/{README.md,claude-code/}` | generated copy | 539 files, 7.4 MB |
| `third_party/` | other vendors' plugins, each with own LICENSE | out of scope |

### R2. What the generator inserts and rewrites

| Action | Condition | Result |
| --- | --- | --- |
| insert adapter line after H1 | skill uses any of 22 `TERMS` or names another skill without a link, and has an H1 | 22 of 58 skills |
| fail "no H1" | skill uses Cursor names but has no H1 | exit 1 |
| fail name mismatch | frontmatter `name` differs from folder name, or folder is not `[a-z0-9]+(-[a-z0-9]+)*` or over 64 characters | exit 1 |
| fail adapter row missing | adapter text does not contain the `TERMS` key a skill uses | exit 1 |
| rewrite relative link | target exists in `pstack/` but not in the tree | GitHub `blob` or `tree` URL on `main` |
| fail dangling link | link leaves `pstack/`, or points in-tree at a missing file | exit 1 |
| copy manifests | always | `plugin.json`, `.claude-plugin/plugin.json` |

### R3. Adapter tables (`pstack/docs/harness/claude-code.md`)

| Group | Cursor | Claude Code |
| --- | --- | --- |
| Tools | `Task` | `Agent` |
| Tools | `AskQuestion` | `AskUserQuestion`; plain text in `-p` mode |
| Tools | todolist | `TodoWrite` or a list in the reply |
| Tools | run another pstack skill | `Read` its `SKILL.md`; type `/pstack:<name>` for the user |
| Subagent | `generalPurpose` | `general-purpose` |
| Subagent | `readonly: true` | `Explore` plus "do not edit files" plus `git status` after |
| Subagent | `readonly: false` | `general-purpose` |
| Subagent | `environment: "cloud"` | `isolation: "worktree"` |
| Subagent | `run_in_background: true` | omit |
| Subagent | `resume` | new agent with earlier result pasted |
| Models | `claude-<family>-<n>-<effort>[-fast]` | `model` in `opus|sonnet|haiku|fable`, `effort`; drop `-fast` |
| Models | non-Claude slug | omit `model`, say so |
| Models | `auto`, `inherit-parent` | omit `model` |
| Paths | `.cursor/rules/*.mdc` | `CLAUDE.md` or `AGENTS.md` (never `.mdc`), except the model rule |
| Paths | `~/.cursor/plugins/` | `~/.claude/plugins/` |
| Paths | `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.claude/projects/<slug>/<session>.jsonl`, subagents in `<session>/subagents/` |
| Cursor-only | Automations, `update_state`, `SendToUser`, webhooks | skip with `Skipped in Claude Code: <step>. <reason>.` |
| Cursor-only | Bugbot | triage its comments as ordinary review threads; skip steps that start or configure it |
| Cursor-only | cloud agents | worktree stands in; skip steps that need the cloud agent itself |
| Cursor-only | built-in PR tool | use the forge command; no line |

The skip rule, verbatim: "When a step needs one, put one line in your reply, `Skipped in Claude Code: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line." (`claude-code.md:61`). This is the only mechanism for the "one-line note": a sentence the model is told to write. A skipped step that produced a gate (for example waiting for Bugbot before merge) is simply not run.

### R4. Qara and csf equivalents

| Job | pstack | Qara | csf |
| --- | --- | --- | --- |
| one source, many harnesses | `pstack/` plus generated `harness/pstack/claude-code/` | one tree `.claude/skills`, links per harness (`harness-topology-rows.ts:99,139-148`) | package with bins, `csf-onboard` links into `.claude`, `.factory` |
| per-harness generated config | none (a rule file written by a skill) | `settings-src` base plus overlays, `harnesses.toml` codegen | hook bins registered by `csf-onboard` |
| stale-copy check | `generate --check` in CI (PR only) | `check:settings-render`, `check:harnesses`, `check:codex-sync`, `check:harness-links` | `published-bins.test.ts`, `onboard-link-plan.test.ts` |
| skill structure check | name equals folder; H1 present; adapter row present | `check:skills` (four scripts), `system-create-skill` | not read |
| docs versus tree | `check-pstack-docs.mjs` (not in CI) | `check:doc-citations`, `check:doc-terms`, `check:stated-caps`, `check:indexes` | `check:doc-line-cap`, `check:test-inventory` |
| unattended runs | Cursor Automations (benny) | `nightly-ops.ts` lanes, `sync-host` | `csf-drain` |
| issue intake | Slack triage plus repro-fix | `triage-issue`, `triage-resolution` (Findings) | `csf-admit` by a named person |
| command guards | prose "always pause" lines | `pre-tool-bash` normalise-then-scan (`hooks-guide.md:129`), worktree loss guard (`:125`) | `csf-validate-write` on PreToolUse |
| scheduled install or sync | none | `sync-host` (script plus receipt, `--dry-run` first) | `csf-update`, `csf-upgrade` skills |

### R5. benny files and what each does

| File | Lines | Role |
| --- | --- | --- |
| `FOR_AGENTS.md` | 90 | human intent plus 7 agent steps |
| `README.md` | 24 | six setup steps |
| `skills/setup-benny/SKILL.md` | 266 | copy pack, configure, create automations, 7 tests |
| `skills/triage-issue-reports/SKILL.md` | 241 | 10 sections: freeze, read, trace, classify, route, tracker, dedupe, create, verdict, follow-up |
| `skills/triage-issue-reports/references/routing.example.md` | 62 | routes, ping policy |
| `skills/reproduce-and-fix-issues/SKILL.md` | 311 | 15 sections |
| `.../references/control-adapter.md` | 170 | seven capabilities, nine-step setup check |
| `.../references/verify-existing-fix.md` | 94 | baseline and patched, three outcomes |
| `.../references/feature-map.example.md` | long | per-feature template (user path, selectors, states, cross-check) |
| `templates/configuration.example.yaml` | 85 | all configuration keys (PPACK-14) |
| `templates/{triage,reproduce}-automation-prompt.md` | 40, 34 | source for the live prompts |

### R6. Embedded instructions that install, copy, store keys, listen, post, or act, verbatim

Studied, not followed. Each line below was read in the clone.

Installs and copies into a repository or home directory:
- `/add-plugin pstack` and `/plugin marketplace add cursor/plugins` then `/plugin install pstack@cursor-plugins` (`pstack/README.md:18,24-25`).
- "merge the entire source pack into `<target-repository>/.cursor/automations/benny/`." (`benny/FOR_AGENTS.md:61`) and "i want you to merge this entry into the target repository's `.cursor/settings.json`" with `"plugins": { "pstack": { "enabled": true } }` (`:67-75`).
- "Write `~/.claude/rules/pstack-models.md` with no frontmatter ... Overwrite the whole file." (`claude-code.md:47`); "Write `~/.cursor/rules/pstack-models.mdc` with `alwaysApply: true`" (`setup-pstack/SKILL.md:48`).
- `curl -fsSL https://tailscale.com/install.sh | sudo sh` and `sudo tailscale up --hostname=<short-name> --accept-dns=false --ssh=false` (`make-bot-ui/SKILL.md:86-96`).
- `Bun.spawnSync([process.execPath, "install", "--frozen-lockfile"], { cwd: scriptsDirectory })` (`poteto-mode/scripts/bootstrap.ts:35-38`).
- "After approval, copy the skill folder there and edit the copy. Never open a PR or push." (`reflect/SKILL.md:17`).

Keys and secrets:
- "Do not accept the sender key in chat. Send a secret-request, then stop." and "Store `{url, key}` in that UI's own directory." (`make-bot-ui/SKILL.md:41,55`); "Copy the value into the server config. Do not print the value. Do not log the value." (`:51`).
- "`Authorization: Bearer <key>`" and "`X-Automation-Key: <key>`" (`:63-64`).
- "The optional `BENNY_SLACK_BOT_TOKEN` may fill a narrow gap such as editing one operations status message or downloading an attachment. Store the value in a secret manager or environment, not in YAML." (`setup-benny/SKILL.md:135`).

Network listeners:
- "Bind the server to `0.0.0.0:<port>`, not `127.0.0.1`. Tailscale peers cannot reach a localhost-only bind." and "Use HTTP. Do not add HTTPS unless the user asks." (`make-bot-ui/SKILL.md:57,84`).
- "Debug ports and tunnels" listed as disposable in adapter cleanup (`control-adapter.md:120`).

Posting or writing outside the machine:
- "post exactly one reply with `channel=SOURCE_CHANNEL_ID` and `thread_ts=SOURCE_THREAD_TS`" (`triage-issue-reports/SKILL.md:202`).
- "the coordinator may create one root status message there. This is the only allowed root post in the repro workflow." (`reproduce-and-fix-issues/SKILL.md:107`).
- "Cancel, close, or delete an issue created by this run if the Slack handoff fails" (`triage-issue-reports/SKILL.md:138`); "update the existing issue with the source permalink and one short recurrence note" (`:165`).
- "Open a draft pull request. Never merge or deploy from this workflow." (`reproduce-and-fix-issues/SKILL.md:291`).

Acting without a human (outside benny; owned by PPAR, listed so the whole inventory is in one place):
- "**Always pause** for irreversible writes: force-push to shared branches, deploys, data deletion, customer messages." (`poteto-mode/SKILL.md:78`), against "Stop only for a deploy, deleted data, a force-push to a shared branch, or a message to someone outside the run." (`poteto-mode/worker.md:7`) and "Irreversible actions (force-push, delete production data, send external messages) still require confirmation." (`principle-never-block-on-the-human/SKILL.md:13`).
- "Always merge the run's lowest unmerged PR, with `origin pr merge <pr>` or `gh pr merge <pr> --squash`." (`poteto-mode/playbooks/shipping.md:8`); "Arm `--auto` ... only on a PR whose verdict covers its current head" (same line).
- "Force-push only your own branch, with `--force-with-lease` pinned to the SHA you last pushed" (`playbooks/autopilot-full.md:12`).
- "Per path, `git worktree remove --force <path>`. If the dir survives on ignored build artifacts, `rm -rf` it" (`playbooks/worktree-cleanup.md:7`).
- "Never rebase, retarget, or force-push." (`playbooks/babysit.md:7`), which contradicts the `autopilot-full` and `shipping` lines for a PR the agent owns versus one it only watches.

Reading private history:
- Transcripts at "`~/.cursor/projects/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl`" (`recall/SKILL.md:15`); "Locate the active workspace's transcripts before fanning out ... Don't glob across `~/.cursor/projects/*/`" (`automate-me/SKILL.md:29`). The adapter maps this to `~/.claude/projects/<slug>/<session>.jsonl` (`claude-code.md:57`).

### R7. Qara `check:*` scripts relevant to cross-harness and docs (from `package.json`)

`check:settings-render` (48), `check:settings-reserved-keys` (49), `check:codex-config-parity` (50), `check:live-settings` (51), `check:codex-sync` (53), `check:mode-parity` (54), `check:agents` (56), `check:skills` (57: four scripts), `check:droid-hooks`, `check:droid-skill-catalog`, `check:droid-dispatcher`, `check:droid-live-settings` (58-66), `check:pm-integrity` (69), `check:harness-links` (70), `check:doc-citations` (71), `check:harness-topology` (73), `check:harnesses` (74), `check:hooks` (80), `check:rule-owners` (85), `check:doc-frontmatter`, `check:doc-types`, `check:doc-line-cap`, `check:doc-terms` (86-91), `check:stated-caps` (112), `check:indexes` (114).

## Borrow list

Owner rulings on this list: see PSKILL-23 in `pstack/skills-map.md`.

| Rank | What | Target | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Text only. Four rules from benny's repro and triage into the intake and triage text: verify an existing fix before authoring (baseline and patched, twice each); a repro counts only if the symptom appears twice from a reset state through the real interface; stop when a person has claimed the fix; compensate and verify a record created by a run whose next step failed | `.claude/skills/triage-issue/SKILL.md` and `triage-resolution` workflow (Qara); the csf work-order admission or triage guidance in cub's factory docs (csf) | about 15 to 25 lines of text | low: text only; the "twice" rule costs one extra run per repro | PPAR and PPROOF on the same rules; owner decision |
| 2 | Keep user-owned configuration outside any managed bundle, with a stated path (benny: `.cursor/benny/`, `~/.config/benny/`) | csf `csf-onboard` docs (csf) | a few lines of text | low | read how `csf-onboard` treats user files |
| 3 | A one-line source and licence note in any file that copies pstack text, with `LICENSE` text kept in a notices location | wherever the copy lands | one line per file plus one notice file | low | the first copy |
| 4 | Text-only replacement of `check-skill-trigger-overlap.ts` and the report-only `harness-topology.ts` by a paragraph and an audit workflow (see "What this could replace") | Qara `system-create-skill`, `core/skill-structure.md`, a new workflow file | removes about 356 lines of code, adds about 30 lines of text | medium for the overlap check | owner decision (Open 1, 2) |
| 5 | An app-control adapter contract as a reference file, only if UI repro is wanted | beside `triage-issue` (Qara) | about 60 lines of text | low | owner says UI repro is in scope |
| 6 | Adds code: a harness-term coverage check (tool names specific to one harness must appear in a translation table). Text-only alternative: one paragraph in `core/skill-structure.md` listing the harness-specific names to avoid | `scripts/check-skill-definitions.ts` | one function plus a table and a test | medium: term list upkeep, false positives | how pi, Codex and Droid read Claude Code skills (PPACK-17); prefer the paragraph |
| 7 | Adds code: stated-count and slash-name check against the tree. Text-only alternative: none that holds; the claims only stay true with a check | `scripts/check-stated-caps.ts` or `check-doc-terms.ts` | small if counts are already parsed | low | confirm those checks do not already do this; drop if they do not |

Not to borrow, and why:
- The generated-per-harness copy plus CI byte check. Qara has no copies to go stale; adding one adds the problem (PPACK-17).
- The adapter-line-plus-runtime-translation port. It makes every run depend on the model applying a table; Qara's skills are written for its own harnesses.
- benny's Slack triage, operations thread, marker contract, tracker adapter, `/automate` handoff and Cursor Automations dependency. cub's intake is admission by a named person, and Qara's unattended path is `nightly-ops`.
- `make-bot-ui`. `0.0.0.0` HTTP listener, key in a project file, `curl | sudo sh`, all on Cursor-only routines. The csf-board token handling (BOARD-13) is the better model for any bot surface.
- `bootstrap.ts` (dependency install on first run). Qara's package-manager integrity rule forbids it by design.
- `setup-pstack`'s always-loaded model rule. Qara owns model roster in `settings-src`.
- A trial install of the plugin (PPACK-20).

## Open

Questions for the owner, each askable alone:

1. Replace `scripts/harness-topology.ts` (236 lines, report-only, not a gate) with a written audit workflow that reads `harness-topology-rows.ts`? Recommendation: yes, but decide it together with the standing-audits shrink in PPROOF-21 (`harness-topology` is registered at `registry.ts:94`); `check:harness-links` stays.
2. Replace `scripts/check-skill-trigger-overlap.ts` (120 lines) with a paragraph in `system-create-skill` and `core/skill-structure.md` telling the author to read neighbouring `USE WHEN` lines? Recommendation: yes, recheck in a month; keep `check-skill-route-conflicts.ts`.
3. Add the four intake rules (verify existing fix, repro twice, stop when a person claimed it, compensate a half-made record) as about 20 lines in `triage-issue`? Recommendation: yes, Qara first; csf after reading how cub admits work orders.
4. Is a UI reproduction path in scope for Qara or cub at all? Recommendation: no for now; skip the control-adapter contract.
5. Should third-party text ever be copied into Qara or csf, or only restated? Recommendation: restate, with one source line.
6. Is the existing `svelte` marketplace entry in `base.json` (`sveltejs/ai-tools`) a standing exception to "nothing external installed"? Recommendation: confirm it is intentional.

Facts still unknown:
- Whether Claude Code finds `skills/` and `agents/` in a plugin with no path keys, and whether `~/.claude/rules/*.md` loads into every session. Both are the repository's statements about the client, untested here.
- Whether Claude Code's auto-update default for third-party marketplaces is as the README states.
- How the `Skill` tool treats `disable-model-invocation: true` plugin skills (the adapter says it "refuses most pstack skills"; 57 of 58 carry the flag).
- Whether Qara's `check:live-settings` or topology rows would flag a new `~/.claude/rules/pstack-models.md` or an `enabledPlugins` entry.
- Whether `check:stated-caps` or `check:doc-terms` already read counts in prose.
- Whether `csf-onboard` keeps user-owned files out of the managed bundle.
- The Cursor Automations runtime itself (tool isolation for child agents, trigger payloads): benny's guarantees rest on it and it is not in the clone.
- Git history of pstack (shallow clone), so how often the manifests and adapter change is unknown.

## Sources

- `cursor/plugins` at `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9`: `pstack/{plugin.json,.cursor-plugin/plugin.json,README.md,LICENSE,.gitignore}`; `pstack/docs/harness/claude-code.md`; `pstack/docs/guide/{README,01-setup}.md`; `pstack/skills/{setup-pstack,make-bot-ui,recall,reflect,automate-me,show-me-your-work,principle-never-block-on-the-human,poteto-mode}/` and `poteto-mode/{worker.md,scripts/,playbooks/{shipping,autopilot-full,worktree-cleanup,babysit}.md}`; `pstack/agents/`; `pstack/automations/benny/` (all files read except the bottom of `feature-map.example.md`); `harness/pstack/` (compared with the source by diff for `setup-pstack`, `arena`, `01-setup.md`, `README.md`, `plugin.json`); `scripts/{generate-pstack-harness-trees,check-pstack-docs,validate-plugins}.mjs`; `schemas/*.json`; `.claude-plugin/marketplace.json`; `.cursor-plugin/marketplace.json`; `.github/workflows/validate-plugins.yml`; `.gitattributes`; root `README.md`; `dyl-stack/README.md`; `third_party/` (listing only). The sibling plugins `create-plugin` and `agent-compatibility` were searched for a cross-harness scheme and contain none.
- Qara: `package.json`; `config/harnesses.toml`; `scripts/{harnesses-codegen,settings-render,harness-topology,harness-topology-rows,harness-links,codex-sync,check-mode-parity,check-skill-definitions,nightly-ops}.ts`; `scripts/lib/{codex-link-reconciliation,live-settings-diff}.ts`; `.claude/settings-src/{base,linux,mac}.json`; `.claude/skills/{sync-host,docs-sync,triage-issue,triage-resolution}/SKILL.md`; `.claude/skills/core/skill-structure.md`; `.claude/context/hooks-guide.md`.
- csf-build in `/media/ssdev/tg-pro/cub/node_modules/csf-build`: `package.json`, `src/distribution/{csf-onboard,onboard-link-plan}.ts`, `src/admission/csf-admit.ts`.
- tobogan: `DOCTRINES.md`; `noodle/modes.md` (format model); `noodle/cli-config-observability.md` (NVIEW-10, NVIEW-16); `board/README.md`; `board/vercel-board.md` (BOARD-13).
- Cross-references: PMODE (routing, wrapper agent), PPRIN (principle skills named by benny), PPAR (shipping, autopilot, force-push and merge lines in R6), PPROOF (media review, verification skills), PLEARN (transcript reading, `recall`, `reflect`), PWRITE (`unslop` applied to benny's output).
