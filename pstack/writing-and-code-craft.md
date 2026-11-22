# PWRITE: Writing, comments and code craft in pstack, and what Qara's code-style, humaniser and design skills lack

**Track:** pstack · **Type:** research · **Date:** 2026-11-23

**Question:** how do pstack's prose and code craft skills (`unslop`, `technical-writing`, `no-comments` with Comment Sicko, `architect`, `typescript-best-practices`, nine principles, four playbooks) work, how sound and how enforced are they, and which rules or checks are worth adding to Qara's `code-style`, `humaniser`, `interface-design.md` and PR-body rules?

**Scope.** The files named in the table in Reference R1, plus the guide chapters `docs/guide/04-design.md` and `05-build-and-clean.md`, the Claude Code adapter (`docs/harness/claude-code.md`), `worker.md`, and `deslop` in `cursor-team-kit`. Model routing, the wrapper agent and playbook selection belong to PMODE. The other fifteen principles belong to PPRIN. Fan-out, `arena`, `interrogate` and shipping belong to PPAR. Verification belongs to PPROOF. `/recall`, `/teach` and memory belong to PLEARN. Generator, CI and install belong to PPACK. They are cited only where this feature touches them.

**Sources.**
- pstack at commit `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` (2026-11-21) of `cursor/plugins`, MIT. Paths without a prefix are relative to the repo root. Read only; nothing was run, built or installed.
- Qara at `$HOME/qara`, read 2026-11-23: `.claude/skills/{code-style,rust-style,humaniser,edit-article,design-it-twice,improve-repo-architecture,code-quality-review,system-create-skill}`, `.claude/skills/core/{SKILL.md,references/deep-modules.md,references/interface-design.md,workflows/git-update-repo.md}`, `.claude/context/doc-hygiene.md`, `.claude/agents/{architect,critic,reviewer}.md`, `.claude/commands/create_plan.md`, `CLAUDE.md`, `biome.json`, `tsconfig.json`.
- csf-build and cub: only a grep for PR-body or commit-message conventions. None found (see PWRITE-12). Nothing was run there.
- tobogan: `DOCTRINES.md`, `noodle/skills.md` (NSKILL-17), `factory/humans-md.md`, `factory/checks/check-repo.mjs` (file list only).
- One web search for the ASD-STE100 sentence limits (secondary sources only).

"Verified" means read in the clone or in Qara files. Every judgement about fit for Qara and every analogy is Unverified until tested. Nothing is Tested: we ran nothing.

**Not run, stated plainly.** The compound recall step and the mandatory Diderot channel were not run. The brief restricted this job to read-only file reads and plain single commands, and it named no vault path. The research is therefore complete for the clone and the named Qara files, and `unavailable` for JM's prior notes. Qara's `/simplify` is a Claude Code bundled skill with no file in the Qara tree; only its mentions were read (PWRITE-15).

## Short answer

Almost no Qara code in this area can be replaced by pstack prose, and the honest total is small: about 90 lines of `check-doc-terms.ts` (205 with its test), and arguably the advisory half of `check-doc-frontmatter.ts` (216 with its test), so about 205 to 420 lines including tests (PWRITE-21, table in "What this could replace"). The rest of the doc and style code either guards a commit (keep as code) or has no pstack counterpart: pstack has no code for these jobs because it enforces none of its style. What pstack does offer is text that fits the owner's direction: every borrow below is a sentence or a short block added to a file Qara already loads. pstack's writing and craft set is about 900 lines of prompts and nothing enforces it. The only script that touches it, `scripts/check-pstack-docs.mjs`, checks counts, skill names and links, not style. The most useful part is `unslop`: 28 numbered rules, of which eight (27 to 33 and the colon rule) are authoring rules that Qara's `humaniser` catalog does not have, and of which Qara's humaniser takes the opposite position on three (dashes, quotes, bold). `technical-writing` stacks Diátaxis, Google developer style, STE and Global English into about 35 rules. Qara has no general prose standard at all (searches in PWRITE-5). `no-comments` contradicts Qara's `code-style` rule 8, which tells agents to add a comment to every new block, so no comment-stripping can be adopted until JM picks one policy. The one idea inside it that is cheap and new is "when a comment claims a constraint, offer a type, assertion or test, then delete the comment". `architect` is one paragraph with no steps; its caller-first behaviour lives in a guide chapter, and Qara's `design-it-twice` already demands a usage example. Of the 16 TypeScript rules, Qara's `code-style` has one, and the compiler and linter cover three more; a sibling `typescript-style` file modelled on `rust-style` is the natural home for about eight. Nothing here justifies porting a whole skill. The borrows are rule text added to files Qara already preloads.

## Doctrines

**PWRITE-1. Treat every rule in pstack's writing and craft set as prose that nothing enforces, except doc counts and links.**
The set is 19 prompt files. Style rules, the comment keep list and the TypeScript rules have no linter, test or hook behind them.
- Why: copying the rules imports the claim of enforcement that pstack's guide implies ("a diff with narrating comments ... reads as unfinished") without any mechanism. The only gate that exists is on the docs, and it checks something else.
- Evidence: `scripts/` holds three files: `check-pstack-docs.mjs`, `generate-pstack-harness-trees.mjs`, `validate-plugins.mjs`. `check-pstack-docs.mjs:3` says it lists skills, playbooks and agents and checks what the README and guide claim; its failure messages (`:91-122`) cover counts, skill names, links, anchors, subagent types and model slugs. A search of `scripts`, `pstack/scripts` and `pstack/package.json` for `unslop`, `em dash`, `slop`, `banned` and `vocabulary` found nothing. Qara's own gate for the same job is also prose (`code-style/SKILL.md:10-12` says Cosmetic rules are "never a review finding"), but Qara adds `biome.json:33` and `tsconfig.json:21-24` for the type rules.
- Basis: Verified
- Code: none for style. Gap: a style rule that matters needs a check, and none is proposed here (see Open 6).

**PWRITE-2. Read `unslop` as a 28-rule authoring ban list with one sentence of procedure.**
The skill has ids 3 to 33 with gaps at 1, 2, 4, 6 and 21. Its procedure is line 9: "Scan for the patterns below, then rewrite. Preserve meaning and match the intended tone." The list is reproduced in R2.
- Why: the list is the content; there is no fidelity gate, no protected-region rule and no output disposition, which the Qara `humaniser` has (`humaniser/SKILL.md:37-47,69-75`). Unslop is safe for text you author, risky as an automatic editor of someone else's text.
- Evidence: `skills/unslop/SKILL.md:7-40`. Line 11 says "Rule numbers are stable ids that other skills cite. A removed rule leaves a gap." A search of the clone for citations by number (`unslop rule N`) found none; other skills cite it by name (`poteto-mode/SKILL.md:23`, `technical-writing/SKILL.md:67`, `recall/SKILL.md:33`, `automate-me/SKILL.md:77`, `blast-radius/SKILL.md:48`, the Benny automation files). The removed content is not recorded: the clone is shallow. Catalog topics that unslop has no rule for (significance, notability, promotional tone, outline conclusions, knowledge-cutoff) fit the gaps at 1, 2, 4, 6 and 21, but that is a guess. The harness copy is byte-identical (`harness/pstack/claude-code/skills/unslop/SKILL.md`). `disable-model-invocation: true` (line 4): it runs only when named.
- Basis: Verified (content, gaps, no number citations found); Unverified (what the gaps held)
- Code: `skills/unslop/SKILL.md`

