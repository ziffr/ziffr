// Heads-ups against the real database (spec 0041, ticket 13; GLOSSARY: Heads-up): the job fills the pair table once per Workspace
// and never for the demo; nothing but the core can read it; and what a person is told depends on the Metrics they may see and
// on nothing else: a person who sees A but not B is never given a Heads-up that names B or changes when B changes, the
// correction counts only their own pairs, a Metric hidden, archived or deleted after a scan is gone from the list the same day,
// and the sentences are the ones the pure rules write.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { headsUpJob, listHeadsUps, scanWorkspace } from "./heads-ups";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

/** A deterministic source of numbers in [0, 1). */
function rng(state: number) {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normals = (state: number) => { const r = rng(state); return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); };
const MONTHS = 30;
const TODAY = "2026-07-15";
const month = (k: number) => new Date(Date.UTC(2024, k, 1)).toISOString().slice(0, 10);
/** A random walk of 30 months as stored (two decimals). */
const walk = (seed: number) => { const z = normals(seed); let v = 100; return Array.from({ length: MONTHS }, () => Math.round((v += z()) * 100) / 100); };
/** Levels whose changes are the given changes. */
const levels = (changes: number[]) => { let v = 100; return changes.map((d) => Math.round((v += d) * 100) / 100); };
const changesOf = (seed: number, n = MONTHS) => { const z = normals(seed); return Array.from({ length: n }, z); };
/** y follows x by `lag` months with a little noise. */
const followed = (x: number[], lag: number, seed: number) => { const z = normals(seed); return x.map((_, t) => (t - lag >= 0 ? x[t - lag] : z()) + 0.2 * z()); };

/** A workspace of five Metrics: Visits and Revenue move together (Visits first, a month ahead), Cost moves with Visits at once, and Notes and Margin are noise;
 * three people: the Owner sees everything, Ben sees Visits and Notes (shared), Cleo sees Revenue and Notes. */
async function setup() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const [sara, ben, cleo] = [await w.person("owner"), await w.person("member"), await w.person("member")];
  const base = changesOf(11);
  const series = { visits: levels(base), revenue: levels(followed(base, 1, 12)), cost: levels(followed(base, 0, 13)), notes: walk(14), margin: walk(15) };
  const ids: Record<string, number> = {};
  for (const [name, values] of Object.entries(series)) {
    const m = await w.metric(sara, { name: name[0].toUpperCase() + name.slice(1) });
    ids[name] = m.id;
    const { error } = await db().from("observations").insert(values.map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id })));
    if (error) throw new Error(error.message);
  }
  const owner = w.actor(sara);
  const scan = async (at = new Date().toISOString()) => scanWorkspace(w.id, at, TODAY);
  const mine = (id: string) => w.actor(id, "member");
  return { w, sara, ben, cleo, ids, owner, scan, mine, series };
}
const names = (ups: { metrics: number[] }[], ids: Record<string, number>) => ups.map((u) => u.metrics.map((id) => Object.keys(ids).find((k) => ids[k] === id)));

