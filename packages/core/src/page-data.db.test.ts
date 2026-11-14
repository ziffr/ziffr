// What pages read, through the core, against the real database (ticket #42): nothing a person may not see.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { actionThread, activityView, closedDashboardOwner, connectorsView, dashboardWidgets, deckView, metricExtras, sourcesView, submissionForm, workflowsView } from "./page-data";
import { createDashboard, placeWidget } from "./dashboards";
import { share } from "./sharing";
import { createDeck } from "./decks";
import { ask } from "./questions";
import { deliverPrompt } from "./deliveries";
import { periodStart } from "./format";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const month = periodStart(new Date(), "month");

describe("page loaders", () => {
  it("show each person only their own Token codes and Prompts", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ben); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ben, senderId: sara });
    await ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: ben, text: "Private?" });
    const forAnn = await connectorsView(w.actor(ann, "member"));
    expect(forAnn.tokens.map((t) => t.submitter_id)).toEqual([ann]);
    // Ben's Prompt is his alone; the question to him is in a Thread everyone in the workspace may read (GLOSSARY: Thread).
    expect(forAnn.deliveries.filter((d) => d.recipient_id === ben && !d.action_id)).toEqual([]);
    expect(forAnn.deliveries.some((d) => d.recipient_id === ben && d.action_id)).toBe(true);
    expect((await sourcesView(w.actor(ann, "member"))).tokens.map((t) => t.submitter_id)).toEqual([ann]);
    expect((await connectorsView(w.actor(ben, "member"))).deliveries.length).toBeGreaterThan(0);
  });
  it("give a Metric's Token codes only to their submitter, its owner and admins", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben); const benCode = await w.token(m.id, ben); const annCode = await w.token(m.id, ann);
    await share(w.actor(ben, "member"), "metric", m.id, ann, "viewer");
    const codes = async (who: string, role: "owner" | "member") => Object.fromEntries((await metricExtras(w.actor(who, role), m.id, "month")).tokens.map((t) => [t.submitter_id, t.code]));
    expect(await codes(ann, "member")).toEqual({ [ben]: null, [ann]: annCode });
    expect(await codes(ben, "member")).toEqual({ [ben]: benCode, [ann]: annCode });
    await share(w.actor(ben, "member"), "metric", m.id, sara, "viewer");
    expect(await codes(sara, "owner")).toEqual({ [ben]: benCode, [ann]: annCode });
  });
  it("keep Metrics, Workflows and history to what the person sees", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const secret = await w.metric(sara, { name: "Secret" }); const open = await w.metric(ben, { name: "Open" });
    expect((await workflowsView(w.actor(ben, "member"))).metrics.map((m) => m.id)).toEqual([open.id]);
    await expect(metricExtras(w.actor(ben, "member"), secret.id, "month")).rejects.toEqual(forbidden);
    await db().from("versions").insert({ object_type: "metric", object_id: secret.id, version: 1, snapshot: {}, author_id: sara, workspace_id: w.id });
    expect((await activityView(w.actor(ben, "member"))).versions.map((v) => v.object_id)).not.toContain(secret.id);
  });
  it("give nothing of a dashboard, deck or thread one may not see, nor of another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    await expect(dashboardWidgets(w.actor(ben, "member"), d)).rejects.toEqual(forbidden);
    expect(await closedDashboardOwner(w.actor(ben, "member"), d)).toBeTruthy();
    const deck = await createDeck(w.actor(sara), "Plan");
    expect(await deckView(w.actor(ben, "member"), deck)).toMatchObject({ role: null, deck: null });
    const thread = await ask(w.actor(sara), { metricId: m.id, period: month, assigneeId: ben, text: "Q" });
    const other = await ws("Other"); const zoe = await other.person("owner");
    expect(await closedDashboardOwner(other.actor(zoe), d)).toBeNull();
    expect(await deckView(other.actor(zoe), deck)).toBeNull();
    expect(await actionThread(other.actor(zoe), thread)).toBeNull();
    expect(await actionThread(w.actor(ben, "member"), thread)).not.toBeNull();
  });
  it("open a form only for a known code", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara); const code = await w.token(m.id, sara);
    expect((await submissionForm(code))?.metric.id).toBe(m.id);
    expect(await submissionForm("tk-unknown-code-000")).toBeNull();
    expect(await submissionForm("not a code; drop table")).toBeNull();
  });
});
