// Heads-ups in the app and by message against the real database (spec 0041, ticket 14; GLOSSARY: Heads-up, Delivery): a person's
// settings, Not useful and mutes are their own; a message is made only for a person who switched it on and only about Metrics they
// may see (BOTH of a pair), at most 3 in 7 days, each once until it has ended and returned; the words are the Takeaway's, with the
// footer and none of the words a Takeaway may not use; and what a person is told never depends on a Metric they may not see.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { optOutByToken, unsubscribeIsHeadsUp } from "./email-opt-out";
import { connectorsView } from "./page-data";
import { db } from "./db";
import { archivedMetricHolds } from "./internal/delivery-send";
import { deliverHeadsUps, deliverHeadsUpsTo } from "./heads-up-delivery";
import { WEEKLY_CAP } from "./heads-up-message";
import { headsUpSettings, markNotUseful, muteMetric, mutedMetrics, myHeadsUps, setHeadsUpSettings, unmuteMetric } from "./heads-up-state";
import { listHeadsUps, resetHeadsUpBudget, scanWorkspace } from "./heads-ups";
import { holdFor } from "./quiet-hours";
import { workspace, opened, rowsOf } from "./test/db-fixtures";

// A way to make the one send fail, to see that what was counted for it is given back.
const failing = { on: false };
vi.mock("./deliveries", async (original) => {
  const real = await original<typeof import("./deliveries")>();
  return { ...real, deliverHeadsUp: (...args: Parameters<typeof real.deliverHeadsUp>) => (failing.on ? Promise.reject(new Error("boom")) : real.deliverHeadsUp(...args)) };
});

const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { failing.on = false; resetHeadsUpBudget(); });
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

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
const levels = (changes: number[]) => { let v = 100; return changes.map((d) => Math.round((v += d) * 100) / 100); };
const changesOf = (seed: number) => { const z = normals(seed); return Array.from({ length: MONTHS }, z); };
const followed = (x: number[], seed: number) => { const z = normals(seed); return x.map((v) => v + 0.2 * z()); };

/** Four pairs of Metrics (p0a with p0b, p1a with p1b, ...): each pair moves together, the pairs do not move with each other. */
const ALL = ["p0a", "p0b", "p1a", "p1b", "p2a", "p2b", "p3a", "p3b"];
const seriesOf = (name: string, tweak = 0) => {
  const i = Number(name[1]);
  const base = changesOf(20 + i + tweak);
  return name.endsWith("a") ? levels(base) : levels(followed(base, 40 + i + tweak));
};

/** A Workspace with the named Metrics (all by default), scanned; an Owner who sees all, and members to share with. */
async function setup(include: string[] = ALL, tweak = 0) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const [sara, ben, cleo] = [await w.person("owner"), await w.person("member"), await w.person("member")];
  const ids: Record<string, number> = {};
  for (const name of include) {
    const m = await w.metric(sara, { name: `Metric ${name}` });
    ids[name] = m.id;
    const { error } = await db().from("observations").insert(seriesOf(name, tweak).map((value, k) => ({ metric_id: m.id, period_start: month(k), value, source: "api", workspace_id: w.id })));
    if (error) throw new Error(error.message);
  }
  const scan = () => scanWorkspace(w.id, new Date().toISOString(), TODAY);
  await scan();
  const actor = (id: string) => w.actor(id, id === sara ? "owner" : "member");
  const shareAll = async (who: string, names: string[]) => { for (const n of names) await w.share(ids[n], who); };
  const on = (id: string, over: { show?: boolean; byMessage?: boolean } = {}) => setHeadsUpSettings(actor(id), { byMessage: true, ...over });
  const messages = async (id: string) => {
    const rows = await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject, body, kind, heads_up_metric_a, heads_up_metric_b, mail_state, not_before").eq("recipient_id", id).eq("kind", "heads_up").order("id")).data);
    return rows as { id: number; subject: string; body: string; kind: string; heads_up_metric_a: number; heads_up_metric_b: number | null; mail_state: string; not_before: string | null }[];
  };
  return { w, sara, ben, cleo, ids, scan, actor, shareAll, on, messages };
}

const FORBIDDEN = /\b(cause[sd]?|because|significan\w*|p-value|regression|R²|coefficient|confidence)\b/i;
const FOOTER = "This shows what has gone together, not what caused what.";
const withoutFooter = (text: string) => text.replace(FOOTER, "");