describe("the job", () => {
  it("scans a Workspace into the pair table once, with every pair that can be compared and nothing else", async () => {
    const { w, ids, scan } = await setup();
    const result = await scan();
    expect(result).toEqual({ metrics: 5, pairs: 10, capped: false });
    const { data } = await db().from("heads_up_pairs").select("*").eq("workspace_id", w.id).order("metric_a").order("metric_b");
    expect(data).toHaveLength(10);
    for (const r of data!) {
      expect(r.metric_a).toBeLessThan(r.metric_b);
      expect(r.span).toBe("month");
      expect(r.through).toBe("2026-06-01");
      expect(r.n).toBeGreaterThanOrEqual(12);
      expect(Math.abs(r.r)).toBeLessThanOrEqual(1);
      expect(r.p).toBeGreaterThanOrEqual(r.p_delays);
    }
    const visitsRevenue = data!.find((r) => r.metric_a === Math.min(ids.visits, ids.revenue) && r.metric_b === Math.max(ids.visits, ids.revenue))!;
    expect(visitsRevenue.meets).toBe(true);
    expect(visitsRevenue.r).toBeGreaterThan(0.9);
    // Visits moves a month before Revenue: positive where Visits has the lower id (it was made first).
    expect(visitsRevenue.lag).toBe(ids.visits < ids.revenue ? 1 : -1);
    const noise = data!.find((r) => r.metric_a === ids.notes && r.metric_b === ids.margin)!;
    expect(noise.meets).toBe(false);
    // A second scan of the same data replaces the rows: no duplicates.
    await scan(new Date(Date.now() + 1000).toISOString());
    expect((await db().from("heads_up_pairs").select("metric_a", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(10);
  });

  it("claims a Workspace's scan for six hours, and never scans the demo", async () => {
    const { w, scan } = await setup();
    const claim = async () => (await db().rpc("claim_heads_up_scan", { p_ws: w.id })).data as string | null;
    const first = await claim();
    expect(first).not.toBeNull();
    expect(await claim()).toBeNull();
    await db().from("heads_up_scans").update({ scanned_at: new Date(Date.now() - 7 * 3_600_000).toISOString() }).eq("workspace_id", w.id);
    expect(await claim()).not.toBeNull();
    await scan();
    const job = await headsUpJob({ today: TODAY });
    expect(job.workspaces).toBeGreaterThanOrEqual(1);
    expect(job.skipped).toBeGreaterThanOrEqual(1);
    // The scan above was claimed a moment ago, so this call left the Workspace alone, and the demo has no row at all.
    expect((await db().from("heads_up_scans").select("scanned_at").eq("workspace_id", DEMO_WORKSPACE_ID)).data).toEqual([]);
    expect((await db().from("heads_up_pairs").select("metric_a", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe(0);
  });

  it("scans a Workspace the job reaches, then leaves it alone for six hours, and drops rows older than 90 days", async () => {
    const { w } = await setup();
    const first = await headsUpJob({ today: TODAY });
    expect(first.scanned).toBeGreaterThanOrEqual(1);
    expect(first.failed).toBe(0);
    const count = async () => (await db().from("heads_up_pairs").select("metric_a", { count: "exact", head: true }).eq("workspace_id", w.id)).count;
    expect(await count()).toBe(10);
    const stamp = (await db().from("heads_up_scans").select("scanned_at").eq("workspace_id", w.id).single()).data!.scanned_at;
    await headsUpJob({ today: TODAY });
    expect((await db().from("heads_up_scans").select("scanned_at").eq("workspace_id", w.id).single()).data!.scanned_at).toBe(stamp);
    // A row no scan has refreshed for 100 days goes, while the Workspace's scan is not due.
    const one = (await db().from("heads_up_pairs").select("metric_a, metric_b").eq("workspace_id", w.id).order("metric_a").order("metric_b").limit(1).single()).data!;
    await db().from("heads_up_pairs").update({ scanned_at: new Date(Date.now() - 100 * 86_400_000).toISOString() }).eq("workspace_id", w.id).eq("metric_a", one.metric_a).eq("metric_b", one.metric_b);
    const expired = await headsUpJob({ today: TODAY });
    expect(expired.expired).toBeGreaterThanOrEqual(1);
    expect(await count()).toBeLessThanOrEqual(9);
  });

  it("looks at no more than the 200 most recently updated Metrics of a Workspace, and says it was capped; a call out of time leaves the rest for the next", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const rows = Array.from({ length: 201 }, (_, i) => ({ slug: `cap-${i}`, name: `Cap ${i}`, owner_id: sara, workspace_id: w.id, unit: "", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: ["api"] }));
    const { data: metrics, error } = await db().from("metrics").insert(rows).select("id, slug");
    if (error) throw new Error(error.message);
    const stale = metrics!.find((m) => m.slug === "cap-0")!;
    const values = metrics!.flatMap((m) => walk(Number(m.slug.slice(4)) + 500).slice(0, 14).map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id, created_at: m.id === stale.id ? "2020-01-01T00:00:00Z" : "2026-06-01T00:00:00Z" })));
    for (let i = 0; i < values.length; i += 500) {
      const { error: e } = await db().from("observations").insert(values.slice(i, i + 500));
      if (e) throw new Error(e.message);
    }
    const claimed = (await db().rpc("claim_heads_up_scan", { p_ws: w.id })).data as string;
    const result = await scanWorkspace(w.id, claimed, "2025-03-15");
    expect(result).toMatchObject({ metrics: 200, capped: true });
    // The Metric whose values were recorded longest ago is the one left out.
    const { data: pairs } = await db().from("heads_up_pairs").select("metric_a, metric_b").eq("workspace_id", w.id);
    expect(pairs!.length).toBeGreaterThan(10_000);
    expect(pairs!.some((r) => r.metric_a === stale.id || r.metric_b === stale.id)).toBe(false);
    expect((await db().from("heads_up_scans").select("metrics, capped").eq("workspace_id", w.id)).data).toEqual([{ metrics: 200, capped: true }]);
    // A call whose time is up starts nothing and says how many Workspaces wait.
    const out = await headsUpJob({ today: "2025-03-15", budgetMs: -1 });
    expect(out.scanned).toBe(0);
    expect(out.left).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it.each(["approval", "submitted"])("rests on no value whose period is in the state %s (not final, the rule Alerts read): the period is left out until it is final", async (state) => {
    const { w, ids, scan } = await setup();
    const through = async () => (await db().from("heads_up_pairs").select("through").eq("workspace_id", w.id).eq("metric_a", Math.min(ids.visits, ids.notes)).eq("metric_b", Math.max(ids.visits, ids.notes)).single()).data!.through;
    await scan();
    expect(await through()).toBe("2026-06-01");
    await db().from("period_states").insert({ metric_id: ids.visits, period_start: month(MONTHS - 1), state, workspace_id: w.id });
    await scan(new Date(Date.now() + 5000).toISOString());
    expect(await through()).toBe("2026-05-01");
    // A Derived Metric of Visits loses that period too.
    for (const final of ["locked", "asked"]) {
      await db().from("period_states").update({ state: final }).eq("metric_id", ids.visits).eq("period_start", month(MONTHS - 1));
      await scan(new Date(Date.now() + (final === "locked" ? 9000 : 13000)).toISOString());
      expect(await through(), final).toBe("2026-06-01");
    }
  });

  it("leaves out an archived Metric, takes a pair away that can no longer be compared, and never pairs a Derived Metric with what it is worked out from", async () => {
    const { w, sara, ids, scan, owner } = await setup();
    // Derived from Visits, and another derived from Visits too, and one derived from that: none of them pairs with Visits or with each other.
    const slug = async (id: number) => (await db().from("metrics").select("slug").eq("id", id).single()).data!.slug as string;
    const d1 = await w.metric(sara, { name: "Visits doubled", formula: `{${await slug(ids.visits)}}*2`, aggregation: "none" });
    const d2 = await w.metric(sara, { name: "Visits plus one", formula: `{${await slug(ids.visits)}}+1`, aggregation: "none" });
    const d3 = await w.metric(sara, { name: "Doubled plus one", formula: `{${await slug(d1.id)}}+1`, aggregation: "none" });
    await scan();
    const pairs = async () => ((await db().from("heads_up_pairs").select("metric_a, metric_b").eq("workspace_id", w.id)).data ?? []).map((r) => [r.metric_a as number, r.metric_b as number]);
    const has = (a: number, b: number) => pairs().then((all) => all.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
    // The table holds every pair (who is related is decided per person); the Owner's list leaves the related ones out.
    expect(await has(d1.id, ids.visits)).toBe(true);
    // No Heads-up pairs two of Visits and the three Derived Metrics (they all come from Visits); a Derived Metric still pairs with others.
    const family = new Set([ids.visits, d1.id, d2.id, d3.id]);
    for (const h of await listHeadsUps(owner)) expect(h.metrics.every((id) => family.has(id)), `${h.metrics}`).toBe(false);
    expect(await has(d1.id, ids.notes)).toBe(true);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", ids.notes);
    await scan(new Date(Date.now() + 2000).toISOString());
    expect((await pairs()).some(([a, b]) => a === ids.notes || b === ids.notes)).toBe(false);
  });
});

describe("what a person is told", () => {
  it("is the Heads-up of the pair, in the leader's order, for a person who sees both Metrics", async () => {
    const { w, ben, ids, scan } = await setup();
    await scan();
        await w.share(ids.visits, ben);
    await w.share(ids.revenue, ben);
    const ups = await listHeadsUps(w.actor(ben, "member"));
    expect(ups).toHaveLength(1);
    expect(ups[0].takeaway.sentence).toBe("Visits and Revenue have started moving together: when Visits rises, Revenue follows 1 month later (strong, over 28 months).");
    expect(ups[0].takeaway.footer).toBe("This shows what has gone together, not what caused what.");
    expect(ups[0].kind).toBe("moving-together");
    // Pairs looked at: the two Metrics Ben sees have one pair between them.
    expect(ups[0].takeaway.numbers.find((n) => n.label === "Pairs of Metrics looked at")!.text).toBe("1");
  });

  it("names no Metric the person may not see, and none that is not in their own pairs: A without B gets nothing about B", async () => {
    const { w, owner, ben, ids, scan } = await setup();
    await scan();
    // Ben sees Visits and Notes only. Revenue and Cost (which move with Visits) are hidden from him.
    await w.share(ids.visits, ben);
    await w.share(ids.notes, ben);
    const mine = await listHeadsUps(w.actor(ben, "member"));
    expect(mine).toEqual([]);
    const owners = await listHeadsUps(owner);
    expect(names(owners, ids).map((p) => [...p].sort().join("+")).sort()).toEqual(["cost+revenue", "cost+visits", "revenue+visits"]);
    expect(JSON.stringify(mine)).not.toMatch(/Revenue|Cost|Margin/);
  });

  it("does not depend on a Metric the person may not see: rewrite the hidden Metrics' values, scan again, and their Heads-ups are the same to the byte", async () => {
    const { w, ben, ids, scan, series } = await setup();
    // Ben sees Visits, Revenue and Notes; Cost and Margin are hidden. Visits and Revenue move together.
    for (const k of ["visits", "revenue", "notes"] as const) await w.share(ids[k], ben);
    await scan();
    const before = await listHeadsUps(w.actor(ben, "member"));
    expect(before.map((h) => h.key)).toHaveLength(1);
    // Cost becomes noise and Margin follows Visits closely: very different hidden Metrics, and a pair of them that matters to the Owner.
    const rewrite = async (id: number, values: number[]) => { for (let k = 0; k < values.length; k++) await db().from("observations").update({ value: values[k] }).eq("metric_id", id).eq("period_start", month(k)); };
    await rewrite(ids.cost, walk(99));
    await rewrite(ids.margin, series.visits.map((v) => v * 1.5));
    await scan(new Date(Date.now() + 3000).toISOString());
    const after = await listHeadsUps(w.actor(ben, "member"));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    // The Owner's list did change, so the rewrite was visible to someone.
    const owner = await listHeadsUps(w.actor((await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("role", "owner").single()).data!.user_id as string));
    expect(names(owner, ids).some((p) => p.includes("margin"))).toBe(true);
  });

  it("counts only the person's own pairs in the correction, and gives the Owner their own count", async () => {
    const { w, owner, ben, ids, scan } = await setup();
    await scan();
    for (const k of ["visits", "revenue"] as const) await w.share(ids[k], ben);
    const [bens, owners] = [await listHeadsUps(w.actor(ben, "member")), await listHeadsUps(owner)];
    const looked = (ups: typeof bens) => ups[0].takeaway.numbers.find((n) => n.label === "Pairs of Metrics looked at")!.text;
    expect(looked(bens)).toBe("1");
    expect(looked(owners)).toBe("10");
  });

  it("is gone the same day when a Metric is hidden, archived or deleted, without a new scan", async () => {
    const { w, ben, ids, scan } = await setup();
    await scan();
    await w.share(ids.visits, ben);
    await w.share(ids.revenue, ben);
    const ask = async () => (await listHeadsUps(w.actor(ben, "member"))).length;
    expect(await ask()).toBe(1);
    await w.unshare(ids.revenue, ben);
    expect(await ask()).toBe(0);
    await w.share(ids.revenue, ben);
    expect(await ask()).toBe(1);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", ids.revenue);
    expect(await ask()).toBe(0);
    await db().from("metrics").update({ archived_at: null }).eq("id", ids.revenue);
    expect(await ask()).toBe(1);
    // Deleted: the rows go with the Metric.
    await db().from("metrics").delete().eq("id", ids.revenue);
    expect(await ask()).toBe(0);
    expect((await db().from("heads_up_pairs").select("metric_a", { count: "exact", head: true }).or(`metric_a.eq.${ids.revenue},metric_b.eq.${ids.revenue}`)).count).toBe(0);
  });

  it("is what a Token gives sight of: a Submitter who may submit to a Metric sees the Heads-ups of the pairs that include it", async () => {
    const { w, ben, cleo, ids, scan } = await setup();
    await scan();
    await w.share(ids.visits, ben);
    expect(await listHeadsUps(w.actor(ben, "member"))).toEqual([]);
    await w.token(ids.revenue, ben);
    expect((await listHeadsUps(w.actor(ben, "member"))).map((h) => h.key)).toHaveLength(1);
    expect(await listHeadsUps(w.actor(cleo, "member"))).toEqual([]);
  });

  it("is nothing for a person who sees fewer than two Metrics, and nothing from another Workspace", async () => {
    const { w, ben, ids, scan } = await setup();
    await scan();
    await w.share(ids.visits, ben);
    expect(await listHeadsUps(w.actor(ben, "member"))).toEqual([]);
    const other = await workspace();
    cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    expect(await listHeadsUps(other.actor(zoe))).toEqual([]);
  });

  it("is quiet where nothing stands out: two Metrics of noise give an empty list", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    for (const seed of [201, 202]) {
      const m = await w.metric(sara, { name: `Noise ${seed}` });
      await db().from("observations").insert(walk(seed).map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id })));
    }
    await scanWorkspace(w.id, new Date().toISOString(), TODAY);
    expect(await listHeadsUps(w.actor(sara))).toEqual([]);
  });
});

describe("what is scanned does not depend on Metrics a person may not see", () => {
  /** A workspace with Visits, Revenue and Notes (seen by Ben), and `extra` more Metrics he may not see, made after and so more recently updated. */
  async function withHidden(extra: number) {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const [sara, ben] = [await w.person("owner"), await w.person("member")];
    const base = changesOf(11);
    const mine = { visits: levels(base), revenue: levels(followed(base, 1, 12)), notes: walk(14) };
    const ids: Record<string, number> = {};
    for (const [name, values] of Object.entries(mine)) {
      const m = await w.metric(sara, { name: name[0].toUpperCase() + name.slice(1) });
      ids[name] = m.id;
      await db().from("observations").insert(values.map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id, created_at: "2026-01-01T00:00:00Z" })));
      await w.share(m.id, ben);
    }
    if (extra > 0) {
      const rows = Array.from({ length: extra }, (_, i) => ({ slug: `hid-${i}`, name: `Hidden ${i}`, owner_id: sara, workspace_id: w.id, unit: "", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: ["api"] }));
      const { data } = await db().from("metrics").insert(rows).select("id, slug");
      const values = data!.flatMap((m) => walk(Number(m.slug.slice(4)) + 700).map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id, created_at: "2026-06-01T00:00:00Z" })));
      for (let i = 0; i < values.length; i += 500) await db().from("observations").insert(values.slice(i, i + 500));
    }
    const claimed = (await db().rpc("claim_heads_up_scan", { p_ws: w.id })).data as string;
    await scanWorkspace(w.id, claimed, TODAY);
    return { w, ben, ids };
  }
  /** What Ben is told, without anything that is an id of this Workspace. */
  const told = async (w: Awaited<ReturnType<typeof withHidden>>) => (await listHeadsUps(w.w.actor(w.ben, "member"))).map((h) => ({ kind: h.kind, span: h.span, through: h.through, rank: h.rank, takeaway: h.takeaway }));

  it("gives the same Heads-ups, in the same order, counts and words, with 250 hidden Metrics that push his out of the Workspace's scan", async () => {
    const [alone, crowded] = [await withHidden(0), await withHidden(250)];
    expect((await db().from("heads_up_scans").select("capped").eq("workspace_id", crowded.w.id).single()).data!.capped).toBe(true);
    const [a, b] = [await told(alone), await told(crowded)];
    expect(a).toHaveLength(1);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 180_000);

  it("never lets a reader see rows and flag that disagree: a scan interrupted after the flag, and after the rows, gives what a scan of the person's own Metrics gives, in both directions of the cap", async () => {
    const crowded = await withHidden(250);
    const alone = await told(await withHidden(0));
    const hiddenIds = (await db().from("metrics").select("id").eq("workspace_id", crowded.w.id).like("slug", "hid-%")).data!.map((m) => m.id as number);
    const seenAt: string[] = [];
    const reader = (label: string) => async () => { seenAt.push(label); expect(JSON.stringify(await told(crowded)), label).toBe(JSON.stringify(alone)); };
    const rescan = async (at: number, label: string) => scanWorkspace(crowded.w.id, new Date(Date.now() + at).toISOString(), TODAY, { afterFlag: reader(`${label}: after the flag`), afterRows: reader(`${label}: after the rows`) });
    const flag = async () => (await db().from("heads_up_scans").select("capped").eq("workspace_id", crowded.w.id).single()).data!.capped;
    expect(await flag()).toBe(true);
    // Capped to not capped: the flag stays true until the rows are done.
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).in("id", hiddenIds);
    await rescan(10_000, "true to false");
    expect(await flag()).toBe(false);
    expect(JSON.stringify(await told(crowded))).toBe(JSON.stringify(alone));
    // Not capped to capped: the flag is true before any row changes.
    await db().from("metrics").update({ archived_at: null }).in("id", hiddenIds);
    await rescan(20_000, "false to true");
    expect(await flag()).toBe(true);
    expect(seenAt).toHaveLength(4);
  }, 300_000);

  it("leaves a pair out as related only through Metrics the person sees: two Derived Metrics of one hidden Metric are shown, of one they see are not", async () => {
    const w = await workspace();
    cleanups.push(w.cleanup);
    const [sara, ben] = [await w.person("owner"), await w.person("member")];
    const hidden = await w.metric(sara, { name: "Hidden source" });
    const slug = (await db().from("metrics").select("slug").eq("id", hidden.id).single()).data!.slug as string;
    await db().from("observations").insert(walk(31).map((value, k) => ({ metric_id: hidden.id, period_start: month(k), value, source: "api", workspace_id: w.id })));
    const d1 = await w.metric(sara, { name: "Source doubled", formula: `{${slug}}*2`, aggregation: "none" });
    const d2 = await w.metric(sara, { name: "Source plus one", formula: `{${slug}}+1`, aggregation: "none" });
    await w.share(d1.id, ben);
    await w.share(d2.id, ben);
    await scanWorkspace(w.id, new Date().toISOString(), TODAY);
    const benActor = w.actor(ben, "member");
    expect((await listHeadsUps(benActor)).map((h) => h.takeaway.sentence)).toEqual([expect.stringContaining("Source doubled and Source plus one have started moving together")]);
    await w.share(hidden.id, ben);
    expect(await listHeadsUps(benActor)).toEqual([]);
  });
});

