// @ts-nocheck
// Getting an n8n template for a Feed against the real database (spec 0043, ticket 5; GLOSSARY: Automation Template, Feed,
// Feed Key): only Owners and Admins, the file with this Ziffr's address and no key in it, the Feed made a Submitter of the
// Metrics, a Feed Key made only when asked and shown once, everything named checked before anything is made.
import { afterEach, describe, expect, it } from "vitest";
import { actorForSecret } from "./access-keys";
import { Forbidden, type FeedActor } from "./actor";
import { db } from "./db";
import { automationTemplateFor, feedTemplates } from "./feed-template-download";
import { createFeed, listFeeds } from "./feeds";
import { DEMO_WORKSPACE_ID } from "./team";
import { opened, workspace } from "./test/db-fixtures";

const SITE = "https://ziffr.example.org";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const sheets = () => feedTemplates().find((t) => t.id === "google-sheets")!.id;
const tokens = async (metricId: number) => (await db().from("tokens").select("id", { count: "exact", head: true }).eq("metric_id", metricId)).count ?? 0;
const settingsOf = (text: string) => (JSON.parse(text) as { nodes: { name: string; parameters: { assignments?: { assignments: { name: string; value: string }[] } } }[] }).nodes.find((n) => n.name === "Settings")!.parameters.assignments!.assignments;