describe("a person's settings, Not useful and mutes", () => {
  it("are shown by default and told never; they are the person's own and change nothing for anyone else", async () => {
    const { ben, cleo, actor } = await setup();
    expect(await headsUpSettings(actor(ben))).toEqual({ show: true, byMessage: false });
    expect(await setHeadsUpSettings(actor(ben), { byMessage: true })).toEqual({ show: true, byMessage: true });
    // A field left out is kept; the other person is untouched.
    expect(await setHeadsUpSettings(actor(ben), { show: false })).toEqual({ show: false, byMessage: true });
    expect(await headsUpSettings(actor(cleo))).toEqual({ show: true, byMessage: false });
    for (const bad of [{ show: "yes" }, { byMessage: 1 }, { show: null }]) await expect(setHeadsUpSettings(actor(ben), bad as never)).rejects.toThrow("Pick on or off.");
  });

  it("shows the list with Not useful and mutes taken off, and turns it off for a person who switched Heads-ups off", async () => {
    const { sara, ids, actor } = await setup();
    const all = (await myHeadsUps(actor(sara))).items;
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.every((h) => h.named.length === 2 && h.takeaway.sentence)).toBe(true);
    await markNotUseful(actor(sara), all[0].key);
    await muteMetric(actor(sara), ids.p1a);
    const left = (await myHeadsUps(actor(sara))).items.map((h) => h.key);
    expect(left).not.toContain(all[0].key);
    for (const h of all) if (h.metrics.includes(ids.p1a)) expect(left).not.toContain(h.key);
    expect(left.length).toBeGreaterThan(0);
    await unmuteMetric(actor(sara), ids.p1a);
    expect((await myHeadsUps(actor(sara))).items.map((h) => h.key)).toContain(all.find((h) => h.metrics.includes(ids.p1a) && h.key !== all[0].key)!.key);
    await setHeadsUpSettings(actor(sara), { show: false });
    expect(await myHeadsUps(actor(sara))).toEqual({ on: false, items: [] });
  });

  it("keeps one person's Not useful and mutes from another's", async () => {
    const { sara, ben, ids, actor, shareAll } = await setup();
    await shareAll(ben, ["p0a", "p0b"]);
    const [mine, his] = [(await myHeadsUps(actor(sara))).items, (await myHeadsUps(actor(ben))).items];
    expect(his.map((h) => h.key)).toEqual([mine.find((h) => h.metrics.includes(ids.p0a))!.key]);
    await markNotUseful(actor(sara), his[0].key);
    await muteMetric(actor(sara), ids.p0b);
    expect((await myHeadsUps(actor(ben))).items.map((h) => h.key)).toEqual(his.map((h) => h.key));
    expect(await mutedMetrics(actor(ben))).toEqual([]);
    expect(await mutedMetrics(actor(sara))).toEqual([{ id: ids.p0b, name: "Metric p0b" }]);
  });

  it("refuses a key or a Metric the person does not see in the same words as one that is not there, and a key that is not a key", async () => {
    const { ben, ids, actor, shareAll, w } = await setup();
    await shareAll(ben, ["p0a", "p0b"]);
    const [nobody, hidden] = [`moving-together:${ids.p0a}:99999999`, `moving-together:${ids.p0a}:${ids.p1a}`];
    const gone = await markNotUseful(actor(ben), nobody).catch((e: Error) => e.message);
    expect(gone).toBe("That Heads-up is not there any more.");
    expect(await markNotUseful(actor(ben), hidden).catch((e: Error) => e.message)).toBe(gone);
    for (const bad of ["", "x", `moving-together:${ids.p0a}:${ids.p0b}:3`, "Moving:1:2", "moving-together:0", "a:1;drop", 12, null, undefined, { key: "a:1" }]) {
      await expect(markNotUseful(actor(ben), bad)).rejects.toThrow("That Heads-up is not there any more.");
    }
    const noMetric = await muteMetric(actor(ben), 99999999).catch((e: Error) => e.message);
    expect(await muteMetric(actor(ben), ids.p1a).catch((e: Error) => e.message)).toBe(noMetric);
    for (const bad of [0, -1, 1.5, "3", NaN, null, Infinity]) await expect(muteMetric(actor(ben), bad)).rejects.toThrow("That Metric is not there.");
    // A Metric of another Workspace is as absent as a hidden one.
    const other = await setup(["p0a", "p0b"]);
    expect(await muteMetric(actor(ben), other.ids.p0a).catch((e: Error) => e.message)).toBe(noMetric);
    expect((await rowsOf("heads_up_dismissed", { workspace_id: w.id }))).toEqual([]);
    expect((await rowsOf("heads_up_mutes", { workspace_id: w.id }))).toEqual([]);
  });

  it("holds at most so many of each, one step either side", async () => {
    const { sara, ids, actor, w } = await setup(["p0a", "p0b"]);
    const row = (k: number) => ({ workspace_id: w.id, person_id: sara, key: `filler-kind:${k}` });
    await db().from("heads_up_dismissed").insert(Array.from({ length: 1999 }, (_, i) => row(i + 1000)));
    await markNotUseful(actor(sara), `moving-together:${ids.p0a}:${ids.p0b}`);
    await markNotUseful(actor(sara), `moving-together:${ids.p0a}:${ids.p0b}`);
    await expect(markNotUseful(actor(sara), `moving-together:${ids.p0b}`)).rejects.toThrow("as many Heads-ups");
    // (The ids in the filler keys are not Metrics: they were written straight in, as a test of the count only.)
  });
});