describe("the pair table is the core's alone", () => {
  it("is not readable by the public roles, nor its function", async () => {
    const { w, scan } = await setup();
    await scan();
    const { createClient } = await import("@supabase/supabase-js");
    const { execFileSync } = await import("node:child_process");
    let anon = process.env.SUPABASE_ANON_KEY;
    if (!anon) {
      try { anon = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).ANON_KEY; } catch { anon = undefined; }
    }
    if (!anon) return;
    const pub = createClient(process.env.SUPABASE_URL!, anon, { auth: { persistSession: false } });
    for (const table of ["heads_up_pairs", "heads_up_scans"]) {
      const { data } = await pub.from(table).select("*");
      expect(data ?? [], table).toEqual([]);
    }
    expect((await pub.rpc("visible_heads_up_pairs", { p_ws: w.id, p_ids: [1, 2, 3] })).error).not.toBeNull();
    expect((await pub.rpc("claim_heads_up_scan", { p_ws: w.id })).error).not.toBeNull();
    // And not written by them either.
    expect((await pub.from("heads_up_pairs").insert({ workspace_id: w.id })).error).not.toBeNull();
  });

  it("refuses a row that no scan would write, and a pair of Metrics that are not the Workspace's", async () => {
    const { w, ids, scan } = await setup();
    await scan();
    const other = await workspace();
    cleanups.push(other.cleanup);
    const zoe = await other.person("owner");
    const foreign = await other.metric(zoe);
    const { data: sample } = await db().from("heads_up_pairs").select("*").eq("workspace_id", w.id).limit(1).single();
    const row = { ...(sample as Record<string, unknown>) };
    const tries = async (over: Record<string, unknown>) => (await db().from("heads_up_pairs").upsert({ ...row, ...over }, { onConflict: "workspace_id,metric_a,metric_b" })).error;
    expect(await tries({})).toBeNull();
    expect(await tries({ r: 1.5 })).not.toBeNull();
    expect(await tries({ r: null })).not.toBeNull();
    expect(await tries({ p: 2 })).not.toBeNull();
    expect(await tries({ p_delays: 0.9, p: 0.1 })).not.toBeNull();
    expect(await tries({ lag: 4 })).not.toBeNull();
    expect(await tries({ n: 11, n_first: 5, n_second: 6 })).not.toBeNull();
    expect(await tries({ n_first: 1, n_second: 1 })).not.toBeNull();
    expect(await tries({ tries: 0 })).not.toBeNull();
    expect(await tries({ span: "decade" })).not.toBeNull();
    // The earlier history is all there or all absent; the last periods are all there or all absent, and need the earlier history.
    expect(await tries({ before_r: null })).not.toBeNull();
    expect(await tries({ recent_r: 0.1, recent_n: 6, recent_low: null, recent_drop_p: 0.5 })).not.toBeNull();
    expect(await tries({ before_lag: null, before_r: null, before_n: null, before_n_eff: null, before_p_delays: null, before_p: null, before_tries: null, before_meets: null, before_n_first: null, before_n_second: null, recent_r: 0.1, recent_n: 6, recent_low: true, recent_drop_p: 0.5 })).not.toBeNull();
    expect(await tries({ recent_r: 0.1, recent_n: 5, recent_low: true, recent_drop_p: 0.5 })).not.toBeNull();
    // A pair of Metrics of another Workspace, or one of each, is refused by the database as well.
    expect(await tries({ metric_a: foreign.id, metric_b: Number(row.metric_b) })).not.toBeNull();
    expect(await tries({ workspace_id: other.id })).not.toBeNull();
    expect(await tries({ metric_a: Number(row.metric_b), metric_b: Number(row.metric_a) })).not.toBeNull();
    void ids;
  });
});
