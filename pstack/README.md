# pstack

Study of pstack (`cursor/plugins`, directory `pstack/`, MIT, by the author of Noodle, read at commit `7a583913`): about sixty skills, playbooks and principles written as prose with almost no code. Each document says how a feature works, how sound it is, how it compares with Qara and csf, and, following the owner's steer of 2026-11-23 to simplify Qara and csf by replacing code with workflows and doctrine, which Qara or csf code a written rule could replace and what would be lost. Nothing from the repository was run or installed, and none of its instructions to agents were followed.

## Before acting on any "What this could replace" row

The replacement tables are proposals. Their line counts were measured, but callers were not traced exhaustively: four rounds of blind review each found one more gate or hook behind a row that proposed a removal. Treat every "replace" or "shrink" verdict as unproven until the code's callers are traced, in this order:

1. Importers: search the file's name across Qara including hidden directories (`rg --hidden`), since hooks live under `.claude/`.
2. Gate rows: `scripts/gate/` and the `check:*` scripts in `package.json`, including the aggregators that fan out (`check:indexes`, `check:config-family`, `check:skills`).
3. Hooks: `.claude/hooks/` and the Rust guards in `hooks-rs`.
4. Unattended runs: the daily state-hygiene cron, nightly operations and the standing-audits registry.
5. The code ledger: removing any Qara `.ts` file also needs its entry removed from `config/code-ledger.toml`, which a commit-gate row checks.

A row that says "not read" or "callers not traced" means exactly that.

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `poteto-mode.md` | Research | PMODE | How the entry skill, its 22 playbooks and the wrapper agent route a task, whether "one mode skill plus short playbooks" beats Qara's routing, and which routing code a paragraph could replace | 2026-11-23 |
| `principles.md` | Research | PPRIN | What the 24 principle skills say, which are operational and which are slogans, how each compares with Qara's rules, and which Qara checks exist only to enforce a principle | 2026-11-23 |
| `parallel-and-autonomous.md` | Research | PPAR | How arena, swarm, interrogate, the role-to-model rule and the unattended and landing playbooks work, how they compare with turbo, pi, the landing path and csf's drain, and which orchestration code is judgement a playbook could carry | 2026-11-23 |
| `verification.md` | Research | PPROOF | How pstack proves work is right (generated verify skills, formal verification, statecharts, the benchmark checklist, blinded evals), and which Qara verification machinery is a gate and which is bookkeeping | 2026-11-23 |
| `learning-and-explaining.md` | Research | PLEARN | How pstack learns from past work and rebuilds context (reflect, correct, recall, catch-up, explanation skills), what leaves the machine, and what that means for Qara's dream, memory and handoff code | 2026-11-23 |
| `writing-and-code-craft.md` | Research | PWRITE | What the prose and code craft skills require (unslop, technical writing, comment removal, TypeScript rules, design-first), which rules Qara lacks, and which style and doc checks could become a paragraph | 2026-11-23 |
| `packaging-and-automations.md` | Research | PPACK | How pstack is packaged and ported across harnesses, what its generator and CI check, what the Slack automation pack does unattended, and which Qara cross-harness and check scripts could become a written workflow | 2026-11-23 |
