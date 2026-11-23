// The budget of a person's Heads-up scans (GLOSSARY: Heads-up): what is kept, for how long, for which Metrics, and how many scans an
// hour; every edge one step either side.
import { describe, expect, it } from "vitest";
import { AT_ONCE, COUNT_AT_MOST, KEEP_AT_MOST, KEEP_MS, SCANS_PER_HOUR, COUNT_PER_WORKSPACE, KEEP_PER_WORKSPACE, PER_PERSON, STALE_MS, WAITING_AT_MOST, ScanBudget, limiter, signature } from "./heads-up-budget";

describe("the kept result", () => {
  it("answers only for exactly the same Metrics, in any order, and only while it is younger than ten minutes", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", signature([3, 1, 2]), "rows", 1000);
    expect(b.fresh("w:p", signature([1, 2, 3]), 1000)).toBe("rows");
    expect(b.fresh("w:p", signature([2, 3, 1]), 1000 + KEEP_MS - 1)).toBe("rows");
    expect(b.fresh("w:p", signature([1, 2, 3]), 1000 + KEEP_MS)).toBeNull();
    // One Metric more or fewer, or one other: nothing.
    expect(b.fresh("w:p", signature([1, 2]), 1000)).toBeNull();
    expect(b.fresh("w:p", signature([1, 2, 3, 4]), 1000)).toBeNull();
    expect(b.fresh("w:p", signature([1, 2, 4]), 1000)).toBeNull();
    expect(b.fresh("w:p", signature([]), 1000)).toBeNull();
    // Nobody else's, and never from a clock that went back.
    expect(b.fresh("w:q", signature([1, 2, 3]), 1000)).toBeNull();
    expect(b.fresh("w:p", signature([1, 2, 3]), 999)).toBeNull();
  });

  it("keeps one result per person, and the stale one answers only for the same Metrics", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", signature([1, 2]), "old", 0);
    b.keep("w:p", signature([1, 2, 3]), "new", 5);
    expect(b.stale("w:p", signature([1, 2]), 5)).toBeNull();
    expect(b.stale("w:p", signature([3, 2, 1]), 5)).toBe("new");
    expect(b.stale("w:p", signature([3, 2, 1]), 5 + STALE_MS - 1)).toBe("new");
    expect(b.stale("w:p", signature([3, 2, 1]), 5 + STALE_MS)).toBeNull();
    expect(b.stale("w:p", signature([3, 2, 1]), 4)).toBeNull();
    expect(b.stale("w:p", signature([1, 2, 3, 4]), 0)).toBeNull();
    expect(b.stale("w:q", signature([1, 2, 3]), 0)).toBeNull();
    b.clear();
    expect(b.stale("w:p", signature([1, 2, 3]), 0)).toBeNull();
  });

  it("keeps at most so many results in all, the oldest first out", () => {
    const b = new ScanBudget<number>();
    for (let i = 0; i < KEEP_AT_MOST + 1; i++) b.keep(`w${i}:p`, signature([1]), i, 0);
    expect(b.stale("w0:p", signature([1]), 0)).toBeNull();
    expect(b.stale("w1:p", signature([1]), 0)).toBe(1);
    expect(b.stale(`w${KEEP_AT_MOST}:p`, signature([1]), 0)).toBe(KEEP_AT_MOST);
    // A person kept again goes to the back of the line.
    b.keep("w1:p", signature([1]), 99, 0);
    b.keep("new:p", signature([1]), 7, 0);
    expect(b.stale("w1:p", signature([1]), 0)).toBe(99);
    expect(b.stale("w2:p", signature([1]), 0)).toBeNull();
  });
});

