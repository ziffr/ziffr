// The budget of a person's Heads-up scans (GLOSSARY: Heads-up): what is kept, for how long, for which Metrics, and how many scans an
// hour; every edge one step either side.
import { describe, expect, it } from "vitest";
import { AT_ONCE, COUNT_AT_MOST, KEEP_AT_MOST, KEEP_MS, SCANS_PER_HOUR, STALE_MS, ScanBudget, limiter } from "./heads-up-budget";

describe("the kept result", () => {
  it("answers only for exactly the same Metrics, in any order, and only while it is younger than ten minutes", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", [3, 1, 2], "rows", 1000);
    expect(b.fresh("w:p", [1, 2, 3], 1000)).toBe("rows");
    expect(b.fresh("w:p", [2, 3, 1], 1000 + KEEP_MS - 1)).toBe("rows");
    expect(b.fresh("w:p", [1, 2, 3], 1000 + KEEP_MS)).toBeNull();
    // One Metric more or fewer, or one other: nothing.
    expect(b.fresh("w:p", [1, 2], 1000)).toBeNull();
    expect(b.fresh("w:p", [1, 2, 3, 4], 1000)).toBeNull();
    expect(b.fresh("w:p", [1, 2, 4], 1000)).toBeNull();
    expect(b.fresh("w:p", [], 1000)).toBeNull();
    // Nobody else's, and never from a clock that went back.
    expect(b.fresh("w:q", [1, 2, 3], 1000)).toBeNull();
    expect(b.fresh("w:p", [1, 2, 3], 999)).toBeNull();
  });

  it("keeps one result per person, and the stale one answers only for the same Metrics", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", [1, 2], "old", 0);
    b.keep("w:p", [1, 2, 3], "new", 5);
    expect(b.stale("w:p", [1, 2], 5)).toBeNull();
    expect(b.stale("w:p", [3, 2, 1], 5)).toBe("new");
    expect(b.stale("w:p", [3, 2, 1], 5 + STALE_MS - 1)).toBe("new");
    expect(b.stale("w:p", [3, 2, 1], 5 + STALE_MS)).toBeNull();
    expect(b.stale("w:p", [3, 2, 1], 4)).toBeNull();
    expect(b.stale("w:p", [1, 2, 3, 4], 0)).toBeNull();
    expect(b.stale("w:q", [1, 2, 3], 0)).toBeNull();
    b.clear();
    expect(b.stale("w:p", [1, 2, 3], 0)).toBeNull();
  });

  it("keeps at most so many results, the oldest first out", () => {
    const b = new ScanBudget<number>();
    for (let i = 0; i < KEEP_AT_MOST + 1; i++) b.keep(`w:${i}`, [1], i, 0);
    expect(b.stale("w:0", [1], 0)).toBeNull();
    expect(b.stale("w:1", [1], 0)).toBe(1);
    expect(b.stale(`w:${KEEP_AT_MOST}`, [1], 0)).toBe(KEEP_AT_MOST);
    // A person kept again goes to the back of the line.
    b.keep("w:1", [1], 99, 0);
    b.keep("w:new", [1], 7, 0);
    expect(b.stale("w:1", [1], 0)).toBe(99);
    expect(b.stale("w:2", [1], 0)).toBeNull();
  });
});

describe("keeping apart and clearing", () => {
  it("tells sets of Metrics apart whose ids run together, and clears results and counts", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", [1, 23], "a", 0);
    expect(b.fresh("w:p", [12, 3], 0)).toBeNull();
    b.keep("w:q", [1, 2, 34], "b", 0);
    expect(b.fresh("w:q", [12, 34], 0)).toBeNull();
    expect(b.stale("w:q", [12, 34], 0)).toBeNull();
    expect(b.fresh("w:p", [1, 23], 0)).toBe("a");
    for (let i = 0; i < SCANS_PER_HOUR; i++) b.scanned("w:p", 0);
    expect(b.mayScan("w:p", 1)).toBe(false);
    b.clear();
    expect(b.fresh("w:p", [1, 23], 0)).toBeNull();
    expect(b.mayScan("w:p", 1)).toBe(true);
  });
});

describe("the scans a person may start", () => {
  it("allows six in an hour, one step either side, and counts an hour from each", () => {
    const b = new ScanBudget<string>();
    const MIN = 60_000;
    for (let i = 0; i < SCANS_PER_HOUR - 1; i++) {
      expect(b.mayScan("w:p", i * MIN)).toBe(true);
      b.scanned("w:p", i * MIN);
    }
    // Five started: the sixth is allowed; with six started the seventh is not.
    expect(b.mayScan("w:p", 5 * MIN)).toBe(true);
    b.scanned("w:p", 5 * MIN);
    expect(b.mayScan("w:p", 6 * MIN)).toBe(false);
    expect(b.mayScan("w:p", 59 * MIN + 59_999)).toBe(false);
    // The first was an hour ago exactly: it no longer counts.
    expect(b.mayScan("w:p", 60 * MIN)).toBe(true);
    // Another person's budget is their own.
    expect(b.mayScan("w:q", 6 * MIN)).toBe(true);
  });

  it("forgets the counts of people who stopped asking, when there are too many, the one who asks most last", () => {
    const b = new ScanBudget<string>();
    for (let i = 0; i < SCANS_PER_HOUR; i++) { b.scanned("w:0", 1); b.scanned("w:1", 1); }
    expect(b.mayScan("w:0", 2)).toBe(false);
    for (let i = 2; i < COUNT_AT_MOST; i++) b.scanned(`w:${i}`, 1);
    expect(b.mayScan("w:0", 2)).toBe(false);
    // The heaviest asks again, and moves to the back: the next one in line is forgotten, not them.
    b.scanned("w:0", 3);
    b.scanned(`w:${COUNT_AT_MOST}`, 1);
    expect(b.mayScan("w:0", 4)).toBe(false);
    expect(b.mayScan("w:1", 4)).toBe(true);
    expect(b.mayScan("w:2", 4)).toBe(true);
    for (let i = 0; i < SCANS_PER_HOUR; i++) b.scanned(`w:${COUNT_AT_MOST}`, 1);
    expect(b.mayScan(`w:${COUNT_AT_MOST}`, 2)).toBe(false);
  });
});

describe("the limiter", () => {
  it("runs at most as many at once as it is given and all of them in the end", async () => {
    const run = limiter(2);
    let running = 0;
    let most = 0;
    const open: (() => void)[] = [];
    const jobs = Array.from({ length: 5 }, (_, i) => run(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise<void>((go) => open.push(go));
      running--;
      return i;
    }));
    await new Promise((r) => setTimeout(r, 5));
    expect(running).toBe(2);
    while (open.length) { open.shift()!(); await new Promise((r) => setTimeout(r, 1)); }
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(2);
    expect(AT_ONCE).toBe(2);
  });

  it("gives its place back when a run fails", async () => {
    const run = limiter(1);
    await expect(run(async () => { throw new Error("no"); })).rejects.toThrow("no");
    expect(await run(async () => "next")).toBe("next");
    const a = run(async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error("late"); });
    const b = run(async () => "after");
    await expect(a).rejects.toThrow("late");
    expect(await b).toBe("after");
  });
});