describe("telling people by message", () => {
  it("tells only a person who switched it on, with the Takeaway's own sentence, the basis and the footer, and no word a Takeaway may not use", async () => {
    const { sara, ben, ids, actor, shareAll, on, messages } = await setup();
    await shareAll(ben, ["p0a", "p0b", "p1a"]);
    // Nobody asked: nothing is made.
    expect(await deliverHeadsUpsTo(actor(sara).workspaceId, sara)).toBe(0);
    await on(ben);
    expect(await deliverHeadsUpsTo(actor(ben).workspaceId, ben)).toBe(1);
    const [m] = await messages(ben);
    const [mine] = (await myHeadsUps(actor(ben))).items;
    expect(m.kind).toBe("heads_up");
    expect([m.heads_up_metric_a, m.heads_up_metric_b].sort()).toEqual([ids.p0a, ids.p0b].sort());
    // The number in the sentence is the one the list shows: one Takeaway, worded once.
    expect(m.body).toContain(mine.takeaway.sentence!);
    expect(m.body).toContain(FOOTER);
    expect(m.body).toContain(`${mine.takeaway.basis![0].toUpperCase()}${mine.takeaway.basis!.slice(1)}.`);
    expect(m.subject).toBe("Heads-up: Metric p0a and Metric p0b");
    expect(FORBIDDEN.test(withoutFooter(m.body))).toBe(false);
    expect(FORBIDDEN.test(m.subject)).toBe(false);
    expect(m.body).not.toMatch(/Metric p1b|Metric p2|Metric p3/);
    expect(await messages(sara)).toEqual([]);
  });

  it("makes nothing for a person who switched Heads-ups off, who left, who is a Contact, or for the demo", async () => {
    const { w, sara, ben, shareAll, on, messages } = await setup();
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben, { show: false });
    expect(await deliverHeadsUpsTo(w.id, ben)).toBe(0);
    await on(ben, { show: true });
    const contact = await w.contact({ email: "c@example.com" });
    // A Contact is no member: the database refuses their row, and a run for them makes nothing.
    expect((await db().from("heads_up_settings").insert({ workspace_id: w.id, person_id: contact, show: true, by_message: true })).error).not.toBeNull();
    expect(await deliverHeadsUpsTo(w.id, contact)).toBe(0);
    await w.dropMember(ben);
    expect(await deliverHeadsUpsTo(w.id, ben)).toBe(0);
    expect(await deliverHeadsUpsTo("00000000-0000-0000-0000-00000000de40", sara)).toBe(0);
    expect(await messages(ben)).toEqual([]);
    expect(await messages(contact)).toEqual([]);
  });

  it("tells a person nothing about a pair of which they see only one Metric, and the same words whatever else is in the Workspace", async () => {
    // Ben sees p0a, p0b and p1a; Cleo sees p0a and p1b (so no pair).
    const full = await setup(ALL);
    await full.shareAll(full.ben, ["p0a", "p0b", "p1a"]);
    await full.shareAll(full.cleo, ["p0a", "p1b"]);
    await full.on(full.ben);
    await full.on(full.cleo);
    expect(await deliverHeadsUpsTo(full.w.id, full.cleo)).toBe(0);
    expect(await deliverHeadsUpsTo(full.w.id, full.ben)).toBe(1);
    const first = await full.messages(full.ben);
    expect(first).toHaveLength(1);
    expect(first[0].body + first[0].subject).not.toMatch(/p1b|p2|p3/);

    // The same Workspace with the hidden Metrics' values rewritten and scanned again: Ben's messages are the same to the byte.
    for (const name of ["p1b", "p2a", "p2b", "p3a", "p3b"]) {
      await db().from("observations").delete().eq("metric_id", full.ids[name]);
      const { error } = await db().from("observations").insert(seriesOf(name, 500).map((value, k) => ({ metric_id: full.ids[name], period_start: month(k), value, source: "api", workspace_id: full.w.id })));
      if (error) throw new Error(error.message);
    }
    await full.scan();
    await db().from("deliveries").delete().eq("recipient_id", full.ben);
    await db().from("heads_up_told").delete().eq("person_id", full.ben);
    expect(await deliverHeadsUpsTo(full.w.id, full.ben)).toBe(1);
    const second = await full.messages(full.ben);
    expect([second[0].subject, second[0].body]).toEqual([first[0].subject, first[0].body]);

    // And a Workspace that has none of the hidden Metrics at all.
    const small = await setup(["p0a", "p0b", "p1a"]);
    await small.shareAll(small.ben, ["p0a", "p0b", "p1a"]);
    await small.on(small.ben);
    expect(await deliverHeadsUpsTo(small.w.id, small.ben)).toBe(1);
    const alone = await small.messages(small.ben);
    expect([alone[0].subject, alone[0].body]).toEqual([first[0].subject, first[0].body]);
  });

  it("makes one message for each person who asked, each about their own Heads-ups, and says each once", async () => {
    const { w, sara, ben, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(sara);
    await on(ben);
    const result = await deliverHeadsUps(w.id);
    expect(result).toEqual({ people: 2, sent: 2, failed: 0 });
    expect(await messages(sara)).toHaveLength(1);
    expect(await messages(ben)).toHaveLength(1);
    // Each person is a row of its own; a second run says each Heads-up once.
    expect(await deliverHeadsUps(w.id)).toEqual({ people: 2, sent: 0, failed: 0 });
  });

  it("tells at most 3 in 7 days, one step either side of the week, each once, and the rest are left for later", async () => {
    const { w, sara, on, messages } = await setup();
    await on(sara);
    const t0 = new Date("2026-08-01T10:00:00Z");
    const after = (ms: number) => new Date(t0.getTime() + ms);
    const WEEK = 7 * 86_400_000;
    expect(WEEKLY_CAP).toBe(3);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t0 })).toBe(3);
    // Everything is told or counted: nothing more now, a second later, or a step before the week is over.
    expect(await deliverHeadsUpsTo(w.id, sara, { now: after(1000) })).toBe(0);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: after(WEEK - 1) })).toBe(0);
    expect(await messages(sara)).toHaveLength(3);
    // At the week, the first three no longer count, and the fourth is told (the three told are not told again).
    expect(await deliverHeadsUpsTo(w.id, sara, { now: after(WEEK) })).toBe(1);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: after(WEEK + 1000) })).toBe(0);
    const told = await messages(sara);
    expect(told).toHaveLength(4);
    expect(new Set(told.map((m) => `${m.heads_up_metric_a}:${m.heads_up_metric_b}`)).size).toBe(4);
  });

  it("counts the cap in the database at its edge: two told lets a third go, three told stops a fourth, and a message that does not go is not counted", async () => {
    const { w, sara } = await setup(["p0a", "p0b"]);
    const now = new Date("2026-08-01T10:00:00Z");
    const claim = async (key: string, at = now) => (await db().rpc("claim_heads_up_message", { p_ws: w.id, p_person: sara, p_key: key, p_cap: 3, p_now: at.toISOString() })).data;
    expect(await claim("moving-together:1:2")).toMatch(/^send:\d+$/);
    expect(await claim("moving-together:1:2")).toBe("told");
    expect(await claim("moving-together:1:3")).toMatch(/^send:\d+$/);
    expect(await claim("moving-together:1:4")).toMatch(/^send:\d+$/);
    expect(await claim("moving-together:1:5")).toBe("cap");
    // Only what was told counts: the refused ones left no row.
    expect((await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara }))).toHaveLength(3);
    // The oldest was told exactly a week ago: it no longer counts; one second less and it does.
    expect(await claim("moving-together:1:5", new Date(now.getTime() + 7 * 86_400_000 - 1000))).toBe("cap");
    expect(await claim("moving-together:1:5", new Date(now.getTime() + 7 * 86_400_000))).toMatch(/^send:\d+$/);
  });

  it("says one again only when it has ended and returned, and ends one that is muted or no longer stands", async () => {
    const { w, sara, ids, actor, on, messages } = await setup(["p0a", "p0b"]);
    await on(sara);
    const t = (days: number) => new Date(Date.parse("2026-08-01T10:00:00Z") + days * 86_400_000);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(0) })).toBe(1);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(1) })).toBe(0);
    // Muted: it no longer stands for her, so it ends; unmuted, it is back and is said again (the week's count has room).
    await muteMetric(actor(sara), ids.p0a);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(2) })).toBe(0);
    expect((await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara }))[0].ended_at).not.toBeNull();
    await unmuteMetric(actor(sara), ids.p0a);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(3) })).toBe(1);
    expect(await messages(sara)).toHaveLength(2);
    // Marked Not useful: never again, and it counts as ended.
    const [key] = (await myHeadsUps(actor(sara))).items.map((h) => h.key);
    await markNotUseful(actor(sara), key);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(20) })).toBe(0);
    expect(await messages(sara)).toHaveLength(2);
  });

  it("goes the way the person's Delivery Preference says, and waits out their quiet hours like an Alert", async () => {
    const { w, sara, on, messages } = await setup(["p0a", "p0b"]);
    await on(sara);
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: sara, kind: "update", connector: "slack", position: 0 });
    expect(await deliverHeadsUpsTo(w.id, sara)).toBe(1);
    const [m] = await messages(sara);
    expect((await db().from("deliveries").select("connector").eq("id", m.id).single()).data!.connector).toBe("slack");
    // Quiet hours: a quiet rule that covers the moment holds a Heads-up as it holds an Alert, and a notice is never held.
    await db().from("quiet_hours").insert({ workspace_id: w.id, person_id: sara, from_hour: 0, to_hour: 23, days: [], time_zone: "UTC" });
    const noon = new Date("2026-08-01T12:00:00Z");
    expect(await holdFor(w.id, sara, "heads_up", noon)).not.toBeNull();
    expect(await holdFor(w.id, sara, "notice", noon)).toBeNull();
  });
});

