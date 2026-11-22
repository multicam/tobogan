// Run plan and concurrency ramp (INFER-7: ramp up rather than burst).
//
// Order: for each repetition r, every (task, cell) pair once, shuffled with a seeded PRNG so
// cells interleave; runs of the same cell are never adjacent inside a repetition block.

export type PlanItem = { runId: string; task: string; cell: string; rep: number };

export type Ramp = { start: number; max: number; raiseEvery: number };

export const runIdOf = (task: string, cell: string, rep: number): string => `${task}__${cell}__r${rep}`;

// mulberry32: small deterministic PRNG, enough for run-order shuffling.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Greedy reorder so no two neighbours share a cell (possible whenever no cell exceeds half).
function interleave(items: PlanItem[]): PlanItem[] {
  const left = [...items];
  const out: PlanItem[] = [];
  while (left.length > 0) {
    const prev = out.at(-1)?.cell;
    const counts = new Map<string, number>();
    for (const it of left) {
      counts.set(it.cell, (counts.get(it.cell) ?? 0) + 1);
    }
    // Prefer the most frequent remaining cell that differs from the previous one.
    let pick = -1;
    let best = -1;
    left.forEach((it, i) => {
      const c = counts.get(it.cell)!;
      if (it.cell !== prev && c > best) {
        best = c;
        pick = i;
      }
    });
    out.push(...left.splice(pick === -1 ? 0 : pick, 1));
  }
  return out;
}

export function buildPlan(tasks: string[], cells: string[], reps: number, seed: number): PlanItem[] {
  const rand = prng(seed);
  const plan: PlanItem[] = [];
  for (let rep = 0; rep < reps; rep++) {
    const block = tasks.flatMap((task) => cells.map((cell) => ({ runId: runIdOf(task, cell, rep), task, cell, rep })));
    plan.push(...interleave(shuffle(block, rand)));
  }
  return plan;
}

export function pending(plan: PlanItem[], done: Set<string>): PlanItem[] {
  return plan.filter((p) => !done.has(p.runId));
}

// Raise one step after `raiseEvery` clean completions; halve on any rate limit.
export function nextConcurrency(current: number, state: { cleanSinceChange: number; rateLimited: boolean }, ramp: Ramp): number {
  if (state.rateLimited) {
    return Math.max(1, Math.floor(current / 2));
  }
  if (state.cleanSinceChange >= ramp.raiseEvery) {
    return Math.min(ramp.max, current + 1);
  }
  return current;
}