**PWRITE-3. Do not copy unslop rule 26 as a word ban. pstack's own files break it.**
Rule 26 bans "substrate, wedge, vector, nexus, primitive, harness, surface, scaffolding, paradigm, ratchet, north star, flywheel" and says to use the concrete word. Several of those are the correct technical term.
- Why: "branded primitives", "test harness" and "API surface" are standard terms. A blanket ban makes an agent rewrite a defined term into a vaguer phrase, which is what rule 27 forbids.
- Evidence: in the assigned files, a word search finds 12 lines using `primitive(s)`, `harness` or `surface`, including `typescript-best-practices/SKILL.md:15` ("Brand primitives"), `principle-type-system-discipline/SKILL.md:3,9,11`, `principle-subtract-before-you-add/SKILL.md:11` ("smaller surface"), `feature.md:13` ("matching surface") and `refactoring.md:7` ("equivalence harness"). Qara defines "harness" as a term of art: `CLAUDE.md:7,33` ("every harness using panes", "On other harnesses"), `docs/HARNESS-PARITY.md`. The same author's `poteto-mode/SKILL.md:15` also lists "surface" as a defined concept in `worker.md`-style prose. pstack follows the dash rule: no long dash appears in the principles, `technical-writing`, `no-comments`, `comment-sicko` or `feature.md`.
- Basis: Verified (the self-contradiction); Unverified (that the ban would hurt Qara in practice)
- Code: Gap: if rule 26 is borrowed, word it as "prefer the concrete word unless it is the defined term".

**PWRITE-4. Keep `humaniser` and `unslop` separate: one edits other people's prose under a fidelity gate, the other bans patterns in prose you write.**
The two take opposite positions on typography and neither is wrong for its job.
- Why: merging them would either weaken the fidelity gate or turn an editor into a rewriter.
- Evidence: `humaniser/SKILL.md:51` says em dashes, rules of three, bold labels, title case and emojis "are weak signals and never standalone defects" and that "curly quotation marks are ordinary typography, not an AI signal". Unslop bans dashes (13), requires sentence case (17), bans decorative emoji (18) and requires straight quotes (19). Qara's catalog marks patterns 13 to 17 "Weak Signal" (`ai-patterns-catalog.md:177-247`). The catalog is "based on Wikipedia:Signs of AI writing" (`:356-358`), so it is a detector list; unslop is a house style. The numbering does not align: catalog 13 is em dash, unslop 13 is dashes, but catalog 7 is vocabulary and unslop 7 is vocabulary only by chance; most others differ.
- Basis: Verified
- Code: `humaniser/SKILL.md:51`, `humaniser/references/ai-patterns-catalog.md`

**PWRITE-5. Add a short authoring-time prose block to Qara, not a second editor. The gap is real: Qara has no general prose standard.**
Qara's catalog lacks unslop rules 14, 26 (as a list), 27, 28, 29, 30, 31, 32 and 33. A search of Qara found no Diátaxis, STE, Google developer style or Global English rule, and no standing reply-style rule (no em-dash, plain-language or jargon rule in `CLAUDE.md`, `~/.claude/CLAUDE.md`, `core/SKILL.md`, `core/stack-preferences.md`, `doc-hygiene.md` or `global/user-instructions.md`).
- Why: JM applies plain-language rules to replies, but they live in no file an agent preloads. `core/SKILL.md:85-89` (Writing Directives) holds three lines about sources and formats; `:113-119` sets reply size ("Micro/Standard concise; ... don't narrate machinery"). `doc-hygiene.md:3` limits itself to `decisions/` records. `impeccable/reference/clarify.md` is interface text only, and pstack scopes UI strings out of `technical-writing` too (`:69`).
- Evidence: catalog search for `substrate|flywheel|active voice|metaphor|arrow|utilize|leverage|straight quote|curly|sentence case|one idea per|serial comma|abbreviat` in `ai-patterns-catalog.md` returned only the "curly" statement in `humaniser/SKILL.md:51`. Rule 7's word list is wider in Qara (21 words) than in unslop (11). tobogan's `factory/humans-md.md:96-117` shows the one place reply form is configured (length, structure, visual), and it holds no word-level rules; `check-repo.mjs` enforces no prose style. Candidate block (R2 marks each): 27, 28, 29, 30, 31, 32, 33, 14.
- Basis: Verified (absences, by the searches named); Unverified (that agents would follow the block)
- Code: Gap: a `core/references/prose-rules.md` of about 12 lines, pointed to from `core/SKILL.md` Writing Directives. Where it loads is Open 3.