describe("a message that waits is checked again when it leaves", () => {
  it("is not sent once the person lost sight of either Metric, or one is archived, and it leaves the Outbox too", async () => {
    const { w, ben, ids, actor, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben);
    expect(await deliverHeadsUpsTo(w.id, ben)).toBe(1);
    const [m] = await messages(ben);
    const about = { id: m.id, workspace_id: w.id, kind: "heads_up", recipient_id: ben, heads_up_metric_a: m.heads_up_metric_a, heads_up_metric_b: m.heads_up_metric_b, heads_up_key: (await db().from("deliveries").select("heads_up_key").eq("id", m.id).single()).data!.heads_up_key as string, heads_up_told_id: (await db().from("deliveries").select("heads_up_told_id").eq("id", m.id).single()).data!.heads_up_told_id as number };
    expect(await archivedMetricHolds(about)).toBeNull();
    expect((await connectorsView(actor(ben))).deliveries.some((d) => d.id === m.id)).toBe(true);
    // Lose sight of the second Metric only: it does not go, and it is not in the Outbox.
    await w.unshare(ids.p0b, ben);
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    expect((await connectorsView(actor(ben))).deliveries.some((d) => d.id === m.id)).toBe(false);
    await w.share(ids.p0b, ben);
    await w.unshare(ids.p0a, ben);
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    await w.share(ids.p0a, ben);
    expect(await archivedMetricHolds(about)).toBeNull();
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", ids.p0b);
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    // A Heads-up that names no Metric, or no recipient, never goes.
    expect(await archivedMetricHolds({ ...about, heads_up_metric_a: null, heads_up_metric_b: null })).toBe("Not sent.");
    expect(await archivedMetricHolds({ ...about, recipient_id: undefined })).toBe("Not sent.");
  });

  it("is not sent once the person muted a Metric, marked it Not useful or switched messages off while it waited", async () => {
    const { w, ben, ids, actor, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben);
    await deliverHeadsUpsTo(w.id, ben);
    const [m] = await messages(ben);
    const key = (await db().from("deliveries").select("heads_up_key").eq("id", m.id).single()).data!.heads_up_key as string;
    expect(key).toBe(`moving-together:${Math.min(ids.p0a, ids.p0b)}:${Math.max(ids.p0a, ids.p0b)}`);
    const about = { id: m.id, workspace_id: w.id, kind: "heads_up", recipient_id: ben, heads_up_metric_a: m.heads_up_metric_a, heads_up_metric_b: m.heads_up_metric_b, heads_up_key: key, heads_up_told_id: (await db().from("deliveries").select("heads_up_told_id").eq("id", m.id).single()).data!.heads_up_told_id as number };
    expect(await archivedMetricHolds(about)).toBeNull();
    await muteMetric(actor(ben), ids.p0b);
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    await unmuteMetric(actor(ben), ids.p0b);
    expect(await archivedMetricHolds(about)).toBeNull();
    await markNotUseful(actor(ben), key);
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    await db().from("heads_up_dismissed").delete().eq("person_id", ben);
    expect(await archivedMetricHolds(about)).toBeNull();
    await setHeadsUpSettings(actor(ben), { byMessage: false });
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
    await setHeadsUpSettings(actor(ben), { byMessage: true, show: false });
    expect(await archivedMetricHolds(about)).toBe("Not sent.");
  });

  it("keeps what still stands as told for ever, and forgets only ended ones after 30 days", async () => {
    const { w, sara } = await setup(["p0a", "p0b"]);
    const old = new Date("2026-06-01T00:00:00Z").toISOString();
    await db().from("heads_up_told").insert([
      { workspace_id: w.id, person_id: sara, key: "moving-together:1:2", told_at: old },
      { workspace_id: w.id, person_id: sara, key: "moving-together:1:3", told_at: old, ended_at: old },
    ]);
    await db().rpc("end_heads_up_told", { p_ws: w.id, p_person: sara, p_standing: ["moving-together:1:2"], p_now: new Date("2026-08-01T00:00:00Z").toISOString() });
    expect((await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara })).map((r) => r.key)).toEqual(["moving-together:1:2"]);
  });

  it("goes with a deleted Metric, and a Heads-up message must name a Metric", async () => {
    const { w, ben, ids, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben);
    await deliverHeadsUpsTo(w.id, ben);
    expect(await messages(ben)).toHaveLength(1);
    await db().from("metrics").delete().eq("id", ids.p0b);
    expect(await messages(ben)).toHaveLength(0);
    const bad = await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: ben, kind: "heads_up", subject: "x", body: "y", mail_state: "outbox" });
    expect(bad.error).not.toBeNull();
  });

  it("cannot be answered", async () => {
    const { w, ben, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben);
    await deliverHeadsUpsTo(w.id, ben);
    const [m] = await messages(ben);
    const { routeReply } = await import("./reply-routing");
    const said: string[] = [];
    const via = { source: "mail" as const, sender: "x", answer: async (_s: string, t: string) => { said.push(t); } };
    expect(await routeReply({ id: m.id, workspace_id: w.id, kind: "heads_up", recipient_id: ben, action_id: null, prompt_id: null } as never, "12", via as never)).toBe("refused");
    expect(said).toEqual(["Heads-ups cannot be answered; open Ziffr."]);
  });
});

