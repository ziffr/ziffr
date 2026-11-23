// The budget of Heads-up scans a person may start (GLOSSARY: Heads-up; spec 0041, ticket 14). Where a Workspace has more Metrics in
// use than a scan looks at, a person's Heads-ups are worked out by scanning their own Metrics, which costs up to 200 Metrics' values
// per call. This keeps the FINISHED Heads-ups of such a scan (a few kilobytes; the pair rows themselves are about 640 bytes each,
// 12.7 MB for 19,900, measured, and are never kept) for a few minutes and counts the scans a person starts, so a page that is
// opened again and again, or a script that asks again and again, cannot make the server scan again and again.
//
// A kept result is only ever used for the SAME signature (the Metrics the person may see and everything the words are made from:
// names, slugs, formulas, number style), so a Metric hidden, shown, renamed or changed since is never answered from an older
// result; and what is kept is the person's own (the key holds the Workspace and the person). Entries are bounded per Workspace
// and in all, so one tenant cannot push another's out. Pure and in memory: nothing is written anywhere.
/** How long a kept result stands, in milliseconds. */
export const KEEP_MS = 10 * 60_000;
/** How many scans one person may start in an hour. */
export const SCANS_PER_HOUR = 6;
/** How many results are kept at most in all, and for one Workspace (the oldest of that Workspace go first), so that one tenant cannot push out another's. */
export const KEEP_AT_MOST = 2000;
/** How many results are kept at most for one Workspace. */
export const KEEP_PER_WORKSPACE = 100;
/** How many people's scan counts are kept at most (a count is small). */
export const COUNT_AT_MOST = 5000;
/** How long a kept result may still answer for a person over their budget, in milliseconds. */
export const STALE_MS = 60 * 60_000;
/** How many scans run at the same time in one process for people at a page, and for the job (its own lane). */
export const AT_ONCE = 2;
/** How many may wait for a place at most; beyond that a call is told to try again. */
export const WAITING_AT_MOST = 50;

const HOUR_MS = 3_600_000;

type Kept<T> = { at: number; sig: string; value: T };

/** The signature a kept result is matched against: the Metrics' ids in order, then `extra` (what else the words depend on). */
export function signature(ids: readonly number[], extra = ""): string {
  return `${[...ids].sort((a, b) => a - b).join(",")}|${extra}`;
}

/** The kept results and the scan counts. `T` is what a scan gives. Keys are "workspace:person". */
export class ScanBudget<T> {
  private kept = new Map<string, Kept<T>>();
  private started = new Map<string, number[]>();

  /** The result kept for `who` over exactly `sig`, if it is younger than KEEP_MS. */
  fresh(who: string, sig: string, now: number): T | null {
    const k = this.kept.get(who);
    return k && k.sig === sig && now - k.at < KEEP_MS && now >= k.at ? k.value : null;
  }

  /** The result kept for `who` over exactly `sig`, at most an hour old: what answers when the person is over their budget. */
  stale(who: string, sig: string, now: number): T | null {
    const k = this.kept.get(who);
    return k && k.sig === sig && now - k.at < STALE_MS && now >= k.at ? k.value : null;
  }

  /** Whether `who` may start another scan now: fewer than SCANS_PER_HOUR in the last hour. */
  mayScan(who: string, now: number): boolean {
    return this.recent(who, now).length < SCANS_PER_HOUR;
  }

  /** Counts a scan `who` started. */
  scanned(who: string, now: number): void {
    const counts = [...this.recent(who, now), now];
    // Set again at the back of the line, so the one who asks most is the last to be forgotten.
    this.started.delete(who);
    this.started.set(who, counts);
    // A person who stopped asking leaves no count behind for ever.
    if (this.started.size > COUNT_AT_MOST) this.started.delete(this.started.keys().next().value!);
  }

  /** Keeps `value` as the result for `who` over `sig`; the oldest of the same Workspace go first, then the oldest of all. */
  keep(who: string, sig: string, value: T, now: number): void {
    this.kept.delete(who);
    const prefix = `${who.split(":")[0]}:`;
    const same = [...this.kept.keys()].filter((k) => k.startsWith(prefix));
    for (const old of same.slice(0, Math.max(0, same.length + 1 - KEEP_PER_WORKSPACE))) this.kept.delete(old);
    this.kept.set(who, { at: now, sig, value });
    if (this.kept.size > KEEP_AT_MOST) this.kept.delete(this.kept.keys().next().value!);
  }

  /** Forgets everything (for tests). */
  clear(): void {
    this.kept.clear();
    this.started.clear();
  }

  private recent(who: string, now: number): number[] {
    return (this.started.get(who) ?? []).filter((t) => now - t < HOUR_MS);
  }
}

/** Runs `work` with at most `limit` of them running at once in this process; the rest wait in turn, at most `waiting` of them
 * (a call beyond that is refused, so a crowd cannot queue for ever). */
export function limiter(limit: number = AT_ONCE, waiting: number = WAITING_AT_MOST): <R>(work: () => Promise<R>) => Promise<R> {
  let running = 0;
  const queue: (() => void)[] = [];
  return async <R>(work: () => Promise<R>): Promise<R> => {
    // A finished run hands its place straight to the next in line, so the count never passes the limit.
    if (running >= limit) {
      if (queue.length >= waiting) throw new Error("Heads-ups could not be read. Try again in a moment.");
      await new Promise<void>((go) => queue.push(go));
    } else running++;
    try {
      return await work();
    } finally {
      const next = queue.shift();
      if (next) next();
      else running--;
    }
  };
}
