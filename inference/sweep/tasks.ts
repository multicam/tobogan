// The five sweep tasks: merged multicam/qara PRs, redone from the PR's first parent.
// Oracle = the PR's own test file(s) from the merge commit, run on a clean export of the
// parent with only the model's non-test diff applied. Briefs are problem statements written
// from the PR title and body, with no diff or fix mechanics.
// #1508, #1468 and #1543 are reused from Qara's 2026-11-12 sweep (briefs recovered verbatim).

export type Task = {
  id: string;
  kind: string;
  repo: string;
  parent: string;
  merge: string;
  testFiles: string[];
  brief: string;
};

const QARA = `${process.env.HOME}/qara`;

export const TASKS: Task[] = [
  {
    id: "q1508",
    kind: "small parsing fix (TS, 1 src file)",
    repo: QARA,
    parent: "a69aa21b1c7336f4a5103b0393176d443724b8a6",
    merge: "0589c54199942c20139c9b36a429dd15ea874ad3",
    testFiles: ["scripts/test-rust.test.ts"],
    brief:
      "scripts/test-rust.ts decides the exit code of a Rust test run by reading cargo/libtest summaries (it rejects runs where zero tests executed). When the environment sets CARGO_TERM_COLOR=always, libtest wraps parts of the summary (e.g. the `ok` result word) in ANSI terminal escape sequences, so the summary no longer matches and a successful run is falsely rejected. Make the pure exit-code decision tolerate ANSI-coloured summaries: a coloured successful summary must be counted exactly like the plain one. Existing verdicts (empty aggregate, nonzero cargo exit) must not change.",
  },
  {
    id: "q1468",
    kind: "test seam + flag pass-through (TS, 2 src files + doc)",
    repo: QARA,
    parent: "0f3a35bfc9e0db34290d5997ad77c1e5a6cdbc7a",
    merge: "5661f1f5bc526864e377164f071282b3b97f882e",
    testFiles: ["scripts/pi-lane-status.test.ts"],
    brief:
      "`scripts/pi-lane-status.ts --all-projects` currently only widens which panes are kept; the `bsvc runs list` call it makes is never given `--all-projects`. So a Run belonging to another project reads as `not-listed`, is never treated as terminal, and is never flagged `TEARDOWN-INCOMPLETE`. Fix it: when allProjects is set, the lane-status read must pass `--all-projects` to `bsvc runs list` (and must not when it is unset), so a terminal Run of another project gets flagged `TEARDOWN-INCOMPLETE`. The acceptance tests need a test seam: the lane-status reader should accept an optional command runner, defaulting to the real one. Related collection code lives in scripts/lib/pi-lane-collect.ts; the pi skill doc (.claude/skills/pi/SKILL.md) may mention the flag.",
  },
  {
    id: "q1543",
    kind: "read-at-ref, fail closed (TS, 2 src files)",
    repo: QARA,
    parent: "2a91af133f814cd516e9eb93e7e195a551acf542",
    merge: "72c965796a27c38844754d279df5c5983ea3c6f0",
    testFiles: ["scripts/gate/mutation-audit.test.ts"],
    brief:
      "`bun scripts/gate/mutation-audit.ts --only <file> --ref <sha>` (qara mode, i.e. without --root/--targets) reads the survivor allowlist (config/stryker-survivors-allowlist.json) from the working-tree checkout, not from the commit named by --ref. Only targets mode reads files at the ref. Consequences: an audit of a PR head that changes the allowlist is judged against the checkout's copy; and when the ref has no allowlist file, the audit silently passes on the checkout's copy.\n\nRequired behaviour in qara mode with --ref: the classification allowlist (and only it) is read from that commit. If the ref has no allowlist, or a malformed one, the audit fails closed (exit 3, error naming the failed read) — never fall back to the checkout. Targets mode keeps its existing behaviour; without --ref, behaviour is unchanged (working-tree allowlist). Runtime wiring lives in scripts/gate/mutation-audit-runtime.ts and scripts/gate/mutation-audit.ts.",
  },
  {
    id: "q1928",
    kind: "shell-script hardening (bash, 1 src file)",
    repo: QARA,
    parent: "862a03230b91cb7e5f70a8758bc93e9ad976c75a",
    merge: "4a32dc72482484fb05089d2b5b5e7abee51cafaf",
    testFiles: ["scripts/log-rotate.test.ts"],
    brief:
      "scripts/log-rotate.sh passes shell-variable operands to `rm` without an end-of-options separator, so a value that begins with `-` would be parsed as an option rather than a path. Harden every `rm` in that script that receives a variable operand: the variable operand must come directly after `--` (only short options such as `-f` may precede the separator). Do not change any other behaviour of the script.",
  },
  {
    id: "q1862",
    kind: "small feature: accept a new name shape (TS, 1 src file)",
    repo: QARA,
    parent: "292852162fe02b4864e3026c3f6b9ee1f68612c2",
    merge: "5e4eccb5c4f3b3a926f69d042a0342ddbda02911",
    testFiles: ["scripts/closeout/delete-merged-branch.test.ts"],
    brief:
      "scripts/closeout/delete-merged-branch.ts deletes merged branches. In remote mode it refuses (usage error) any branch name outside the patterns it accepts, so a merged `origin/pi-run-<RunId>` branch cannot be closed out. Make remote mode also accept branches named `pi-run-<RunId>`, where RunId has the exact shape that bsvc mints: 22 characters from [A-Za-z0-9-], with the first and last character alphanumeric. Local mode must keep refusing these names. Names that are too short or too long, that start or end with `-`, that contain other characters, or that use a different prefix must still be refused. Every other accepted pattern and every existing safety proof (ref format, a single origin, merge-into-master ancestry or a MERGED PR head, the tip lease) applies unchanged.",
  },
];

export const taskById = (id: string): Task | undefined => TASKS.find((t) => t.id === id);
