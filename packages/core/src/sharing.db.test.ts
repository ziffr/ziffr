// Metrics, sharing, access requests and the team through the core, against the real database (ticket #12).
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createMetric, removeSeriesRows, saveSeriesRows, setMetricSources, updateMetricDetails, uploadSeries, type MetricEffects } from "./metrics";
import { decideAccess, requestAccess, share, shareWithGroup, whoCanSee } from "./sharing";
import { addContact, createGroup, deleteGroup, removeContact, renameGroup, setGroupMember } from "./team";
import { canSee } from "./sharing";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const metricFx = (): MetricEffects => ({ recordCreated: vi.fn(async () => {}), promptSubmitter: vi.fn(async () => {}) });
const notices = () => ({ notify: vi.fn(async () => {}) });
const forbidden = expect.any(Forbidden);

describe("creating Metrics", () => {
  it("creates in the actor's workspace, owned by them, with fields checked and a Token per submitter", async () => {
    const w = await ws(); const sara = await w.person("owner"); const cleo = await w.contact({ email: "c@t.test" });
    const fx = metricFx();
    const m = await createMetric(w.actor(sara), { name: "Field visits", format: "bogus", period: "decade", sources: ["slack", "telepathy"], submitters: [cleo] }, fx);
    const { data } = await db().from("metrics").select("*").eq("id", m.id).single();
    expect(data).toMatchObject({ workspace_id: w.id, owner_id: sara, format: "number", period: "month", sources: ["slack"] });
    const { data: tokens } = await db().from("tokens").select("submitter_id, code").eq("metric_id", m.id);
    expect(tokens).toHaveLength(1);
    expect(tokens![0].code).toMatch(/^tk-[A-Za-z0-9_-]{24}$/);
    expect(fx.promptSubmitter).toHaveBeenCalledWith(m.id, cleo, sara);
  });
  it("refuses Guests and submitters from another workspace", async () => {
    const w = await ws(); const gus = await w.person("guest"); const sara = await w.person("owner");
    await expect(createMetric(w.actor(gus, "guest"), { name: "X" }, metricFx())).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(createMetric(w.actor(sara), { name: "X", submitters: [zoe] }, metricFx())).rejects.toEqual(forbidden);
  });
  it("lets only the owner upload a Target Series, in their own workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara);
    await expect(uploadSeries(w.actor(ben, "member"), m.id, "target", "2026-12 10", "")).rejects.toEqual(forbidden);
    const other = await ws("Other");
    await expect(uploadSeries({ personId: sara, workspaceId: other.id, role: "owner" }, m.id, "target", "2026-12 10", "")).rejects.toEqual(forbidden);
    expect(await uploadSeries(w.actor(sara), m.id, "target", "2026-12 10\nnot a line", "")).toEqual({ saved: 1, skipped: 1 });
  });
  it("saves rows edited in the targets table, for the owner only, and refuses rows it cannot read", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara);
    const rows = [{ period: "2026-12-15", value: 0.125 }, { period: "2027-01-01", value: 140000 }];
    await expect(saveSeriesRows(w.actor(ben, "member"), m.id, "target", rows, "")).rejects.toEqual(forbidden);
    await expect(saveSeriesRows(w.actor(sara), m.id, "target", [{ period: "Dec", value: 1 }], "")).rejects.toThrow();
    await expect(saveSeriesRows(w.actor(sara), m.id, "target", "2026-12 10", "")).rejects.toThrow();
    expect(await saveSeriesRows(w.actor(sara), m.id, "target", rows, "Budget 2027")).toEqual({ saved: 2 });
    const { data } = await db().from("series_values").select("period_start, value").eq("metric_id", m.id).order("period_start");
    // A day inside a month is that month, and a value with three decimals stays what it was.
    expect(data!.map((r) => [r.period_start, Number(r.value)])).toEqual([["2026-12-01", 0.125], ["2027-01-01", 140000]]);
    // Removing: the owner only, real days only, and only the periods named.
    await expect(removeSeriesRows(w.actor(ben, "member"), m.id, "target", ["2026-12-01"])).rejects.toEqual(forbidden);
    await expect(removeSeriesRows(w.actor(sara), m.id, "target", ["2026-12-01,period_start.neq.x"])).rejects.toThrow();
    expect(await removeSeriesRows(w.actor(sara), m.id, "target", ["2026-12-01", "2030-01-01"])).toEqual({ removed: 1 });
    const { data: left } = await db().from("series_values").select("period_start").eq("metric_id", m.id);
    expect(left!.map((r) => r.period_start)).toEqual(["2027-01-01"]);
  });
});