describe("bounds per Workspace", () => {
  it("writes a signature as the sorted ids, a bar and what else", () => {
    expect(signature([3, 1])).toBe("1,3|");
    expect(signature([3, 1], "x")).toBe("1,3|x");
  });

  it("lets one Workspace fill only its own share, leaving another's results alone", () => {
    const b = new ScanBudget<number>();
    b.keep("other:p", signature([1]), 7, 0);
    for (let i = 0; i < KEEP_PER_WORKSPACE + 5; i++) b.keep(`busy:${i}`, signature([1]), i, 0);
    expect(b.stale("other:p", signature([1]), 0)).toBe(7);
    expect(b.stale("busy:0", signature([1]), 0)).toBeNull();
    expect(b.stale("busy:4", signature([1]), 0)).toBeNull();
    expect(b.stale("busy:5", signature([1]), 0)).toBe(5);
    expect(b.stale(`busy:${KEEP_PER_WORKSPACE + 4}`, signature([1]), 0)).toBe(KEEP_PER_WORKSPACE + 4);
    // Exactly the share fits: nothing goes.
    const c = new ScanBudget<number>();
    for (let i = 0; i < KEEP_PER_WORKSPACE; i++) c.keep(`w:${i}`, signature([1]), i, 0);
    expect(c.stale("w:0", signature([1]), 0)).toBe(0);
    // A person kept again does not count twice.
    c.keep("w:0", signature([1]), 99, 0);
    expect(c.stale("w:1", signature([1]), 0)).toBe(1);
    expect(c.stale("w:0", signature([1]), 0)).toBe(99);
  });

  it("tells signatures apart by what else the words depend on", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", signature([1, 2], "names-a"), "x", 0);
    expect(b.fresh("w:p", signature([2, 1], "names-a"), 0)).toBe("x");
    expect(b.fresh("w:p", signature([1, 2], "names-b"), 0)).toBeNull();
    expect(b.fresh("w:p", signature([1, 2]), 0)).toBeNull();
  });
});

describe("fair room for results", () => {
  it("takes room from the Workspace that holds most when the whole is full, never from a small one", () => {
    const b = new ScanBudget<number>();
    b.keep("small:p", signature([1]), 1, 0);
    for (let w = 0; w < KEEP_AT_MOST / KEEP_PER_WORKSPACE; w++) for (let i = 0; i < KEEP_PER_WORKSPACE; i++) if (w * KEEP_PER_WORKSPACE + i < KEEP_AT_MOST - 1) b.keep(`big${w}:${i}`, signature([1]), 2, 0);
    b.keep("another:p", signature([1]), 3, 0);
    expect(b.stale("small:p", signature([1]), 0)).toBe(1);
    expect(b.stale("another:p", signature([1]), 0)).toBe(3);
  });
});

