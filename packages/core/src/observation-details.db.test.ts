// The details behind a chart point's popup against the real database (#789; GLOSSARY: Observation, Source, Submitter,
// Thread, Guest): a Member sees who submitted and the open Threads they may read; a Guest is told only their own name;
// a person who does not see the Metric, or asks through another Workspace, gets nothing.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { observationDetails } from "./observation-details";
import { workspace } from "./test/db-fixtures";
import { createFeed } from "./feeds";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const P = "2026-03-01";

async function setup() {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member");
  const m = await w.metric(sara, { name: "Support tickets" });
  return { w, sara, ann, m };
}
const share = (w: { id: string }, metricId: number, person: string) => db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: person, role: "viewer" });

describe("observationDetails", () => {
  it("tells a Member the Source, who submitted the latest value and the open Threads", async () => {
    const { w, sara, ann, m } = await setup();
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 300, submitter_id: ann, source: "mail", workspace_id: w.id, created_at: "2026-03-02T09:00:00Z" });
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 311, submitter_id: ann, source: "slack", workspace_id: w.id, created_at: "2026-03-03T09:00:00Z" });
    await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: ann, question: "Why up?" });
    const d = await observationDetails(w.actor(sara), m.slug, P);
    expect(d).toEqual({ source: "Slack", submitter: expect.stringContaining("member"), openThreads: 1 });
  });

  it("does not name another submitter to a Guest, but names the Guest themselves", async () => {
    const { w, ann, m } = await setup();
    const gus = await w.person("guest");
    await share(w, m.id, gus);
    await db().from("observations").insert({ metric_id: m.id, period_start: P, value: 311, submitter_id: ann, source: "slack", workspace_id: w.id });
    expect(await observationDetails(w.actor(gus, "guest"), m.slug, P)).toMatchObject({ source: "Slack", submitter: null });
    await db().from("observations").insert({ metric_id: m.id, period_start: "2026-04-01", value: 290, submitter_id: gus, source: "web_form", workspace_id: w.id });
    expect((await observationDetails(w.actor(gus, "guest"), m.slug, "2026-04-01"))?.submitter).toEqual(expect.stringContaining("guest"));
  });

  it("counts only the Threads the viewer may read", async () => {
    const { w, sara, ann, m } = await setup();
    const gus = await w.person("guest");
    await share(w, m.id, gus);
    // A Thread limited to a Group the Guest is not in.
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
    await w.action({ metric_id: m.id, period_start: P, asker_id: sara, assignee_id: ann, question: "Board only", read_group_id: g!.id });
    expect((await observationDetails(w.actor(sara), m.slug, P))?.openThreads).toBe(1);
    expect((await observationDetails(w.actor(gus, "guest"), m.slug, P))?.openThreads).toBe(0);
  });

  it("is nothing for a Metric the person does not see, another Workspace, or a period that is not the Metric's", async () => {
    const a = await setup(); const b = await setup();
    const stranger = await a.w.person("guest");
    await db().from("observations").insert({ metric_id: a.m.id, period_start: P, value: 3, submitter_id: a.ann, source: "mail", workspace_id: a.w.id });
    expect(await observationDetails(a.w.actor(stranger, "guest"), a.m.slug, P)).toBeNull();
    expect(await observationDetails(b.w.actor(b.sara), a.m.slug, P)).toBeNull();
    expect(await observationDetails(a.w.actor(a.sara), a.m.slug, "2026-03-15")).toBeNull();
    expect(await observationDetails(a.w.actor(a.sara), a.m.slug, "not a day")).toBeNull();
    expect(await observationDetails(a.w.actor(a.sara), { slug: a.m.slug }, P)).toBeNull();
  });

  it("names a Feed, a Contact and a former member to a Member as the Period Record does, and none of them to a Guest", async () => {
    const { w, sara, m } = await setup();
    const gus = await w.person("guest");
    await share(w, m.id, gus);
    const { id: feed } = await createFeed(w.actor(sara), "CRM sync");
    const contact = await w.contact({ email: "lena@example.test" });
    const former = await w.person("member");
    await w.dropMember(former);
    const periods: [string, string][] = [[feed, "2026-01-01"], [contact, "2026-02-01"], [former, "2026-03-01"]];
    for (const [who, period] of periods) await db().from("observations").insert({ metric_id: m.id, period_start: period, value: 1, submitter_id: who, source: "api", workspace_id: w.id });
    const asMember = async (period: string) => (await observationDetails(w.actor(sara), m.slug, period))?.submitter;
    const asGuest = async (period: string) => (await observationDetails(w.actor(gus, "guest"), m.slug, period))?.submitter;
    expect(await asMember("2026-01-01")).toBe("CRM sync");
    expect(await asMember("2026-02-01")).toEqual(expect.stringMatching(/^Contact /));
    expect(await asMember("2026-03-01")).toBe("A former member");
    for (const [, period] of periods) expect(await asGuest(period)).toBeNull();
    // Only the name: never the Contact's email.
    expect(JSON.stringify(await observationDetails(w.actor(sara), m.slug, "2026-02-01"))).not.toContain("lena@");
  });
});