describe("leaving, giving back, switching off and the limits in the database", () => {
  it("removes a person's choices and what they were told when they leave, so that coming back starts clean and sends nothing", async () => {
    const { w, ben, ids, actor, shareAll, on, messages } = await setup(["p0a", "p0b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await on(ben);
    await deliverHeadsUpsTo(w.id, ben);
    await muteMetric(actor(ben), ids.p0a);
    await markNotUseful(actor(ben), `moving-together:${ids.p0a}:${ids.p0b}`);
    const rows = async () => (await Promise.all(["heads_up_settings", "heads_up_dismissed", "heads_up_mutes", "heads_up_told"].map((t) => rowsOf(t, { workspace_id: w.id, person_id: ben })))).map((r) => r.length);
    expect(await rows()).toEqual([1, 1, 1, 1]);
    await w.dropMember(ben);
    expect(await rows()).toEqual([0, 0, 0, 0]);
    await db().from("memberships").insert({ workspace_id: w.id, user_id: ben, role: "member" });
    expect(await headsUpSettings(actor(ben))).toEqual({ show: true, byMessage: false });
    expect(await deliverHeadsUps(w.id)).toEqual({ people: 0, sent: 0, failed: 0 });
    expect(await deliverHeadsUpsTo(w.id, ben)).toBe(0);
    expect((await messages(ben)).length).toBe(1);
    expect((await myHeadsUps(actor(ben))).items).toHaveLength(1);
  });

  it("refuses a person who is not a member: no row, no claim, no settings", async () => {
    const { w, ben, ids, actor, on } = await setup(["p0a", "p0b"]);
    await on(ben).catch(() => undefined);
    await w.dropMember(ben);
    const gone = await db().rpc("claim_heads_up_message", { p_ws: w.id, p_person: ben, p_key: "moving-together:1:2", p_cap: 3, p_now: new Date().toISOString() });
    expect(gone.data).toBe("gone");
    expect(await rowsOf("heads_up_told", { workspace_id: w.id, person_id: ben })).toEqual([]);
    await expect(setHeadsUpSettings(actor(ben), { byMessage: true })).rejects.toThrow();
    expect((await db().from("heads_up_mutes").insert({ workspace_id: w.id, person_id: ben, metric_id: ids.p0a })).error).not.toBeNull();
    expect((await db().from("heads_up_dismissed").insert({ workspace_id: w.id, person_id: ben, key: "moving-together:1:2" })).error).not.toBeNull();
    expect(await deliverHeadsUps(w.id)).toEqual({ people: 0, sent: 0, failed: 0 });
  });

  it("gives a counted place back when the send throws and when the message fails for good, by its own row only", async () => {
    const { w, sara, on, messages } = await setup(["p0a", "p0b"]);
    await on(sara);
    failing.on = true;
    expect(await deliverHeadsUps(w.id)).toEqual({ people: 1, sent: 0, failed: 1 });
    expect(await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara })).toEqual([]);
    failing.on = false;
    expect(await deliverHeadsUpsTo(w.id, sara)).toBe(1);
    const [m] = await messages(sara);
    const open = async () => (await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara })).filter((r) => r.ended_at === null).length;
    expect(await open()).toBe(1);
    // Failed for good, whatever the reason (no address, opted out, not set up, attempts used up, refused as it left): the place comes back.
    await db().from("deliveries").update({ mail_state: "failed" }).eq("id", m.id);
    expect(await open()).toBe(0);
    // Once: a second failure of the same message changes nothing.
    await db().from("deliveries").update({ last_error: "again" }).eq("id", m.id);
    expect(await open()).toBe(0);
  });

  it("does not send a message hours later for a Heads-up that ended meanwhile, and a refusal of the old one does not take the place of a new one", async () => {
    const { w, sara, ids, actor, on, messages } = await setup(["p0a", "p0b"]);
    await on(sara);
    const t = (days: number) => new Date(Date.parse("2026-08-01T10:00:00Z") + days * 86_400_000);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(0) })).toBe(1);
    const [d1] = await messages(sara);
    const key = (await db().from("deliveries").select("heads_up_key").eq("id", d1.id).single()).data!.heads_up_key as string;
    const toldId = (await db().from("deliveries").select("heads_up_told_id").eq("id", d1.id).single()).data!.heads_up_told_id as number;
    const about = (id: number, told: number) => ({ id, workspace_id: w.id, kind: "heads_up", recipient_id: sara, heads_up_metric_a: d1.heads_up_metric_a, heads_up_metric_b: d1.heads_up_metric_b, heads_up_key: key, heads_up_told_id: told });
    expect(await archivedMetricHolds(about(d1.id, toldId))).toBeNull();
    // It ends (muted), returns (unmuted) and is said again: a second message with a row of its own.
    await muteMetric(actor(sara), ids.p0a);
    await deliverHeadsUpsTo(w.id, sara, { now: t(1) });
    await unmuteMetric(actor(sara), ids.p0a);
    expect(await deliverHeadsUpsTo(w.id, sara, { now: t(2) })).toBe(1);
    const [, d2] = await messages(sara);
    const toldId2 = (await db().from("deliveries").select("heads_up_told_id").eq("id", d2.id).single()).data!.heads_up_told_id as number;
    expect(toldId2).not.toBe(toldId);
    // The old message, held until now, is refused: its Heads-up ended. Failing it gives nothing back that is not its own.
    expect(await archivedMetricHolds(about(d1.id, toldId))).toBe("Not sent.");
    await db().from("deliveries").update({ mail_state: "failed" }).eq("id", d1.id);
    const open = (await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara })).filter((r) => r.ended_at === null);
    expect(open.map((r) => r.id)).toEqual([toldId2]);
    expect(await archivedMetricHolds(about(d2.id, toldId2))).toBeNull();
    // A message that names no row never goes.
    expect(await archivedMetricHolds({ ...about(d2.id, toldId2), heads_up_told_id: null })).toBe("Not sent.");
    expect(await archivedMetricHolds({ ...about(d2.id, 999999999), heads_up_told_id: 999999999 })).toBe("Not sent.");
  });

  it("ends what they were told when a person switches Heads-ups off, and when they use the link in the email", async () => {
    const { w, sara, actor, on } = await setup(["p0a", "p0b"]);
    await on(sara);
    await deliverHeadsUpsTo(w.id, sara);
    const open = async () => (await rowsOf("heads_up_told", { workspace_id: w.id, person_id: sara })).filter((r) => r.ended_at === null).length;
    expect(await open()).toBe(1);
    await setHeadsUpSettings(actor(sara), { byMessage: false });
    expect(await open()).toBe(0);
    await on(sara);
    await db().from("heads_up_told").insert({ workspace_id: w.id, person_id: sara, key: "moving-together:1:2" });
    const { data: m } = await db().from("deliveries").select("id").eq("recipient_id", sara).eq("kind", "heads_up").limit(1).single();
    const token = "A".repeat(32);
    await db().from("deliveries").update({ unsubscribe_token: token }).eq("id", m!.id);
    expect(await unsubscribeIsHeadsUp(token)).toBe(true);
    expect(await unsubscribeIsHeadsUp("B".repeat(32))).toBe(false);
    expect(await optOutByToken(token)).toEqual({ undo: null });
    expect(await headsUpSettings(actor(sara))).toEqual({ show: true, byMessage: false });
    expect(await open()).toBe(0);
    // Used again: nothing changes.
    expect(await optOutByToken(token)).toEqual({ undo: null });
    expect(await headsUpSettings(actor(sara))).toEqual({ show: true, byMessage: false });
  });

  it("counts the limit of Not useful in the database, so calls at once cannot pass it, and a key already there is not counted again", async () => {
    const { w, sara, ids, actor } = await setup(["p0a", "p0b", "p1a", "p1b", "p2a", "p2b"]);
    await db().from("heads_up_dismissed").insert(Array.from({ length: 1999 }, (_, i) => ({ workspace_id: w.id, person_id: sara, key: `filler-kind:${i}` })));
    const all = Object.values(ids);
    const pairs: string[] = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) pairs.push(`moving-together:${Math.min(all[i], all[j])}:${Math.max(all[i], all[j])}`);
    const results = await Promise.allSettled(pairs.slice(0, 8).map((k) => markNotUseful(actor(sara), k)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await rowsOf("heads_up_dismissed", { workspace_id: w.id, person_id: sara }))).toHaveLength(2000);
    const there = (await rowsOf("heads_up_dismissed", { workspace_id: w.id, person_id: sara })).find((r) => String(r.key).startsWith("moving"))!.key as string;
    await markNotUseful(actor(sara), there);
  });

  it("refuses a mute or a Heads-up message that names a Metric of another Workspace", async () => {
    const { w, sara } = await setup(["p0a", "p0b"]);
    const other = await setup(["p0a", "p0b"]);
    const mute = await db().from("heads_up_mutes").insert({ workspace_id: w.id, person_id: sara, metric_id: other.ids.p0a });
    expect(mute.error).not.toBeNull();
    const msg = await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: sara, kind: "heads_up", subject: "x", body: "y", mail_state: "outbox", heads_up_metric_a: other.ids.p0a, heads_up_key: "moving-together:1:2" });
    expect(msg.error).not.toBeNull();
  });
});