describe("keeping apart and clearing", () => {
  it("tells sets of Metrics apart whose ids run together, and clears results and counts", () => {
    const b = new ScanBudget<string>();
    b.keep("w:p", signature([1, 23]), "a", 0);
    expect(b.fresh("w:p", signature([12, 3]), 0)).toBeNull();
    b.keep("w:q", signature([1, 2, 34]), "b", 0);
    expect(b.fresh("w:q", signature([12, 34]), 0)).toBeNull();
    expect(b.stale("w:q", signature([12, 34]), 0)).toBeNull();
    expect(b.fresh("w:p", signature([1, 23]), 0)).toBe("a");
    for (let i = 0; i < SCANS_PER_HOUR; i++) b.scanned("w:p", 0);
    expect(b.mayScan("w:p", 1)).toBe(false);
    b.clear();
    expect(b.fresh("w:p", signature([1, 23]), 0)).toBeNull();
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

  it("forgets counts within the Workspace that asks first, then from the Workspace that holds most, never for one that cycles people", () => {
    const b = new ScanBudget<string>();
    // Another Workspace's person is at the limit.
    for (let i = 0; i < SCANS_PER_HOUR; i++) b.scanned("quiet:p", 1);
    expect(b.mayScan("quiet:p", 2)).toBe(false);
    // A busy Workspace cycles through more people than it may hold: only its own oldest go.
    for (let i = 0; i < SCANS_PER_HOUR; i++) { b.scanned("busy:0", 1); b.scanned("busy:1", 1); }
    for (let i = 2; i < COUNT_PER_WORKSPACE; i++) b.scanned(`busy:${i}`, 1);
    // (busy:0 asks again and goes to the back of the line, busy:1 does not; then ten more people come.)
    b.scanned("busy:0", 1);
    for (let i = COUNT_PER_WORKSPACE; i < COUNT_PER_WORKSPACE + 10; i++) b.scanned(`busy:${i}`, 1);
    expect(b.mayScan("quiet:p", 2)).toBe(false);
    b.scanned(`busy:${COUNT_PER_WORKSPACE + 10}`, 1);
    b.scanned(`busy:${COUNT_PER_WORKSPACE + 11}`, 1);
    // busy:0 was moved to the back by its asking, so busy:1 and the next went first, not it.
    expect(b.mayScan("busy:0", 2)).toBe(false);
    expect(b.mayScan("busy:1", 2)).toBe(true);
    // Over the total, the Workspace with most gives up its oldest; a small one keeps its counts.
    const c = new ScanBudget<string>();
    for (let i = 0; i < SCANS_PER_HOUR; i++) c.scanned("small:p", 1);
    for (let w = 0; w < COUNT_AT_MOST / COUNT_PER_WORKSPACE + 1; w++) for (let i = 0; i < COUNT_PER_WORKSPACE; i++) c.scanned(`big${w}:${i}`, 1);
    expect(c.mayScan("small:p", 2)).toBe(false);
    expect(c.mayScan("big0:0", 2)).toBe(true);
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
    }, `person${i}`));
    await new Promise((r) => setTimeout(r, 5));
    expect(running).toBe(2);
    while (open.length) { open.shift()!(); await new Promise((r) => setTimeout(r, 1)); }
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(2);
    expect(AT_ONCE).toBe(2);
  });

  it("lets only so many wait, and refuses the rest in words", async () => {
    const run = limiter(1, 2);
    const open: (() => void)[] = [];
    const slow = () => new Promise<void>((go) => open.push(go));
    const jobs = [run(slow, "a"), run(slow, "b"), run(slow, "c")];
    await new Promise((r) => setTimeout(r, 5));
    await expect(run(async () => 1, "d")).rejects.toThrow("Try again in a moment.");
    while (open.length) { open.shift()!(); await new Promise((r) => setTimeout(r, 1)); }
    await Promise.all(jobs);
    expect(await run(async () => "free")).toBe("free");
    expect(WAITING_AT_MOST).toBe(50);
  });

  it("lets one person have only so many running or waiting, in whatever Workspaces, and frees a place when one ends", async () => {
    const run = limiter(1, 50, 2);
    const open: (() => void)[] = [];
    const slow = () => new Promise<void>((go) => open.push(go));
    const mine = [run(slow, "p"), run(slow, "p")];
    await new Promise((r) => setTimeout(r, 5));
    await expect(run(async () => 1, "p")).rejects.toThrow("Try again in a moment.");
    // Someone else still gets their turn in line.
    const other = run(async () => "other", "q");
    expect(PER_PERSON).toBe(2);
    while (open.length) { open.shift()!(); await new Promise((r) => setTimeout(r, 1)); }
    await Promise.all(mine);
    expect(await other).toBe("other");
    expect(await run(async () => "again", "p")).toBe("again");
    // A refused call is not left counted: a failing run frees its place too.
    await expect(run(async () => { throw new Error("x"); }, "p")).rejects.toThrow("x");
    expect(await run(async () => 1, "p")).toBe(1);
  });

  it("keeps the count of a person who still has a run when another ends, and refuses in an Error", async () => {
    const run = limiter(5, 50, 2);
    const open: (() => void)[] = [];
    const slow = () => new Promise<void>((go) => open.push(go));
    const first = run(slow, "p");
    const second = run(slow, "p");
    await new Promise((r) => setTimeout(r, 5));
    open.shift()!();
    await first;
    // One of theirs still runs, so one more fits and the next does not.
    const third = run(slow, "p");
    await new Promise((r) => setTimeout(r, 5));
    const refused = await run(async () => 1, "p").catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toBe("Heads-ups could not be read. Try again in a moment.");
    while (open.length) { open.shift()!(); await new Promise((r) => setTimeout(r, 1)); }
    await Promise.all([second, third]);
  });

  it("refuses at once when nobody may wait and the places are taken, but not before", async () => {
    const run = limiter(1, 0, 5);
    const open: (() => void)[] = [];
    const slow = () => new Promise<void>((go) => open.push(go));
    const first = run(slow, "a");
    await new Promise((r) => setTimeout(r, 5));
    await expect(run(async () => 1, "b")).rejects.toThrow("Try again in a moment.");
    open.shift()!();
    await first;
    expect(await run(async () => 2, "b")).toBe(2);
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