**PWRITE-6. `technical-writing` is four standards compressed into one list, and the compression is the value: one rule per sentence property.**
Each layer owns a different level: Diátaxis owns the document (mode), Google style owns the sentence for a reader, STE owns the load of one statement, Global English owns ambiguity. The rules are in R3.
- Why: a document with the wrong mode cannot be fixed by sentence editing, and a well-styled sentence can still be read two ways. Qara's `edit-article` covers structure as an information DAG (`edit-article/SKILL.md:36-50`) but has no mode taxonomy.
- Evidence: `skills/technical-writing/SKILL.md:23-63`. Limits: "Split instructions longer than about 20 words and other sentences longer than about 25" (`:47`). One secondary source states ASD-STE100 caps procedural sentences at 20 words and descriptive at 25; the official Issue 9 text was not read. The skill's own opening rule lets you break any rule that makes a sentence worse (`:13`), which makes the layers advice, not a standard. Two rules are Cursor-repo specific and should not travel: "Indent code snippets with tabs" (`:70`) and "Product UI strings are not documentation" defers to a copy guide Qara has only as `impeccable` `clarify.md`. Best line: "Not 'schema changes can cause issues' but 'a column rename fails the build'" (`:21`). Weakest: "Have a view in explanation. Keep reference dry." (`:20`) cannot be checked.
- Basis: Verified (content); Unverified (STE figures, secondary source: https://techscribe.co.uk/techw/asd-simplified-technical-english.htm)
- Code: `skills/technical-writing/SKILL.md`. Gap in Qara: no equivalent.

**PWRITE-7. Borrow the mode-first question and the sentence-length rule from `technical-writing`; skip the rest of the layers.**
Two rules change what an agent writes and can be stated in two lines: pick one Diátaxis mode per document and split instead of mixing, and keep instructions near 20 words and other sentences near 25.
- Why: they are checkable by eye, address the most common failure (a README that is tutorial, reference and argument at once), and fit the same `prose-rules.md` block as PWRITE-5. The other layers add rules that overlap Qara's existing habits (commands, present tense) or that cannot be judged (rhythm).
- Evidence: `technical-writing/SKILL.md:23-30,44-52`; guide `04-design.md:93` ("so a tutorial stays a tutorial instead of drifting into reference and explanation at once"). Qara's research documents already use tobogan's doctrine format, which is a mode of its own (`DOCTRINES.md:32-57`).
- Basis: Unverified (fit)
- Code: Gap: two lines in the block from PWRITE-5.

**PWRITE-8. `no-comments` is three things: a reviewer with a keep list, an arbiter procedure, and an encoding offer. Only the third is new for Qara.**
- Why: the reviewer and arbiter exist because "an author defends its comments the way you'd defend yours" (`05-build-and-clean.md:71`). Qara already separates author and reviewer for code (`agents/reviewer.md`), but has no comment-specific pass and no rule against comments at all except `code-style` rule 10.
- Evidence: the steps are in R4. The keep list has five items (`agents/comment-sicko.md:14-20`): legal headers, behaviour forced by an external dependency we cannot reshape, `prettier-ignore` and suppressions of faulty, pedantic or style-only rules, public API doc comments, issue or RFC links that explain a constraint code cannot express. Rules of the arbiter: "If a kill is ambiguous, do not restore. If a keep is refuted or still ambiguous, delete it" (`no-comments/SKILL.md:20`). Doubt always deletes. "A long justification without a proven keep-list exception is a confession" (`comment-sicko.md:28`) is the sharpest line. "A surprise in our own code" gets no keep: the comment is deleted and the symbol is flagged `MUST KILL` for a rename, extract, type or redesign (`:17`).
- Basis: Verified
- Code: `skills/no-comments/SKILL.md`, `agents/comment-sicko.md`

**PWRITE-9. "Offers encodings for claimed constraints" means: when a comment says do-not-remove, do-not-change-wording or talk-to-X, offer the cheapest type, runtime check, test or CI lint, and delete the comment either way.**
The comment is the symptom; the claim it makes is either enforceable or it is unenforced debt that gets reported.
- Why: a constraint nobody enforces is a comment that will be ignored or cargo-culted, and deleting it silently loses the claim. The offer turns each claim into one of three outcomes: encoded, deleted and reported open, or kept because it is about something we cannot change.
- Evidence: step 5, `no-comments/SKILL.md:23`: "Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work." The report names "encoding offers, encodings, unenforced constraints" (`:24`). The skill gives no example; the nearest worked example is in the TypeScript references: `type TimeRange = { start: Date; end: Date }; // start <= end` becomes `{ start: Date; durationMs: number }` so "a negative range can't be written" (`typescript-best-practices/references/patterns.md:81-86`). Illustrative cases of the three forms (mine, not pstack's): `// must be non-empty` becomes `NonEmpty<T>`; `// never call before init()` becomes an assertion in the callee; `// order matters here` becomes a test that fails on reorder. Qara kin: the testing ladder's first rung, "make bad states unrepresentable in types" (`CLAUDE.md:40`, `decisions/2026-11-04-testing-ladder-replaces-fixtures.md`), and `code-style` rule 10.
- Basis: Verified (the text); Unverified (that agents would encode correctly or that the offer beats plain deletion)
- Code: `skills/no-comments/SKILL.md:23`. Gap in Qara: no comment-to-encoding rule.

**PWRITE-10. `no-comments` and Qara's `code-style` rule 8 are opposite policies, so the choice is JM's before any comment rule moves.**
Rule 8 says "A short *what/why* comment on each new block you author" (`code-style/SKILL.md:41`). Comment Sicko's first targets are "narration, banners, commented-out corpses, workaround sermons" (`comment-sicko.md:12`).
- Why: adopting `no-comments` as a pass would delete what rule 8 makes agents write, and the next engineer spawn would rewrite them. Rule 8 is Cosmetic and never a review finding; rule 10 already keeps comments to "constraints and why, never narrated history" (`:46`). The two sources disagree because they come from different authors (Sanglard vs poteto), not different needs.
- Evidence: `code-style/SKILL.md:39-46`; `agents/reviewer.md:36` says the Cosmetic tier is skipped; `finish/references/dimensions.md:94` already lists "No commented-out code" as a quality check. Qara has no comment pass.
- Basis: Verified (the conflict); Decision (which policy) owned by JM
- Code: Gap: none until decided. See Open 2.

**PWRITE-11. Comment Sicko is "read-only" only in the README; its own file and frontmatter say otherwise, and its persona is wasted prompt.**
- Why: a reviewer that deletes comments in a shared tree, with no commit checkpoint, can lose a peer's edit when the arbiter reverts a rejected report. The persona inflates the prompt and the fixed opening line is output with no value.
- Evidence: README `:220` and guide `05-build-and-clean.md:77` call it "read-only". The frontmatter has only `name` and `description` (`comment-sicko.md:1-4`): no `tools`, no `readonly`. Its report is "touched files, deletion count" (`:32`) and it says "I touch comments" (`:30`), then "I do not touch the code" (`:28`). `no-comments` step 2 tells the parent to "Reject application-code edits" and to "Revert and rerun one rejected report" (`:20`), which is only needed if it edits. The Claude Code adapter maps `readonly: true` to the `Explore` subagent (`docs/harness/claude-code.md:22`), but this agent sets no such field. Persona: "My first output when spawned is exactly this. Yes... Ha ha ha... Yes!" (`:8-10`). Qara's skill checklist bans "persona inflation" (`system-create-skill/references/quality-checklist.md:26`). How the revert is done is not stated.
- Basis: Verified
- Code: Gap: if the reviewer is ever borrowed, give it Read and Grep only and have it return a list, never an edit.

**PWRITE-12. The PR-body rule exists in three places in pstack and one in Qara; they differ, and the cap and "link, do not paste" rules are the part Qara lacks.**
pstack: title `type(scope): subject`, body under 40 lines with `## Why`, `## What changed`, `## Scope`, `## Tradeoffs`, `## Blast Radius`, `## Verification`, empty ones dropped. Qara: Summary, Evidence, Merge Danger.
- Why: a reviewer reads the briefing in under a minute (`technical-writing/SKILL.md:68`). Qara's three headings carry the evidence and risk but no length cap and no rule against pasting logs. Three copies in pstack can drift.
- Evidence: `opening-a-pr.md:7`, `worker.md:9-11`, `technical-writing/SKILL.md:68` ("Do not paste swarm logs, SHA lists, or metric tables. Link them."); `worker.md:11` repeats it for evidence logs. Heading overlap with Qara is partial: Verification is Evidence; Blast Radius is Merge Danger ("reversibility and blast radius", `git-update-repo.md:173-174`); Why, What changed, Scope and Tradeoffs have no Qara heading (Summary stands for the first two). Commit messages: pstack gives only the title shape; Qara gives `type(scope): summary` (`git-update-repo.md:58`) and no body rule. pstack opens PRs ready, never draft (`opening-a-pr.md:9`, `worker.md:8`); Qara requires `isDraft=false` at the fourth check (`git-update-repo.md:110`). csf: a grep of csf-build skills and cub `factory` found no PR-body or commit-message convention to compare; not read further. Nothing in `scripts/` checks the pstack body shape. Qara's body rule: "No generated-attribution line or Co-Authored-By trailer" (`:174`) has no pstack counterpart.
- Basis: Verified (texts); Unverified (that a cap improves review)
- Code: Gap: add "under 40 lines; link logs and tables instead of pasting" to `git-update-repo.md:173`; keep Merge Danger.

**PWRITE-13. `architect` is one paragraph with no steps; its caller-first behaviour is a prompt habit described in the guide, and Qara's `design-it-twice` already covers most of it.**
- Why: the description promises "then stay in the loop while implementation fills in" (`architect/SKILL.md:3`) and the body (`:9-11`) says nothing about it. A reader of the skill file alone gets: trace every system touched, sketch two shapes (types, signatures, module boundaries), choose the one where each piece of state has one owner, each task has one way and "callers need to know least", redesign if workarounds repeat; use `arena` for a large design. The caller-first step is in the README (`:136`: "the caller's usage, types, and module shape settled first") and the guide example "i care most about how callers use it" (`04-design.md:12`), plus "write the README first for shared code" (`:85-93`).
- Evidence: outputs are "types, signatures, module boundaries" and a chosen shape; no file is written; `no-comments` step 3 calls it once and says "Stop at the sketch" (`no-comments/SKILL.md:21`). Qara comparison: `design-it-twice/SKILL.md:50-67` dispatches three agents and requires an interface shape, a usage example, what it hides and trade-offs from each, and step 1 names "primary consumers" (`:35-36`). `interface-design.md:5-35` has three testability principles and no "write the usage first" line. `deep-modules.md:27-34` asks "is the cognitive load on the caller proportional". `improve-repo-architecture/workflows/depth-discovery.md:14-24` has the glossary and deletion test. Qara's `architect` agent writes PRDs, not code shapes (`agents/architect.md:13`), so it shares only the name. `feature.md:6` runs `architect` unconditionally, but `refactoring.md:9` only "if the target crosses a function boundary" and the guide says "most changes need none of it" (`04-design.md:115`).
- Basis: Verified (texts); Unverified (that caller-first adds to `interface-design.md`)
- Code: `skills/architect/SKILL.md`. Gap in Qara: none large.

**PWRITE-14. Add one line to `interface-design.md`: write the caller's usage first. Do not port `architect`.**
The line is "Write the caller's usage (a call, its inputs, what it does with the result) before the signature." It is the only part of `architect` that Qara's design files do not state.
- Why: `interface-design.md` is entirely about testability; the question "what does the caller write" is asked in `design-it-twice` only inside a three-agent exploration. One line costs nothing and covers the single-agent case.
- Evidence: PWRITE-13. The Mattpocock-derived file has an attribution line (`interface-design.md:39-41`), so a change should be marked as local.
- Basis: Unverified
- Code: Gap: one line in `core/references/interface-design.md`.

**PWRITE-15. Qara's `code-style` has one of the 16 TypeScript rules; the compiler and linter cover three more; the rest are a gap best filled by a `typescript-style` sibling of `rust-style`.**
Rule 3 (enum or string-literal union over a boolean parameter) is pstack's nearest overlap with "discriminated unions", but not the same rule.
- Why: Qara is a TypeScript estate (`stack-preferences.md:7`), the only mechanical type rules are `strict`, `noUncheckedIndexedAccess` and `noExplicitAny`, and the reviewer already flags "unnecessary casts, `any`, `unknown`" (`review-rubric.md:79`). The reviewer and the rubric's rule 5 (`:34-38`) point at the gap without a rule to cite.
- Evidence: R7 lists each rule and its Qara status. Measured in non-test `.ts` under `.claude`, `scripts`, `shared-ts`, `tools` (excluding `skills-external`): 20 matches of `as unknown as`, 5 of `: never = `, 33 of ` satisfies `, 0 of `__brand`, 2 of ` as any` (possibly comments or strings). A raw count of `as [A-Z]...` gave 904 but also matches `import { a as B }`, so it is not a cast count and is not used. The precedent for a filtered sibling file is `rust-style/SKILL.md:1-12` ("filtered to the rules rustfmt and Clippy do not already enforce"). Qara's rubric treats `unknown` as a possible smell (`:79`) while pstack makes it the required type for external data, so the sibling must say "at the parse boundary".
- Basis: Verified (counts, texts); Unverified (value)
- Code: Gap: `.claude/skills/typescript-style/SKILL.md`, about 25 lines, listed in the preload `skills:` of the two engineers (see PWRITE-17).

**PWRITE-16. `typescript-best-practices` claims examples for every rule and has none for two, and its load trigger contradicts the guide.**
- Why: a table that overstates its own coverage teaches readers to distrust it; a `paths:` field that does nothing is dead metadata.
- Evidence: `patterns.md:3` says "Code examples for each rule in `SKILL.md`". The reference has 14 sections (Branded types to Object args); "Real tests" and "Structured telemetry" (`SKILL.md:28-29`) have none, and are not type rules. `SKILL.md:4` sets `paths: ["**/*.ts", "**/*.tsx"]` and the description says "Use when reading or editing any .ts or .tsx file", but the guide says "It doesn't load on its own, so type `/typescript-best-practices`" (`05-build-and-clean.md:55`), and `disable-model-invocation: true` is set (`:5`). The Claude Code adapter says the `Skill` tool "refuses most pstack skills" and the agent must read the file (`claude-code.md:12`). `no-comments`, `architect` and `technical-writing` carry an extra line pointing at the adapter in the Claude Code copy (diff against the source: two added lines).
- Basis: Verified
- Code: `skills/typescript-best-practices/SKILL.md:4-5,28-29`

**PWRITE-17. Put any borrowed rule text in a file Qara already preloads; a prose pointer to a new skill does not load reliably.**
pstack's design is the pointer: "Apply the **type-system-discipline** principle skill first", "see the **boundary-discipline** principle skill". Qara measured that approach.
- Why: Qara's own probes found a prose "read this file" pointer "measured 0/4 across placements and models (2026-09-06 probes)", so `engineer` and `engineer-high` list `code-style` and `rust-style` under `skills:`. A new `typescript-style` or prose block reached only by pointer would be inert.
- Evidence: `code-style/SKILL.md:54-60`; `rust-style/SKILL.md` "How this loads"; pstack side: `typescript-best-practices/SKILL.md:10`, `principle-type-system-discipline/SKILL.md:15`, `poteto-mode/SKILL.md:9` (the principles are read on demand).
- Basis: Verified (Qara's stated probe result); Unverified (that it generalises to pstack's wording)
- Code: Gap: any new rule goes in `code-style` (needs promotion, see Open 4), in a new sibling listed in `skills:`, or in `core/SKILL.md` (always active).

**PWRITE-18. The nine principles in scope are mostly written down in Qara already; the new ones are `make-operations-idempotent` and the reader-load test.**
Each is 9 to 18 lines. PPRIN owns the judgement; R8 maps them.
- Why: duplicating principles Qara already carries adds load. Qara has them as review rubric items, not as named principles.
- Evidence: `review-rubric.md:5-10` (be ambitious about simplification) covers laziness and subtract-first; `:18-23,94,100` (spaghetti, typed model, state model) covers model-the-domain; `:34-38,105` covers type and boundary cleanliness; `deep-modules.md` and `depth-discovery.md:22` (deletion test) cover reader load by layers. Not found: the 30-second reader test ("can a new reader answer 'where does X come from?' and 'what can change X?' in under 30 seconds", `principle-minimize-reader-load/SKILL.md:15`), `redesign-from-first-principles`, and any idempotency or crash-resume rule in `CLAUDE.md`, `core/PRINCIPLES.md` or `hooks-guide.md` (those three files only; other Qara files were not searched).
- Basis: Verified (pstack texts, mapping by reading); Unverified (absence beyond the files searched)
- Code: see PPRIN.

**PWRITE-19. The four playbooks are step lists with a Reply line; their strongest rules are the ones with a stopping condition, and their weakest are unmeasured.**
- Why: a playbook step an agent can finish and check is followed; one it cannot is decoration.
- Evidence: `refactoring.md:7` ("Type check and lint are not a pin"), `:8` ("The reshape must delete branches or invalid states, not add indirection"), `:13` ("If the diff does not lower reader load somewhere, revert it") are checkable only by judgement; reader load has no measure. `feature.md:12` makes delegation to a subagent "Mandatory: no skip-with-reason escape" and says the Laziness Protocol "does not override it", which conflicts with the principle that it bias to the smallest change (PMODE owns this). `authoring-a-skill.md:10`: "When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason." Qara's checklist asks for the opposite on activation: "Comprehensive trigger patterns (8-category coverage)" and "Examples provided" (`quality-checklist.md:21,31`). That conflict is NSKILL-17's ground; not repeated. `opening-a-pr.md:5` depends on `/deslop` from `cursor-team-kit`, a 22-line prompt (R9) that is itself a list of five patterns and no procedure.
- Basis: Verified
- Code: `skills/poteto-mode/playbooks/{feature,refactoring,opening-a-pr,authoring-a-skill}.md`

**PWRITE-20. Nothing here challenges the no-adoption frame; the nearest candidate for a whole port is `no-comments`, and it should not be ported.**
- Why: porting needs the reviewer agent, the arbiter procedure, a persona strip, a Cursor-name adapter and a policy reversal of `code-style` rule 8. The value is one idea (PWRITE-9) that fits in a sentence.
- Evidence: PWRITE-8 to 11; the adapter maps `Task` to `Agent`, slugs to `model`/`effort` (`claude-code.md:5-39`), so the mechanics would work, but the policy cost is the blocker.
- Basis: Unverified (judgement)
- Code: none

**PWRITE-21. About 205 to 420 lines (tests included) of Qara doc-check code could be replaced by a paragraph; nothing in pstack replaces the hooks and gates, and the rest must stay code.**
Counted lines: `check-doc-terms.ts` 90 (tests 115), `check-doc-frontmatter.ts` 68 (tests 148), `check-stated-caps.ts` 54 (tests 47), `check-doc-line-cap.ts` 99, `check-test-separation.ts` 224, `check-source-file-sizes.ts` 300, `audit-tmpdir-handrollers.ts` 121, `pre-tool-use-naming.ts` 218 (tests 666), `check-doc-types.ts` 113, `check-doc-citations.ts` 300. Judged removable: `check-doc-terms.ts` and its test (205 lines), and at most the advisory mode of `check-doc-frontmatter.ts` (216 with tests). Writing rules (humaniser, PR body, plain language) have no code to remove: `humaniser` is prose plus a test, and the PR-body headings have no gate.
- Why: pstack's lesson here is the reverse of replacement. Its 19 style files are all requests, so replacing a check with its text turns a guarantee into a request. The code that is worth keeping blocks something at commit time or protects a number; the code worth removing only reports advice nobody is blocked by.
- Evidence: the table "What this could replace" with `path:line` for every verdict. `check-doc-frontmatter.ts` is "Advisory by default: prints the non-compliant count and always exits 0" with `--strict` only for the staged gate row. `check-doc-terms.ts` exits 0 with a notice when the glossary is absent; `config/doc-types.json:2` names `UBIQUITOUS_LANGUAGE.md`, so it does run, but its only rules are one-word-one-kind and "report needs a subkind".
- Basis: Verified (line counts, modes); Unverified (the verdicts: nothing tested, and whether either check ever catches a real problem was not measured)
- Code: none proposed here; deleting a gate row needs the owner's decision and a read of the gate registry, which was not done.

## What this could replace

Line counts by `wc -l`. "pstack prose" is the nearest text, not an equivalent: pstack has none that enforces anything. Qara's prose home would be `code-style`, `core/SKILL.md` or `doc-hygiene.md`.

| Qara code (lines) | Job | pstack prose | What code guarantees that prose cannot | Verdict | Risk |
| --- | --- | --- | --- | --- | --- |
| `scripts/check-doc-terms.ts` (90; test 115), gate row `scripts/gate/checks.test.ts:255` | Each glossary term maps to one registered doc kind; "report" needs a subkind | `technical-writing/SKILL.md:62` ("Call each thing by one name, everywhere"); `unslop` rule 11 | A failing commit on a glossary typo. In practice it prints a notice and passes when the glossary key is absent (`check-doc-terms.ts:5-9`) | Replace with doctrine: one line in `doc-hygiene.md` ("one word, one artifact kind; the glossary is `UBIQUITOUS_LANGUAGE.md`") and delete the check | Low. Registry drift goes unnoticed; not measured |
| `scripts/check-doc-frontmatter.ts` (68; test 148), `:staged` strict row `checks.test.ts:252` | Governed docs carry `kind:` and `reader:` | None | Strict mode blocks a commit that lacks frontmatter under `decisions/` and `docs/`; repo mode is advisory (exit 0) | Shrink: drop advisory repo mode, keep strict staged | Low |
| `scripts/check-stated-caps.ts` (54; test 47), row `checks.test.ts:231` | A number stated in a decision record equals the code constant | `technical-writing/SKILL.md:70` ("Make every count or tree claim true at the commit that lands it, and include the command that regenerates it"); pstack's `check-pstack-docs.mjs` is a code check for the same job | Catches drift in a cap stated in prose; prose cannot compare to a constant | Keep as code | Medium if removed: caps are enforced limits |
| `scripts/check-doc-line-cap.ts` (99) | SKILL.md at most 300, CLAUDE.md at most 120, workflows at most 300 lines | `authoring-a-skill.md:10` ("When in doubt, delete") | Its own header: "the cap IS the enforcement, not a warning about one" (`:5-6`) | Keep as code | Medium: files grow without it |
| `scripts/check-test-separation.ts` (224) and `audit-tmpdir-handrollers.ts` (121) | Sibling test files; no hand-rolled temp dirs (`code-style` rule 9) | None | Commit-time block on a structural rule | Keep as code | High if removed |
| `scripts/check-source-file-sizes.ts` (300) | 300 soft, 500 hard source-file size | `review-rubric.md:12` states it; pstack has `principle-minimize-reader-load` | Refusal at commit, which "will be refused at commit time" (`review-rubric.md:16`) | Keep as code | High |
| `.claude/hooks/pre-tool-use-naming.ts` (218; test 666) | Rewrites whimsical plan names to `YYYY-MM-DD-slug`; denies plan writes to `~/.claude/plans` | `worker.md`-style rules only for PR titles; no filename rule | The name is injected by plan mode, not chosen; the hook's own comment says the model cannot "compute a good name first" (`:21-24`). The hook rewrites input; a paragraph cannot | Keep as code (the one row where prose is provably unable to do it) | Medium |
| `scripts/check-doc-types.ts` (113), `check-doc-citations.ts` (300) | Doc registry and citation consistency | `technical-writing/SKILL.md:70` | Registry integrity and broken-citation block | Keep; not read beyond headers | Unverified |
| `skills/humaniser` (79 lines of prose, 360-line catalog, one test) | Conservative prose editing | `unslop` | Nothing: it is already prose | Keep; no code to remove | None |
| PR-body headings (Summary, Evidence, Merge Danger), `git-update-repo.md:173` | Body shape | `opening-a-pr.md:7` | Nothing: no gate exists. `scripts/landing/pre-review-check.ts` (226) reads the PR body only for an escape marker (`:50,95`) | Text only; add the 40-line cap sentence | Low |

Total judged removable in this area: `check-doc-terms.ts` and its test, 205 lines, plus up to 216 more if the advisory half of `check-doc-frontmatter.ts` is cut with its test, about 90 to 420 lines. Nothing in the prose checks that a paragraph is followed; pstack has no equivalent of any row marked Keep.

## Reference

### R1. Files covered

| File (pstack/) | Lines | Invoked how | Frontmatter notes | What it is |
| --- | --- | --- | --- | --- |
| `skills/unslop/SKILL.md` | 40 | `/unslop`, named by others | `disable-model-invocation: true` | 28 rules, ids 3 to 33 |
| `skills/technical-writing/SKILL.md` | 70 | `/technical-writing` | `disable-model-invocation: true`; description lists triggers | Four layers plus voice |
| `skills/no-comments/SKILL.md` | 24 | `/no-comments` | `disable-model-invocation: true`; description is a step summary | 6 steps |
| `agents/comment-sicko.md` | 32 | `subagent_type: "comment-sicko"` (CC: `pstack:comment-sicko`) | `name`, `description` only | Reviewer persona |
| `skills/architect/SKILL.md` | 11 | `/architect` | `disable-model-invocation: true` | One paragraph |
| `skills/typescript-best-practices/SKILL.md` | 31 | `/typescript-best-practices` | `paths` globs plus `disable-model-invocation: true` | 16-row table |
| `skills/typescript-best-practices/references/patterns.md` | 328 | pointer from SKILL | none | 14 example sections |
| `skills/poteto-mode/playbooks/feature.md` | 21 | routed by poteto-mode | none | 8 steps plus checkpoint |
| `.../refactoring.md` | 16 | same | none | 8 steps |
| `.../opening-a-pr.md` | 9 | end of every playbook | none | Title and body rule |
| `.../authoring-a-skill.md` | 12 | same | none | 4 steps plus advice |
| `skills/principle-{laziness-protocol,subtract-before-you-add,minimize-reader-load,model-the-domain,boundary-discipline,type-system-discipline,foundational-thinking,redesign-from-first-principles,make-operations-idempotent}/SKILL.md` | 10 to 18 each | cited by name from playbooks | `disable-model-invocation: true` | Nine principle leaves |
| `docs/guide/04-design.md`, `05-build-and-clean.md` | 127, 83 | prose | n/a | Usage guide |
| `cursor-team-kit/skills/deslop/SKILL.md` | 22 | `/deslop` | none | Five focus areas, three guardrails |

Files read in full: every file in this table. The Claude Code copies under `harness/pstack/claude-code/` are identical to the sources except for the added adapter line in `no-comments`, `architect` and `technical-writing`.

### R2. `unslop` rules, in full (ids as in the file; line = file line)

| Id | Line | Rule (verbatim or near) | Qara catalog counterpart | Authoring-block candidate |
| --- | --- | --- | --- | --- |
| 3 | 13 | No trailing "-ing" phrases that add no fact | Catalog 3 | no |
| 5 | 14 | No vague attributions; name the source or delete | Catalog 5 | no |
| 7 | 15 | No AI vocabulary: additionally, crucial, delve, enhance, foster, landscape, pivotal, showcase, testament, underscore, vibrant | Catalog 7 (21 words, wider) | no |
| 8 | 16 | Say "is" or "has", not "serves as", "stands as", "boasts", "features" | Catalog 8 | no |
| 9 | 17 | No "not just X, but Y" | Catalog 9 | no |
| 10 | 18 | Don't force ideas into threes | Catalog 10 | no |
| 11 | 19 | One name per thing. Repeat it | Catalog 11 | no |
| 12 | 20 | No "from X to Y" unless on a real scale | Catalog 12 | no |
| 13 | 21 | No em dashes, en dashes, or hyphens used as dashes, and no parentheses in their place; use a period or comma | Catalog 13, weak signal only | decision (Open 3) |
| 14 | 22 | A colon goes before a list or example, never mid-sentence as a connector | None | yes |
| 15 | 23 | Don't bold every proper noun or acronym | Catalog 14, weak | no |
| 16 | 24 | No bold label and colon that restates its line; a bold lead-in ending in a period that adds detail is fine | Catalog 15, weak | no |
| 17 | 25 | Sentence case headings | Catalog 16, weak | no |
| 18 | 26 | No decorative emojis | Catalog 17, weak | no |
| 19 | 27 | Straight quotes | Contradicted: `humaniser/SKILL.md:51` | no |
| 20 | 28 | No chatbot phrases | Catalog 18 | no |
| 22 | 29 | No praise or agreement openers | Catalog 20 | no |
| 23 | 30 | Cut filler ("in order to" to "to") | Catalog 21 | no |
| 24 | 31 | One hedge at most: "may" | Catalog 22 | no |
| 25 | 32 | No generic conclusions | Catalog 23 | no |
| 26 | 33 | No abstract metaphor nouns: substrate, wedge, vector, nexus, primitive, harness, surface, scaffolding, paradigm, ratchet, north star, flywheel | None (PWRITE-3) | with a defined-term exception |
| 27 | 34 | Say what it does, not how it feels; name the mechanism or the number; cut a sentence that could appear unchanged in another project's docs | None | yes |
| 28 | 35 | One idea per sentence; split what the reader must reread | None | yes |
| 29 | 36 | Active voice; name the actor unless unknown or irrelevant | None | yes |
| 30 | 37 | Cut adverbs or use a stronger verb; give the number | None | yes |
| 31 | 38 | Plain word: "use", not "utilize" or "leverage" | None | yes |
| 32 | 39 | No metaphor, aphorism, personified code or figurative verb where a literal phrase exists | None | yes |
| 33 | 40 | Whole sentences with articles and verbs; spell out arrows and abbreviations | None | yes |

Not in unslop but in Qara's catalog: significance and legacy (1), notability (2), promotional language (4), outline-style "challenges and prospects" (6), knowledge-cutoff disclaimers (19), collaborative artefacts partly (18). Procedure: line 9 only, no output format, no verification. Qara's own skill files use the dash unslop bans (`code-style/SKILL.md` has six ` — `, `core/SKILL.md` seven), so rule 13 would change Qara's house text.

### R3. `technical-writing` layers

| Layer | What it contributes | Concrete rules (file lines) | Qara counterpart |
| --- | --- | --- | --- |
| Opening and rhythm | Reader and word economy | Tired engineer, first read; cut idle words; short everyday word; real symbol names; no invented jargon; vary sentence length; be specific (`:9-21`) | `core/SKILL.md:119` (concise); none for the rest |
| Diátaxis | Document mode | Tutorial (every step shows a result), how-to (action only, allow forks, name by task), reference (describe only, mirror structure), explanation (context and alternatives; opinion allowed only here). One mode per document; split and link (`:23-30`) | None. `edit-article` maps an information DAG |
| Google developer style | Sentence to a reader | "you", present tense; who does what; commands, condition first, common case first; no buzzwords, "please", "simply", "easy", "quickly"; no pre-announcing; link text says where it goes; sentence-case headings, one h1, no skipped levels; numbered lists for sequences; parallel items; code font, bold UI; serial commas; drop "etc." (`:32-42`) | None |
| STE | Load of one statement | One instruction per sentence; split above about 20 (instructions) or 25 words; warning before the step; keep "the" and "a"; one meaning per word, one word per action; direct commands never passive; avoid "-ing" (`:44-52`) | None |
| Global English | Ambiguity | Keep "only" and "not" next to the word they change; break up noun strings; every "it", "they", "this" has one referent, never "this" or "which" for a clause; keep "that"; repeat articles in a series; say what "and" or "or" joins; periods not semicolons or dashes; no slashes or "(s)"; one name per thing; no idioms or Latin abbreviations (`:54-63`) | None |
| Voice and repo specifics | Scope | Apply `unslop` to every doc; PRs and commits are writing (all layers but Diátaxis); UI strings out of scope; tabs in snippets; make counts true at the commit that lands them and give the command that regenerates them (`:65-70`) | `doc-hygiene.md` (records only) |

Conflicts inside the skill: it asks for "serial commas" and bans "etc."; it also allows breaking any rule that "makes a sentence worse" (`:13`). The count rule (`:70`) is the only one with a mechanism: `check-pstack-docs.mjs`.

### R4. `no-comments` steps and the Comment Sicko keep list

| Step | Action | Enforced by |
| --- | --- | --- |
| Scope | Caller's files or diff; else current diff against `main` including the working tree (`:13-15`) | Prose |
| 1 | Spawn `Task` with `subagent_type: "comment-sicko"`; pick reasoning level per poteto-mode Subagents | Prose; adapter maps to `Agent` |
| 2 | Inspect report and diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, flags that call kept intentional code guilty. Audit missed lint and TypeScript suppressions. Trace thin `IMPORTANT` or `do not remove` claims or run `/why`. Ambiguous kill: do not restore. Refuted or ambiguous keep: delete. Revert and rerun one rejected report; a second rejection fails the skill | Prose |
| 3 | Fix trivial flags directly; if a fix needs a shape, run `/architect` once, stop at the sketch | Prose |
| 4 | Smallest root-cause fix in scope; remove every named workaround; no symptom guards; principles guide intent only | Prose |
| 5 | Constraint comments: offer cheapest type, runtime check, test or CI lint; wait for approval (interactive) or caller pre-approval (unattended); encode then delete, else delete and report open | Prose |
| 6 | Report: deletion count, restored comments, reruns, architect sketch, fixes, offers, encodings, unenforced constraints, other open work | Prose |

Keep list (Comment Sicko): legal or licence headers; non-obvious behaviour forced by an external dependency, platform, vendor or protocol we cannot reshape; `prettier-ignore`, and lint suppressions only when the rule is faulty, pedantic or style-only; doc comments defining a public API contract; issue or RFC links explaining a constraint code cannot express. Any other comment is deleted. A suppression that guards a real bug or safety property is killed and the symbol marked `MUST KILL`. "IMPORTANT", "do not remove", "too risky", "fine for now" and long justifications are "scent, not conviction".

### R5. What counts as a removable comment (consolidated)

| Removable | Kept |
| --- | --- |
| Narration of what the next line does | Licence header |
| Banners and section dividers | Doc comment on a public API |
| Commented-out code | Link to an issue or RFC for a constraint code cannot express |
| "Workaround sermons" and long justifications without a proven foreign keep | A foreign-system quirk proven true today on a live path |
| Comments on surprises in our own code (flag the symbol `MUST KILL`, reshape) | `prettier-ignore`; suppressions of a faulty or style-only rule |
| Suppressions that hide a real bug (kill, flag) | |
| `do not remove` and similar (offer an encoding, then delete) | |

### R6. `architect` as written

| Item | Text |
| --- | --- |
| Trigger | "/architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape" |
| Step 1 | Trace every system the change touches |
| Step 2 | Sketch two different shapes: types, signatures, module boundaries |
| Choice rule | One owner per piece of state; one way to do each task; callers need to know least |
| Rule | Redesign instead of patching if workarounds repeat |
| Escalation | Large or contested design: run `arena` instead |
| Output | A sketch in the reply; no file |
| Not in the file | The caller-usage step, the "stay in the loop" behaviour, any template |

Callers: `poteto-mode/SKILL.md:22`, `feature.md:6`, `refactoring.md:9` (conditional), `no-comments` step 3, README `:136`, guide `04-design.md`.

### R7. TypeScript rules (16)

| Rule | Example (patterns.md) | Rationale | Qara status |
| --- | --- | --- | --- |
| Discriminated unions | `DiffState` as a union of `kind: "loading"`, `"ready"`, `"error"` variants | Impossible states cannot be built | Not in `code-style`; rule 3 is a different rule |
| Branded types | `string & { readonly __brand: "AgentId" }` from a verifying guard | Mix-ups caught at compile time | Not stated; 0 uses of `__brand` |
| Constructive modeling | `NonEmpty<T> = [T, ...T[]]`; `start` plus `durationMs` | Illegal value cannot be constructed | `CLAUDE.md:40` states the idea (rung 1) |
| Simplest total type | Keep `number[]` for `sum`; strengthen when `!` or `at(0)!` appears | Do not over-strengthen | Not stated |
| `unknown` over `any` | `handle(input: unknown)` then narrow | External data is untrusted | `any` banned by `biome.json:33`; `unknown` rule absent; rubric `:79` flags unnecessary `unknown` |
| Schemas before guards | `z.infer` from a zod schema | One owner of validation | Not stated |
| No `as` casts | Parse with a schema, or annotate `z.ZodType<User>` | Cast is a runtime crash waiting | Not stated; rubric `:79` flags "unnecessary casts" |
| Narrowing hierarchy | discriminant > `in` > `typeof` > guard > `as` | Strongest check first | Not stated |
| Type guards | Must verify the claim | Lying guard hides bugs | Not stated |
| Exhaustiveness | `const _exhaustive: never = s` in default | Compiler fails on a new variant | Not stated; 5 uses in non-test code |
| `satisfies` over `as` | `{ ... } satisfies Config` | Validates without widening | Not stated; 33 uses |
| Boundary validation | Parse once; `ignoreUnknownFields` on wire formats | Trust types inside | Not stated; rubric rule 5 `:34-38` close |
| Schema-derived types | `Pick<ChecksMessage, ...>` | No drifting copy | Not stated |
| Object args | `openFile({ uri, selection })`; skip on hot paths | Order cannot be swapped | `code-style` rule 3 for booleans only |
| Real tests | "Don't mock what you can run" | Real primitives and leak checks | `core/SKILL.md:93` and `CLAUDE.md:40` say the same |
| Structured telemetry | Logger with an id, no `console.log` | Debuggable from an id | `finish/references/dimensions.md:93` ("No console logs in production") |

Mechanically enforced in Qara: `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` (`tsconfig.json:21-24`), `noExplicitAny` (`biome.json:33`). No rule exists for `as`, `!`, exhaustiveness or `unknown`.

### R8. Principles in scope, mapped

| Principle | One line | Qara nearest | Gap |
| --- | --- | --- | --- |
| laziness-protocol | Consolidate decisions; minimise the diff | `review-rubric.md:5-10,24-28`; `code-style` rule 5 | Named principle only |
| subtract-before-you-add | Remove first, then build | `review-rubric.md:93,103`; `CLAUDE.md` deletion rule | Sequencing rule |
| minimize-reader-load | Layers and hidden state; 30-second test | `deep-modules.md`; `depth-discovery.md:22` | The 30-second test |
| model-the-domain | Structure over scattered conditionals | `review-rubric.md:18-23,94,100` | Named principle only |
| boundary-discipline | Validate at the edge, pure core | `review-rubric.md:34-38` | Named principle only |
| type-system-discipline | Brand, parse, derive | `CLAUDE.md:40` | See R7 |
| foundational-thinking | Data shape before logic | `create_plan.md` reasoning gate, `architect` agent | Named principle only |
| redesign-from-first-principles | Redesign as if foundational | `agents/architect.md:37` ("start from zero") | Partial |
| make-operations-idempotent | Converge from any partial state | Not found in three files searched | Possibly new; PPRIN to confirm |

### R9. PR and commit conventions

| Item | pstack | Qara | csf |
| --- | --- | --- | --- |
| Title | `type(scope): subject`, real symbol if one carries the change (`opening-a-pr.md:7`, `worker.md:9`) | `type(scope): summary` (`git-update-repo.md:58`) | Not found |
| Body headings | Why, What changed, Scope, Tradeoffs, Blast Radius, Verification | Summary, Evidence, Merge Danger (`:173`) | Not found |
| Length | Under 40 lines (`opening-a-pr.md:7`, `worker.md:10`) | None | Not found |
| Logs and tables | Link, do not paste (`technical-writing:68`, `worker.md:11`) | None stated | Not found |
| Attribution lines | Not mentioned | None allowed (`:174`) | Not found |
| Draft state | Ready, never draft | `isDraft=false` at landing (`:110`) | Not found |
| Commit body | Not specified; `pause-safely.md:7` uses a `wip:` commit | Not specified | Not found |
| Prose pass | `/unslop` on PR and commit text (`05-build-and-clean.md:59`); `/deslop` on the diff | Optional `humaniser` for marketing and docs (`design-cookbook.md:217`) | Not found |

`deslop` (cursor-team-kit, 22 lines): focus areas are extra comments, abnormal defensive checks, `any` casts, deep nesting (early returns) and inconsistent patterns; guardrails keep behaviour, prefer minimal edits and a 1 to 3 sentence summary. Qara's `code-style` rule 2 covers the nesting point; the rest sits in `review-rubric.md:29-33,79`.

### R10. Qara comparison map

| Job | pstack | Qara | Position |
| --- | --- | --- | --- |
| Prose bans at write time | `unslop` | None; `humaniser` edits | Behind (rules 27 to 33) |
| Prose editing with fidelity | None | `humaniser`, `edit-article` | Ahead |
| Doc standard | `technical-writing` | None | Behind |
| Comment policy | `no-comments` | `code-style` rules 8 and 10 | Opposite |
| Comment review | Comment Sicko | None | Behind (by design?) |
| Shape before code | `architect` | `design-it-twice`, `depth-discovery`, `agents/architect.md`, `/create_plan` | Level or ahead |
| Interface rules | None beyond principles | `interface-design.md`, `deep-modules.md` | Ahead |
| TypeScript rules | 16 | `strict`, `noExplicitAny`, rule 3 | Behind |
| Diff-scoped simplify | `deslop` | `/simplify` (bundled, not read), `code-style` | Unverified |
| PR body | Six headings, 40 lines | Three headings, no cap | Different |

### R11. Risky embedded instructions (in this feature's files)

| Where | Instruction | Risk |
| --- | --- | --- |
| `no-comments/SKILL.md:20` | Delete comments when a keep is ambiguous; revert and rerun a rejected report | Deletion made under doubt; revert method unstated; a shared tree can lose peer edits |
| `comment-sicko.md:8-10` | Fixed first output, deranged persona | Wasted tokens; persona inflation |
| `comment-sicko.md:1-4` vs README `:220` | "Read-only" with no tool restriction | Reviewer can write files |
| `opening-a-pr.md:7` | "Rebase into small, landable commits" | Rewrites history; Qara requires explicit instruction (`git-update-repo.md:134-136`) |
| `opening-a-pr.md:9`, `worker.md:8` | Open PRs ready, never draft | Skips the draft stage that exposes work in progress |
| `worker.md:7` | "Never call a tool that shows a person a question"; stop only for deploys, deleted data, force-push, outside messages | Conflicts with tobogan W-1; owned by PMODE and PPAR |
| `no-comments/SKILL.md:23` | Unattended runs need "caller pre-approval" for encodings | The approval may be a generic pre-grant |
| `opening-a-pr.md:9` | `origin pr create --status open` | Cursor-only CLI; not available in Claude Code (`claude-code.md:65-68`) |

No instruction here asks for secrets, webhooks, installs or permission bypass.

## Borrow list

| Rank | What | Target | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | **Removes code.** Replace `check-doc-terms.ts` (90 lines, 205 with test) with one line in `doc-hygiene.md`: one word, one artifact kind; glossary is `UBIQUITOUS_LANGUAGE.md` | Qara `scripts/check-doc-terms.ts` and its gate row; `.claude/context/doc-hygiene.md` | -205 lines, +1 line | Low; registry drift unmeasured | Open 1 |
| 2 | `typescript-style` sibling: discriminated unions, no `as` on unvalidated data, `unknown` at the parse boundary, `never` exhaustiveness, `satisfies`, schema-derived types, schema before guard, narrowing order; filtered against `biome.json` and `tsconfig.json` | New `.claude/skills/typescript-style/SKILL.md`, listed in the engineers' `skills:` (as `rust-style` is) | About 25 lines | Low to medium: reviewer starts flagging at suggestion severity; reconcile with `review-rubric.md:79` | Open 4, Open 5 |
| 3 | Authoring-time prose block: unslop 14, 27 to 33 plus the Diátaxis mode-first and 20/25-word rules | `core/references/prose-rules.md`, pointer or inline line in `core/SKILL.md` Writing Directives | About 12 lines | Low; always-active text costs tokens every session | Open 3 |
| 4 | "A comment that claims a constraint becomes a type, assertion or test; if none is cheap, state the constraint once and name its owner" | One sentence added to `code-style/SKILL.md:46` (rule 10), Structural | 1 sentence | Low; promotion ladder applies (`code-style:49-52`) | Open 2, Open 4 |
| 5 | PR body cap and link-do-not-paste rule | `git-update-repo.md:173` | 1 line | Low; keep Merge Danger | None |
| 6 | "Write the caller's usage first" | `core/references/interface-design.md` | 1 line | Negligible | None |
| 7 | Reader-load 30-second test | `review-rubric.md` or `deep-modules.md` | 1 line | Low; PPRIN may own it | PPRIN |
| 8 | **Adds code.** A check for count and tree claims in docs ("true at the commit, include the command") like `check-pstack-docs.mjs` | tobogan `factory/checks`. Text-only alternative: the sentence from `technical-writing/SKILL.md:70` in `doc-hygiene.md`; Qara already has `check:stated-caps` for its caps | Not sized | Medium; adds machinery | PPACK |

Do not borrow: the `no-comments` skill and Comment Sicko (policy conflict and persona; PWRITE-10, 11, 20); `unslop` rule 19 (Qara's humaniser says curly quotes are normal) and rule 26 as a word ban (PWRITE-3); the `technical-writing` tab rule and UI-string deferral; `architect` as a skill (one paragraph, Qara's `design-it-twice` is richer); `deslop` (22 lines, covered by `code-style` and the review rubric); the delete-bias of `authoring-a-skill` against Qara's checklist (NSKILL-17 owns that); the six-heading PR body as a replacement for Summary, Evidence and Merge Danger.

## Open

Each is phrased to be asked alone.

1. **Replace `check-doc-terms.ts` (90 lines, 205 with its test) with one line in `doc-hygiene.md`?** The line: "One word names one artifact kind; the glossary is `UBIQUITOUS_LANGUAGE.md`." The check passes silently when the glossary is absent and only enforces one-word-one-kind. Recommendation: yes, after one look at the gate registry for other users of `scripts/lib/doc-checks.ts`.
   Related, same form: cut the advisory repo mode of `check-doc-frontmatter.ts` (68 lines, 216 with test), keeping the strict staged row? Recommendation: yes, if the owner never reads its advisory count.
2. **Comment policy.** Keep `code-style` rule 8 (a what/why comment on each new block), drop it, or replace it with "comments only for constraints and why"? Recommendation: replace rule 8 with the rule-10 wording plus the encoding sentence (borrow 4), without a comment-deleting pass. Rule 8 is Cosmetic, so dropping it changes no review finding.
3. **Where do prose rules load, and is the dash ban in?** Always-active in `core/SKILL.md`, a reference file read on request, or the engineers' preload? And ban dashes (unslop 13) or leave it to `humaniser`'s weak-signal stance? Recommendation: a reference file, 12 lines, no dash ban (Qara's own skill files use ` — `).
4. **Promotion ladder.** `code-style` § "Adding a rule" requires a memory `feedback` first and a second cross-session repeat. Do these borrows go through the ladder, or is a research-backed addition exempt? Recommendation: exempt a new sibling file (`typescript-style`), not edits to `code-style` itself.
5. **TypeScript rule set.** Which of the eight in borrow 2 does JM want as Structural (suggestion severity) and which not at all? Recommendation: unions, `as`, exhaustiveness and `unknown`-at-boundary only.
6. **A check for any of this?** pstack has none; Qara could grep for ` as unknown as ` growth or a banned-word list. Recommendation: no check until a rule is repeated across sessions.

Facts still unknown: what unslop ids 1, 2, 4, 6 and 21 held (shallow clone); the official ASD-STE100 Issue 9 limits (only a secondary source read); what Claude Code's `/simplify` does and whether it overlaps `deslop` (no file in the Qara tree); whether agents follow `unslop` unprompted in practice (we ran nothing); Qara's idempotency rules outside three files; whether JM's reply-style rules exist outside the files searched (the brief points at `~/.claude` rules, but `~/.claude/rules` does not exist); csf's PR-body rules (only a grep).

## Sources

pstack, commit `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` of `cursor/plugins`: `pstack/skills/{unslop,technical-writing,no-comments,architect,typescript-best-practices,poteto-mode}`, `pstack/skills/principle-*`, `pstack/agents/comment-sicko.md`, `pstack/docs/guide/{04-design,05-build-and-clean}.md`, `pstack/docs/harness/claude-code.md`, `pstack/README.md`, `pstack/plugin.json`, `cursor-team-kit/skills/deslop/SKILL.md`, `harness/pstack/claude-code/`, `scripts/check-pstack-docs.mjs`.

Qara files listed under Sources above, plus `docs/HARNESS-PARITY.md` (existence only) and `decisions/2026-11-04-testing-ladder-replaces-fixtures.md` (cited from `CLAUDE.md:40`).

tobogan: `DOCTRINES.md`, `noodle/modes.md` (structure model), `noodle/skills.md` (NSKILL-17), `factory/humans-md.md`, `factory/checks/check-repo.mjs`.

External: TechScribe, "ASD-STE100 Simplified Technical English", https://techscribe.co.uk/techw/asd-simplified-technical-english.htm (secondary, sentence limits only).

Cross-references: PMODE (subagent models, mandatory delegation in `feature.md:12`, `worker.md:7`), PPRIN (the other principles, R8), PPAR (`arena`, PR opening), PPROOF (pins and equivalence in `refactoring.md`), PLEARN (`/teach`, `/why`, used by `no-comments` step 2), PPACK (adapter, `check-pstack-docs.mjs`).
