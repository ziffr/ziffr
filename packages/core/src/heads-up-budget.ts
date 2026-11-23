// The budget of Heads-up scans a person may start (GLOSSARY: Heads-up; spec 0041, ticket 14). Where a Workspace has more Metrics in
// use than a scan looks at, a person's Heads-ups are worked out by scanning their own Metrics, which costs up to 200 Metrics' values
// per call. This keeps the rows of such a scan for a few minutes and counts the scans a person starts, so a page that is opened
// again and again, or a script that asks again and again, cannot make the server scan again and again.
//
// A kept result is only ever used for the SAME set of Metrics the person may see (the set is part of what is compared), so a
// Metric hidden or shown since is never answered from an older result; and what is kept is the person's own (the key holds the
// Workspace and the person). Pure and in memory: nothing is written anywhere, and a restart only makes the next call scan.
/** How long a kept result stands, in milliseconds. */
export const KEEP_MS = 10 * 60_000;
/** How many scans one person may start in an hour. */
export const SCANS_PER_HOUR = 6;
/** How many results are kept at most (the oldest go first): each holds up to 20,000 pair rows, so the number is small. */
export const KEEP_AT_MOST = 20;
/** How many people's scan counts are kept at most (a count is small). */
export const COUNT_AT_MOST = 5000;
/** How long a kept result may still answer for a person over their budget, in milliseconds. */
export const STALE_MS = 60 * 60_000;
/** How many scans run at the same time in one process; the others wait their turn. */
export const AT_ONCE = 2;

const HOUR_MS = 3_600_000;

type Kept<T> = { at: number; ids: string; value: T };

/** The kept results and the scan counts. `T` is what a scan gives. */
export class ScanBudget<T> {
  private kept = new Map<string, Kept<T>>();
  private started = new Map<string, number[]>();

  /** The result kept for `who` over exactly `ids` (the Metrics they may see, in any order), if it is younger than KEEP_MS. */
  fresh(who: string, ids: readonly number[], now: number): T | null {
    const k = this.kept.get(who);
    return k && k.ids === idsText(ids) && now - k.at < KEEP_MS && now >= k.at ? k.value : null;
  }

  /** The result kept for `who` over exactly `ids`, at most an hour old: what answers when the person is over their budget. */
  stale(who: string, ids: readonly number[], now: number): T | null {
    const k = this.kept.get(who);
    return k && k.ids === idsText(ids) && now - k.at < STALE_MS && now >= k.at ? k.value : null;
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

  /** Keeps `value` as the result for `who` over `ids`. */
  keep(who: string, ids: readonly number[], value: T, now: number): void {
    this.kept.delete(who);
    this.kept.set(who, { at: now, ids: idsText(ids), value });
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

/** The ids as one text, in order, so that the same set in any order is the same text. */
function idsText(ids: readonly number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

/** Runs `work` with at most `AT_ONCE` of them running at once in this process; the rest wait in turn. */
export function limiter(limit: number = AT_ONCE): <R>(work: () => Promise<R>) => Promise<R> {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <R>(work: () => Promise<R>): Promise<R> => {
    // A finished run hands its place straight to the next in line, so the count never passes the limit.
    if (running >= limit) await new Promise<void>((go) => waiting.push(go));
    else running++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
