// The Actions about a Widget's Metrics against the real database (GLOSSARY: Action, Widget): only Actions the person may
// read, only for Metrics they see, none closed, nothing of another Workspace.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { openActionsAboutMetrics } from "./metric-actions";
import { JANUARY, periodStart } from "./periods";
import { workspace } from "./test/db-fixtures";

let w: Awaited<ReturnType<typeof workspace>>;
let other: Awaited<ReturnType<typeof workspace>>;
let sara: string, ben: string, carla: string;
let payroll: { id: number; slug: string }, visits: { id: number; slug: string }, theirs: { id: number; slug: string };
let openId: number, limitedId: number, closedId: number;
const thisMonth = periodStart(new Date(), "month", JANUARY);

beforeAll(async () => {
  w = await workspace(); other = await workspace();
  sara = await w.person("owner"); ben = await w.person("member"); carla = await w.person("member");
  payroll = await w.metric(sara, { name: "Payroll" });
  visits = await w.metric(sara, { name: "Visits" });
  await w.share(payroll.id, carla); await w.share(visits.id, carla);
  openId = await w.action({ metric_id: payroll.id, period_start: thisMonth, asker_id: sara, assignee_id: sara, question: "Why up?" });
  closedId = await w.action({ metric_id: payroll.id, period_start: thisMonth, asker_id: sara, assignee_id: sara, status: "closed" });
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
  limitedId = await w.action({ metric_id: payroll.id, period_start: thisMonth, asker_id: sara, assignee_id: sara, read_group_id: g!.id as number });
  const osara = await other.person("owner");
  theirs = await other.metric(osara, { name: "Theirs" });
  await other.action({ metric_id: theirs.id, period_start: thisMonth, asker_id: osara, assignee_id: osara });
});
afterAll(async () => { await w.cleanup(); await other.cleanup(); });

const ids = async (person: string, role: "owner" | "member", slugs: string[]) => (await openActionsAboutMetrics(w.actor(person, role), slugs)).map((r) => r.id);

describe("the Actions about a Widget's Metrics", () => {
  it("lists the open ones the person may read, not closed ones, and names the Metric and the question", async () => {
    const rows = await openActionsAboutMetrics(w.actor(sara), [payroll.slug, visits.slug]);
    expect(rows.map((r) => r.id).sort()).toEqual([openId, limitedId].sort());
    expect(rows.find((r) => r.id === openId)).toMatchObject({ question: "Why up?", metric: { slug: payroll.slug, name: "Payroll" } });
    expect(rows.map((r) => r.id)).not.toContain(closedId);
  });

  it("leaves out an Action kept to a Group the person is not in", async () => {
    expect(await ids(carla, "member", [payroll.slug])).toEqual([openId]);
  });

  it("drops a Metric the person does not see, and one of another Workspace, without a word", async () => {
    expect(await ids(ben, "member", [payroll.slug, theirs.slug])).toEqual([]);
    expect(await ids(sara, "owner", [theirs.slug, "no-such-metric"])).toEqual([]);
  });
});