describe("the tables are the core's alone", () => {
  it("cannot be read or written by the public roles, nor their functions", async () => {
    const { w, sara } = await setup(["p0a", "p0b"]);
    await db().from("heads_up_settings").insert({ workspace_id: w.id, person_id: sara, show: true, by_message: true });
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "anon", { auth: { persistSession: false } });
    for (const table of ["heads_up_settings", "heads_up_dismissed", "heads_up_mutes", "heads_up_told"]) {
      const read = await anon.from(table).select("*");
      expect(read.data ?? []).toEqual([]);
    }
    const rpc = await anon.rpc("claim_heads_up_message", { p_ws: w.id, p_person: sara, p_key: "moving-together:1:2", p_cap: 3, p_now: new Date().toISOString() });
    expect(rpc.error).not.toBeNull();
    const ended = await anon.rpc("end_heads_up_told", { p_ws: w.id, p_person: sara, p_standing: [], p_now: new Date().toISOString() });
    expect(ended.error).not.toBeNull();
  });
});

describe("the list over a Workspace that is over the cap", () => {
  it("keeps a person's own scan for a few minutes, never for another set of Metrics, and fails closed over the budget", async () => {
    const { w, ben, ids, actor, shareAll, scan } = await setup(["p0a", "p0b", "p1a", "p1b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    // The Workspace's own scan is said to have been capped: a person's list is a scan of their own Metrics.
    await db().from("heads_up_scans").update({ capped: true }).eq("workspace_id", w.id);
    const t0 = Date.parse("2026-08-01T10:00:00Z");
    const first = await listHeadsUps(actor(ben), { now: t0 });
    expect(first).toHaveLength(1);
    // The values change under it: within ten minutes the kept result answers, after them a new scan does.
    await db().from("observations").delete().eq("metric_id", ids.p0b);
    const noise = changesOf(900);
    await db().from("observations").insert(levels(noise).map((value, k) => ({ metric_id: ids.p0b, period_start: month(k), value, source: "api", workspace_id: w.id })));
    expect(await listHeadsUps(actor(ben), { now: t0 + 9 * 60_000 })).toEqual(first);
    expect(await listHeadsUps(actor(ben), { now: t0 + 10 * 60_000 })).toEqual([]);
    // A Metric hidden since is gone at once, from the kept result too (the values are put back; a new scan, ten minutes on, sees them).
    await db().from("observations").delete().eq("metric_id", ids.p0b);
    await db().from("observations").insert(seriesOf("p0b").map((value, k) => ({ metric_id: ids.p0b, period_start: month(k), value, source: "api", workspace_id: w.id })));
    expect(await listHeadsUps(actor(ben), { now: t0 + 21 * 60_000 })).toHaveLength(1);
    await w.unshare(ids.p0b, ben);
    expect(await listHeadsUps(actor(ben), { now: t0 + 21 * 60_000 + 1 })).toEqual([]);
    await w.share(ids.p0b, ben);
    // Six scans in an hour are the budget: with a new set of Metrics and no kept result for it, a seventh says so and tells nothing.
    resetHeadsUpBudget();
    for (let i = 0; i < 6; i++) await listHeadsUps(actor(ben), { now: t0 + i * 11 * 60_000 });
    await w.share(ids.p1a, ben);
    await expect(listHeadsUps(actor(ben), { now: t0 + 56 * 60_000 })).rejects.toThrow("Heads-ups could not be read. Try again in a moment.");
    // An hour on, the budget is whole again.
    expect(await listHeadsUps(actor(ben), { now: t0 + 66 * 60_000 })).toBeDefined();
    void scan;
  });

  it("lets the job read what is kept but keep nothing, so it cannot push a page's result out", async () => {
    const { w, ben, ids, actor, shareAll } = await setup(["p0a", "p0b", "p1a", "p1b"]);
    await shareAll(ben, ["p0a", "p0b"]);
    await db().from("heads_up_scans").update({ capped: true }).eq("workspace_id", w.id);
    const t0 = Date.parse("2026-08-01T10:00:00Z");
    expect(await listHeadsUps(actor(ben), { now: t0, lane: "job" })).toHaveLength(1);
    await db().from("observations").delete().eq("metric_id", ids.p0b);
    await db().from("observations").insert(levels(changesOf(900)).map((value, k) => ({ metric_id: ids.p0b, period_start: month(k), value, source: "api", workspace_id: w.id })));
    // The job kept nothing: the page's call a minute later scans for itself and sees the change.
    expect(await listHeadsUps(actor(ben), { now: t0 + 60_000 })).toEqual([]);
    // A page's result is kept; the job then reads it instead of scanning.
    await db().from("observations").delete().eq("metric_id", ids.p0b);
    await db().from("observations").insert(seriesOf("p0b").map((value, k) => ({ metric_id: ids.p0b, period_start: month(k), value, source: "api", workspace_id: w.id })));
    expect(await listHeadsUps(actor(ben), { now: t0 + 61_000, lane: "job" })).toEqual([]);
  });
});
