# noodle

Study of Noodle (`poteto/noodle`, MIT, Go, v0.1.5, read at commit `82d2921c`) and its brainmaxxing skill pack (read at `ec4d8e43`): how each feature works in the source, how sound it is, how it compares with what Qara and csf already do, and what is worth borrowing. Nothing from either repository was run or installed.

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `skills.md` | Research | NSKILL | How Noodle skills work (format, discovery, loading, a skill as a schedulable task type, composition, validation, the shipped skills), how that compares with Qara's skills and csf-build's stages, and which parts of "skills that run themselves" to borrow | 2026-11-23 |
| `scheduling.md` | Research | NSCHED | How Noodle schedules work (an agent-written order queue, per-stage model routing, a serialised loop with crash recovery), and whether an agent-run scheduler should replace or inform csf's drain order and Qara's delegation tiers | 2026-11-23 |
| `brain.md` | Research | NBRAIN | What the brain and the brainmaxxing self-learning loop are, how much is enforced by code, and what they would add to or replace in Qara's and csf's memory machinery | 2026-11-23 |
| `modes.md` | Research | NMODE | How the three run modes (auto, supervised, manual), the review and approval flow, the control commands and git-worktree isolation work, how far each is enforced, and whether a three-level autonomy dial would simplify Qara's and csf's separate rules | 2026-11-23 |
| `adapters-events-runtimes.md` | Research | NADAPT | How adapters (backlog sync), events and runtimes (process, Sprites, session capture) work, how they compare with pi/bsvc/herdr/hooks, csf stage dispatch, the board and the sweep harness, and what to borrow | 2026-11-23 |
| `cli-config-observability.md` | Research | NVIEW | What the CLI, `.noodle.toml`, the `.noodle/` state directory, the monitor, server and web UI, the install path and the project's own engineering practice do, and which are worth borrowing or running as they are | 2026-11-23 |