describe("how values arrive", () => {
  it("lets only the owner change a Metric's Sources, to known ones, at least one, never on a Derived Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara, { sources: ["web_form"] });
    await expect(setMetricSources(w.actor(ben, "member"), m.id, ["mail"])).rejects.toEqual(forbidden);
    await expect(setMetricSources({ ...w.actor(sara), key: { id: 1, scopes: ["metrics:write"] } } as never, m.id, ["mail"])).rejects.toEqual(forbidden);
    await expect(setMetricSources(w.actor(sara), m.id, [])).rejects.toThrow(/at least one/);
    await expect(setMetricSources(w.actor(sara), m.id, ["fax"])).rejects.toThrow(/at least one/);
    expect(await setMetricSources(w.actor(sara), m.id, ["mail", "slack", "mail", "fax"])).toEqual(["mail", "slack"]);
    expect((await db().from("metrics").select("sources").eq("id", m.id).single()).data!.sources).toEqual(["mail", "slack"]);
    const d = await w.metric(sara, { formula: `{${m.slug}} * 2` });
    await expect(setMetricSources(w.actor(sara), d.id, ["mail"])).rejects.toThrow(/Derived/);
    const other = await ws("Other");
    await expect(setMetricSources({ personId: sara, workspaceId: other.id, role: "owner" }, m.id, ["mail"])).rejects.toEqual(forbidden);
  });
});

describe("changing a Metric's description", () => {
  it("is for its owner, checks every field, keeps the slug, refuses a new period once values exist, and keeps a Version", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Visits", period: "month" });
    await expect(updateMetricDetails(w.actor(ben, "member"), m.id, { name: "Mine" })).rejects.toEqual(forbidden);
    await expect(updateMetricDetails(w.actor(sara), m.id, { name: "  " })).rejects.toThrow(/name/);
    await expect(updateMetricDetails(w.actor(sara), m.id, { targetMin: 10, targetMax: 5 })).rejects.toThrow(/above/);
    await updateMetricDetails(w.actor(sara), m.id, { name: "Store visits", unit: "visits", format: "fax", decimals: 99, polarity: "lower", targetMin: 100, targetMax: null, period: "week" });
    const { data: after } = await db().from("metrics").select("slug, name, unit, format, decimals, polarity, target_min, target_max, period").eq("id", m.id).single();
    expect(after).toMatchObject({ slug: m.slug, name: "Store visits", unit: "visits", format: "number", decimals: 6, polarity: "lower", target_max: null, period: "week" });
    expect(Number(after!.target_min)).toBe(100);
    await w.value(m.id, "2026-10-05", 3);
    await expect(updateMetricDetails(w.actor(sara), m.id, { period: "month" })).rejects.toThrow(/period cannot change/);
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", m.id);
    expect(versions!.some((v) => v.message === "Changed its description")).toBe(true);
    const other = await ws("Other");
    await expect(updateMetricDetails({ personId: sara, workspaceId: other.id, role: "owner" }, m.id, { name: "X" })).rejects.toEqual(forbidden);
  });
});