describe("the n8n template for some Metrics and a Feed", () => {
  it("puts this Ziffr's address in the file, makes the Feed a Submitter of each Metric and names them in a starter sheet, with no key", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { name: "Headcount" }); const b = await w.metric(sara, { name: "Attrition" });
    const r = await automationTemplateFor(w.actor(sara), SITE, { template: sheets(), metrics: [a.id, b.id], feed: { name: "HR sheet" }, makeKey: false });
    expect(r.fileName).toBe("ziffr-google-sheets.json");
    expect(settingsOf(r.workflow).find((x) => x.name === "ziffrUrl")!.value).toBe(SITE);
    // Everything else is as shipped: still placeholders, and no key of any kind.
    expect(settingsOf(r.workflow).filter((x) => x.name !== "ziffrUrl").every((x) => x.value.startsWith("REPLACE-WITH-"))).toBe(true);
    expect(r.workflow).not.toMatch(/zk_|Bearer [A-Za-z0-9]/);
    expect(r.key).toBeNull();
    expect(r.startSheet).toBe(`metric,value,period\n${r.metrics[0].slug},,\n${r.metrics[1].slug},,\n`);
    expect((await listFeeds(w.actor(sara))).map((f) => f.name)).toEqual(["HR sheet"]);
    expect(await tokens(a.id)).toBe(1);
    expect(await tokens(b.id)).toBe(1);
    // The Metric now takes values through the API, which is what a Feed sends.
    const { data: m } = await db().from("metrics").select("sources").eq("id", a.id).single();
    expect(m!.sources).toContain("api");
  });

  it("makes a Feed Key only when asked, shows it once and keeps it out of the file and the audit event", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = await w.metric(sara, { name: "Headcount" });
    const { id: feedId } = await createFeed(w.actor(sara), "HR sheet");
    const r = await automationTemplateFor(w.actor(sara), SITE, { template: sheets(), metrics: [a.id], feed: { id: feedId }, makeKey: true });
    expect(r.key!.secret).toMatch(/^zk_/);
    expect(r.workflow).not.toContain(r.key!.secret);
    expect(r.key!.expiresOn > new Date().toISOString().slice(0, 10)).toBe(true);
    expect(r.key!.expiresOn <= new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)).toBe(true);
    // The key acts for that Feed: it may record values for the Metric and nothing else.
    expect(((await actorForSecret(r.key!.secret)) as FeedActor).feed).toBeTruthy();
    // The details are sealed at rest: read them as the app does.
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, kind, details").eq("workspace_id", w.id).eq("kind", "feed.template_downloaded")).data);
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ template: "google-sheets", metrics: 1, key: true });
    expect(JSON.stringify(events)).not.toContain(r.key!.secret);
    expect(JSON.stringify(events)).not.toContain("ziffrUrl");
  });

  it("is for Owners and Admins only, never Members, Guests, keys or the demo", async () => {
    const w = await ws(); const sara = await w.person("owner"); const adam = await w.person("admin"); const ben = await w.person("member"); const gus = await w.person("guest");
    const own = await w.metric(ben, { name: "Ben's" });
    const input = { template: sheets(), metrics: [own.id], feed: { name: "X" }, makeKey: false };
    await expect(automationTemplateFor(w.actor(ben, "member"), SITE, input)).rejects.toThrow(Forbidden);
    await expect(automationTemplateFor(w.actor(gus, "guest"), SITE, input)).rejects.toThrow(Forbidden);
    await expect(automationTemplateFor({ ...w.actor(sara), key: { id: "1", scopes: ["metrics:read"] } } as never, SITE, input)).rejects.toThrow(Forbidden);
    await expect(automationTemplateFor({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, SITE, input)).rejects.toThrow(Forbidden);
    expect(await listFeeds(w.actor(sara))).toEqual([]);
    // An Admin may, for a Metric whose Submitters they may change (an Owner's own or one shared to them as Editor).
    const mine = await w.metric(adam, { name: "Adam's" });
    expect((await automationTemplateFor(w.actor(adam, "admin"), SITE, { ...input, metrics: [mine.id] })).metrics).toHaveLength(1);
  });

  it("checks everything before making anything: Metrics that are not the person's, Derived ones, a Feed of another Workspace, a template not on the list", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const bens = await w.metric(ben, { name: "Ben's" });
    const mine = await w.metric(sara, { name: "Mine" });
    const derived = await w.metric(sara, { name: "Computed" });
    await db().from("metrics").update({ formula: `{${mine.slug}} * 2`, sources: [] }).eq("id", derived.id);
    const other = await ws(); const olga = await other.person("owner");
    const { id: foreign } = await createFeed(other.actor(olga), "Theirs");
    const ok = { template: sheets(), metrics: [mine.id], feed: { name: "Ours" }, makeKey: true };
    // Sara owns a Metric Ben made? No: Ben's is Ben's; an Admin or Owner is not an Editor of it by role.
    await expect(automationTemplateFor(w.actor(sara), SITE, { ...ok, metrics: [mine.id, bens.id] })).rejects.toThrow();
    await expect(automationTemplateFor(w.actor(sara), SITE, { ...ok, metrics: [derived.id] })).rejects.toThrow(/computed from other Metrics/);
    await expect(automationTemplateFor(w.actor(sara), SITE, { ...ok, feed: { id: foreign } })).rejects.toThrow(/this Workspace's Feeds/);
    for (const template of ["nope", "../../etc/passwd", "google-sheets-feed.json", ""]) {
      await expect(automationTemplateFor(w.actor(sara), SITE, { ...ok, template })).rejects.toThrow(/templates offered/);
    }
    // Nothing was made by any of those: no Feed, no Submitter, no key.
    expect(await listFeeds(w.actor(sara))).toEqual([]);
    expect(await tokens(mine.id)).toBe(0);
    const { count } = await db().from("access_keys").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).not("feed_id", "is", null);
    expect(count).toBe(0);
  });

  it("refuses a list of Metrics that is empty, too long, has a repeat or holds something that is not an id, and an address it cannot write into a file", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "M" });
    const base = { template: sheets(), feed: { name: "F" }, makeKey: false };
    for (const metrics of [[], Array.from({ length: 51 }, (_, i) => i + 1), [m.id, m.id], [0], [-1], [1.5], ["x" as never]]) {
      await expect(automationTemplateFor(w.actor(sara), SITE, { ...base, metrics })).rejects.toThrow(/Pick 1 to 50 Metrics/);
    }
    for (const site of ["", "ziffr.example.org", "javascript:alert(1)", `https://x.org/"`, "https://x.org/", "https://x.org y"]) {
      await expect(automationTemplateFor(w.actor(sara), site, { ...base, metrics: [m.id] })).rejects.toThrow(/address is not set/);
    }
    expect(await listFeeds(w.actor(sara))).toEqual([]);
  });

  it("offers every template of the list, and each one can be made", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "M" });
    const { id } = await createFeed(w.actor(sara), "F");
    expect(feedTemplates().length).toBeGreaterThan(0);
    for (const t of feedTemplates()) {
      const r = await automationTemplateFor(w.actor(sara), SITE, { template: t.id, metrics: [m.id], feed: { id }, makeKey: false });
      expect(JSON.parse(r.workflow).nodes.length).toBeGreaterThan(3);
      expect(r.startSheet !== null).toBe(t.rows);
    }
  });
});