describe("sharing", () => {
  it("lets the owner share a Metric with a member, who then sees it", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara);
    expect(await canSee(w.actor(ben, "member"), "metric", m.id)).toBe(false);
    await share(w.actor(sara), "metric", m.id, ben, "viewer");
    expect(await canSee(w.actor(ben, "member"), "metric", m.id)).toBe(true);
    await share(w.actor(sara), "metric", m.id, ben, null);
    expect(await canSee(w.actor(ben, "member"), "metric", m.id)).toBe(false);
  });
  it("refuses non-owners, Guests, Editor on a Metric, Contacts and people of other workspaces", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const cleo = await w.contact({ email: "cleo@t.test" }); const m = await w.metric(sara);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(share(w.actor(ben, "member"), "metric", m.id, gus, "viewer")).rejects.toEqual(forbidden);
    await db().from("memberships").update({ role: "guest" }).eq("workspace_id", w.id).eq("user_id", sara);
    await expect(share(w.actor(sara, "guest"), "metric", m.id, ben, "viewer")).rejects.toEqual(forbidden);
    await expect(share(w.actor(sara), "metric", m.id, ben, "editor")).rejects.toEqual(forbidden);
    await expect(share(w.actor(sara), "metric", m.id, cleo, "viewer")).rejects.toEqual(forbidden);
    await expect(share(w.actor(sara), "metric", m.id, zoe, "viewer")).rejects.toEqual(forbidden);
    await expect(share({ personId: sara, workspaceId: other.id, role: "owner" }, "metric", m.id, zoe, "viewer")).rejects.toEqual(forbidden);
  });
  it("shares with Everyone, which reaches every member but Guests, and refuses Groups of other workspaces", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    const m = await w.metric(sara);
    const { data: everyone } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("everyone", true).single();
    await shareWithGroup(w.actor(sara), "metric", m.id, everyone!.id, "viewer");
    expect(await canSee(w.actor(ben, "member"), "metric", m.id)).toBe(true);
    expect(await canSee(w.actor(gus, "guest"), "metric", m.id)).toBe(false);
    const other = await ws("Other");
    const { data: theirs } = await db().from("groups").select("id").eq("workspace_id", other.id).eq("everyone", true).single();
    await expect(shareWithGroup(w.actor(sara), "metric", m.id, theirs!.id, "viewer")).rejects.toEqual(forbidden);
  });
  it("refuses sharing a deck that shows Metrics its owner does not see", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const secret = await w.metric(ben);
    const doc = { store: { "shape:1": { type: "ziffr-widget", props: { metricIds: [secret.id], settings: "{}" } } } };
    const { data: deck } = await db().from("decks").insert({ name: "Board", owner_id: sara, workspace_id: w.id, document: doc }).select("id").single();
    await expect(share(w.actor(sara), "deck", deck!.id, ben, "viewer")).rejects.toEqual(forbidden);
  });
});

describe("who can see this, and asking for access", () => {
  it("answers only those who see it, and gives the owner the open requests", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara);
    await expect(whoCanSee(w.actor(ben, "member"), "metric", m.id)).rejects.toEqual(forbidden);
    const fx = notices();
    expect(await requestAccess(w.actor(ben, "member"), "metric", m.id, fx)).toMatch(/Asked/);
    expect(fx.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: sara, senderId: ben }));
    const seen = await whoCanSee(w.actor(sara), "metric", m.id);
    expect(seen.isOwner).toBe(true);
    expect(seen.requests.map((r) => r.requester_id)).toEqual([ben]);
  });
  it("lets only the owner decide, and a grant makes the requester a Viewer", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara);
    await requestAccess(w.actor(ben, "member"), "metric", m.id, notices());
    const { data: req } = await db().from("access_requests").select("id").eq("workspace_id", w.id).single();
    await expect(decideAccess(w.actor(ann, "member"), req!.id, true, notices())).rejects.toEqual(forbidden);
    const other = await ws("Other");
    await expect(decideAccess({ personId: sara, workspaceId: other.id, role: "owner" }, req!.id, true, notices())).rejects.toEqual(forbidden);
    const fx = notices();
    await decideAccess(w.actor(sara), req!.id, true, fx);
    expect(await canSee(w.actor(ben, "member"), "metric", m.id)).toBe(true);
    expect(fx.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: ben }));
  });
  it("refuses asking for something in another workspace", async () => {
    const a = await ws("A"); const b = await ws("B"); const ann = await a.person("member"); const zoe = await b.person("owner");
    const mb = await b.metric(zoe);
    await expect(requestAccess(a.actor(ann, "member"), "metric", mb.id, notices())).rejects.toEqual(forbidden);
  });
});

describe("the team", () => {
  it("lets owners and admins manage Groups, not members", async () => {
    const w = await ws(); const ad = await w.person("admin"); const ben = await w.person("member");
    await expect(createGroup(w.actor(ben, "member"), "Sales")).rejects.toEqual(forbidden);
    await createGroup(w.actor(ad, "admin"), "Sales");
    const { data: g } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Sales").single();
    await setGroupMember(w.actor(ad, "admin"), g!.id, ben, true);
    await renameGroup(w.actor(ad, "admin"), g!.id, "Sales team");
    await deleteGroup(w.actor(ad, "admin"), g!.id);
    expect((await db().from("groups").select("id").eq("id", g!.id)).data).toEqual([]);
  });
  it("keeps Everyone as it is, and Group members to members of the workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const cleo = await w.contact({ email: "c2@t.test" });
    const { data: everyone } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("everyone", true).single();
    await expect(renameGroup(w.actor(sara), everyone!.id, "All")).rejects.toEqual(forbidden);
    await expect(deleteGroup(w.actor(sara), everyone!.id)).rejects.toEqual(forbidden);
    await createGroup(w.actor(sara), "Field");
    const { data: g } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Field").single();
    await expect(setGroupMember(w.actor(sara), g!.id, cleo, true)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(setGroupMember(w.actor(sara), g!.id, zoe, true)).rejects.toEqual(forbidden);
  });
  it("lets owners and admins add and remove Contacts in their own workspace only", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    await expect(addContact(w.actor(ben, "member"), { name: "Cleo", email: "cleo3@t.test" })).rejects.toEqual(forbidden);
    const id = await addContact(w.actor(sara), { name: "Cleo", email: "cleo3@t.test" });
    cleanups.push(async () => { await db().from("profiles").delete().eq("id", id); });
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(removeContact(other.actor(zoe), id)).rejects.toEqual(forbidden);
    await removeContact(w.actor(sara), id);
    expect((await db().from("contacts").select("person_id").eq("person_id", id)).data).toEqual([]);
  });
});

describe("after the review", () => {
  it("declines a request from someone who has left, instead of leaving it open", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara);
    await requestAccess(w.actor(ben, "member"), "metric", m.id, notices());
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ben);
    const { data: req } = await db().from("access_requests").select("id").eq("workspace_id", w.id).single();
    await decideAccess(w.actor(sara), req!.id, true, notices());
    const { data } = await db().from("access_requests").select("status").eq("id", req!.id).single();
    expect(data!.status).toBe("declined");
  });
  it("keeps the last value when an upload names a period twice", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara);
    expect(await uploadSeries(w.actor(sara), m.id, "target", "2026-12 10\n2026-12 12", "")).toEqual({ saved: 1, skipped: 1 });
    const { data } = await db().from("series_values").select("value").eq("metric_id", m.id);
    expect(data!.map((r) => Number(r.value))).toEqual([12]);
  });
  it("adds no Contacts to the demo, whoever asks", async () => {
    await expect(addContact({ personId: "sara", workspaceId: "d3e00000-0000-4000-8000-000000000001", role: "owner" }, { name: "X", email: "x@t.test" })).rejects.toEqual(forbidden);
  });
});
