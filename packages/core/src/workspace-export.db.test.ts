// The Workspace Export as the Owner, against the real database (spec 0040, ticket 8; GLOSSARY: Workspace Export):
// a round trip of awkward data through the file's own reader, that no secret and no id is in the file, who may export and
// after which sign-in, what is left out and said, and what the Audit Log keeps. The writer's and the reader's own
// behaviour is tested in workspace-export-file.test.ts and in @ziffr/pack.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { createAccessKey } from "./access-keys";
import { changeMetricTags } from "./tags";
import { mailHostResolver } from "./mail-hosts";
import { auditLog } from "./audit-log";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { saveDeck } from "./decks";
import { createFeed, createFeedKey } from "./feeds";
import { createMetric, type MetricEffects } from "./metrics";
import { recordObservation } from "./record-value";
import { share, shareWithGroup } from "./sharing";
import { createGroup, DEMO_WORKSPACE_ID, setGroupMember } from "./team";
import { auditRowsOf, workspace } from "./test/db-fixtures";
import { saveTheme } from "./workspace-themes";
import { saveWorkflow } from "./workflows";
import { createWebhook } from "./webhooks";
import { exportWorkspace, previewWorkspaceExport, SIGN_IN_WINDOW_MS, SignInTooOld, WORKSPACE_EXPORTS_PER_HOUR, WorkspaceExportLimit, workspaceExportState } from "./workspace-export";
import { readWorkspaceExportAll } from "./workspace-export-file";
import { getMetrics } from "./workspace-data";
import { saveSeriesRows } from "./metrics";
import { STARTER_THEME } from "./themes";
import { forgetWorkspaceKey } from "./workspace-keys";
import type { Actor } from "./actor";
import type { WorkspaceExportRecord } from "@ziffr/pack/workspace-export";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 53).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
});

const quiet: MetricEffects = { recordCreated: async () => {}, promptSubmitter: async () => false };
const ODD = "R&D @ home 🚀 https://x.example/a?b=c {not a placeholder}";

/** A person with a real sign-in, as the Workspace's Owner has: signed in just now, unless `signIn` is false. */
async function account(personId: string, signIn = true) {
  const email = `auth-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  cleanups.push(async () => { await db().auth.admin.deleteUser(data.user!.id); });
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", personId);
  if (signIn) {
    // Signing in is what the sign-in service dates; the service key is a valid key for the call.
    const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  return data.user!.id;
}

/** A Workspace with an Owner who has just signed in, an Admin, a Member and a Guest. */
async function base(name = "Acme") {
  const w = await workspace(name);
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const owner = await w.person("owner", { email: `owner-${randomUUID().slice(0, 6)}@example.com` });
  const admin = await w.person("admin", { email: `admin-${randomUUID().slice(0, 6)}@example.com` });
  const member = await w.person("member", { email: `member-${randomUUID().slice(0, 6)}@example.com` });
  const authId = await account(owner);
  return { ...w, owner, admin, member, authId, as: w.actor(owner, "owner") };
}

/** The records of a file as the Owner downloads it, read back with the format's own reader. */
async function download(actor: Actor, options: { gzip?: boolean } = {}) {
  const file = await exportWorkspace(actor, options);
  const chunks: Uint8Array[] = [];
  for await (const c of file.stream) chunks.push(c);
  const bytes = Buffer.concat(chunks);
  const text = (options.gzip === false ? bytes : gunzipSync(bytes)).toString("utf8");
  const records = (await readWorkspaceExportAll(bytes)).map((r) => r.record);
  return { file, bytes, text, records };
}
const of = <K extends WorkspaceExportRecord["kind"]>(records: WorkspaceExportRecord[], kind: K) => records.filter((r) => r.kind === kind) as Extract<WorkspaceExportRecord, { kind: K }>[];

/** Everything the format carries, with text and numbers a person might really type. */
async function seed() {
  const s = await base(`Acme ${ODD}`);
  await db().from("workspaces").update({ year_start_month: 2, time_zone: "Europe/Berlin" }).eq("id", s.id);
  const ana = s.owner;
  const group = await createGroup(s.as, "Sales @ EMEA 🚀");
  await setGroupMember(s.as, group, s.member, true);
  await saveTheme(s.as, (await db().from("themes").insert({ name: "x", tokens: STARTER_THEME.tokens, slides: STARTER_THEME.slides, workspace_id: s.id, owner_id: s.owner }).select("id").single()).data!.id, `Calm @ 🚀 https://x.example`, STARTER_THEME.tokens, { ...STARTER_THEME.slides, footer: `Acme @ ${ODD}` });
  const revenue = await createMetric(s.as, { name: `Revenue ${ODD}`, description: `Money in, <b>not bold</b> and “quoted” 💶 ${ODD}`, unit: "€", period: "month", aggregation: "sum", polarity: "higher", decimals: 2, targetMin: 1000.5, targetMax: 9000, submitters: [s.member], sources: ["web_form", "slack"] }, quiet);
  const quarterly = await createMetric(s.as, { name: "Quarterly margin", period: "quarter", aggregation: "average", polarity: "target", decimals: 6, targetMin: 10, targetMax: 20 }, quiet);
  const lower = await createMetric(s.as, { name: "Churn", period: "month", aggregation: "average", polarity: "lower", format: "percent" }, quiet);
  const metrics = await getMetrics(s.id);
  const of_ = (id: number) => metrics.find((m) => m.id === id)!;
  const rec = (id: number, period: string, value: number, extra: { source?: string; imported?: boolean; submitter?: string | null; rows?: { label: string; value: number }[] } = {}) =>
    recordObservation(s.id, of_(id), period, value, { submitter_id: extra.submitter ?? null, source: extra.source ?? "web_form", access_key_id: null }, extra.imported ?? false, extra.rows ?? []);
  await rec(revenue.id, "2026-01-01", 14.12345678, { submitter: s.member, rows: [{ label: "Germany 🇩🇪 @ home", value: 9.12345678 }, { label: "Other", value: 5 }] });
  await rec(revenue.id, "2026-02-01", 1234567.5, { source: "slack", submitter: ana });
  await rec(revenue.id, "2026-03-01", -3, { imported: true });
  await rec(quarterly.id, "2026-02-01", 12.5);
  await rec(quarterly.id, "2026-05-01", 13);
  await saveSeriesRows(s.as, revenue.id, "target", [{ period: "2026-01-01", value: 1500.25 }, { period: "2026-02-01", value: 1600 }], "plan");
  await saveSeriesRows(s.as, revenue.id, "projection", [{ period: "2030-01-01", value: 2000.5 }], "forecast");
  await saveSeriesRows(s.as, lower.id, "target", [{ period: "2026-01-01", value: 3 }], "plan");
  // Eleven more Metrics, so that the labels sort differently as text than as numbers (m10 comes before m3).
  const more = [];
  for (let i = 0; i < 11; i++) more.push(await s.metric(s.owner, { name: `Series ${i}` }));
  await db().from("series_values").insert(more.flatMap((m, i) => [{ metric_id: m.id, kind: "target", period_start: "2026-01-01", value: i + 1, workspace_id: s.id }, { metric_id: m.id, kind: "target", period_start: "2026-02-01", value: i + 2, workspace_id: s.id }]));
  await createMetric(s.as, { name: "Derived" }, quiet).then(async (d) => { await db().from("metrics").update({ formula: `{${revenue.slug}} / {${lower.slug}}`, aggregation: "average" }).eq("id", d.id); });
  const dash = await createDashboard(s.as, `Board ${ODD}`);
  await placeWidget(s.as, dash, { type: "spec", template: "number", metricIds: [revenue.id], title: `Revenue ${ODD}`, settings: { headline: `Up @ ${ODD}`, footnote: "Source: ERP 🚀" } });
  // The app's own form refuses a View Design with such words; one that got in before the rule, or by hand, must still export.
  await db().from("widgets").insert({ owner_id: s.owner, dashboard_id: dash, saved: false, template: "design", metric_ids: [lower.id], title: "Custom", x: 6, y: 0, w: 6, h: 6, workspace_id: s.id, settings: { design: { body: { format: "ziffr.view/1", name: ODD, kind: "metric", slots: [{ label: ODD, metrics: "one" }], size: { w: 6, h: 6 }, parts: [{ mark: "text", content: [ODD, { show: "latest.value", after: " @" }] }] } } } });
  await shareWithGroup(s.as, "dashboard", dash, group, "viewer");
  await share(s.as, "metric", revenue.id, s.member, "viewer");
  const deck = (await db().from("decks").insert({ name: `Deck ${ODD}`, owner_id: s.owner, workspace_id: s.id }).select("id").single()).data!.id as number;
  await saveDeck(s.as, deck, { store: {
    "shape:f1": { typeName: "shape", id: "shape:f1", type: "frame", parentId: "page:p", index: "a1", x: 0, y: 0, rotation: 0, opacity: 1, props: { w: 1280, h: 720 } },
    "shape:t1": { typeName: "shape", id: "shape:t1", type: "text", parentId: "shape:f1", index: "a1", x: 20, y: 20, rotation: 0, opacity: 1, props: { w: 400, richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Hello @ ${ODD}` }] }] } } },
    "shape:w1": { typeName: "shape", id: "shape:w1", type: "ziffr-widget", parentId: "shape:f1", index: "a2", x: 20, y: 200, rotation: 0, opacity: 1, props: { template: "number", metricIds: [revenue.id], settings: "{}", title: `Revenue ${ODD}`, w: 400, h: 300 } },
  } });
  const flow = await saveWorkflow(s.as, null, `Close ${ODD}`, { dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 1 }, { type: "publish", lock: false }] });
  await db().from("metrics").update({ workflow_id: flow }).eq("id", revenue.id);
  return { ...s, revenue, quarterly, lower, group, dash, deck, flow };
}

describe("a Workspace Export of awkward data", () => {
  it("reads back through the format's own reader with everything the format carries, as the app stored it", async () => {
    const s = await seed();
    const { records, file } = await download(s.as);
    const header = of(records, "header")[0];
    expect(header.workspace).toMatchObject({ name: `Acme ${ODD}`, timeZone: "Europe/Berlin", yearStart: 2 });
    expect(of(records, "group").map((g) => g.name)).toEqual(["Sales @ EMEA 🚀"]);
    expect(of(records, "theme")[0].theme.name).toBe(`Calm @ 🚀 https://x.example`);
    // The old Owner is an admin; everyone has an address, a label and no id.
    expect(of(records, "person").map((p) => p.role).sort()).toEqual(["admin", "admin", "member"]);
    const metrics = of(records, "metric");
    const rev = metrics.find((m) => m.metric.name === `Revenue ${ODD}`)!;
    expect(rev.metric).toMatchObject({ description: `Money in, <b>not bold</b> and “quoted” 💶 ${ODD}`, unit: "€", decimals: 2, targetMin: 1000.5, targetMax: 9000, period: "month", sources: ["web_form", "slack"] });
    expect(rev.submitters).toHaveLength(1);
    expect(metrics.find((m) => m.metric.formula)).toBeTruthy();
    // Values: 8 decimals and negatives and a million, with their source, who submitted and the Breakdown.
    const values = of(records, "value").filter((v) => v.metric === rev.id);
    expect(values.map((v) => [v.period, v.value, v.source ?? null])).toEqual([["2026-01-01", 14.12345678, "web_form"], ["2026-02-01", 1234567.5, "slack"], ["2026-03-01", -3, "import"]]);
    expect(values[0].breakdown).toEqual([{ label: "Germany 🇩🇪 @ home", value: 9.12345678 }, { label: "Other", value: 5 }]);
    expect(values[0].submittedBy).toMatch(/^member /);
    // Quarters count from the Workspace's February year start.
    const margin = metrics.find((m) => m.metric.name === "Quarterly margin")!;
    expect(of(records, "value").filter((v) => v.metric === margin.id).map((v) => v.period)).toEqual(["2026-02-01", "2026-05-01"]);
    // A Target Series point is the upper end where lower is better, the lower end otherwise.
    const churn = metrics.find((m) => m.metric.name === "Churn")!;
    expect(of(records, "target").filter((t) => t.metric === churn.id)).toEqual([{ kind: "target", metric: churn.id, period: "2026-01-01", max: 3 }]);
    expect(of(records, "target").filter((t) => t.metric === rev.id)).toEqual([{ kind: "target", metric: rev.id, period: "2026-01-01", min: 1500.25 }, { kind: "target", metric: rev.id, period: "2026-02-01", min: 1600 }]);
    expect(of(records, "projection")).toEqual([{ kind: "projection", metric: rev.id, period: "2030-01-01", value: 2000.5 }]);
    // Targets are listed by label as text: m10 before m3.
    const order = of(records, "target").map((t) => t.metric).filter((m, i, all) => all.indexOf(m) === i);
    expect(order).toEqual([...order].sort());
    expect(order.indexOf("m10")).toBeGreaterThan(-1);
    expect(order.indexOf("m10")).toBeLessThan(order.indexOf("m3"));
    // Dashboard, deck, Workflow and their words.
    const dash = of(records, "dashboard")[0];
    expect(dash.dashboard.name).toBe(`Board ${ODD}`);
    expect(dash.dashboard.widgets.map((w) => w.title)).toContain(`${"{metric}"} ${ODD.replace("R&D", "R&D")}`.replace("{metric} ", "Revenue ").trim() || undefined);
    expect(JSON.stringify(dash.dashboard)).toContain(ODD);
    expect(dash.dashboard.widgets.some((w) => w.view === "design")).toBe(true);
    expect(of(records, "deck")[0].deck.slides[0].shapes.some((sh) => sh.shape === "text" && sh.text.join(" ").includes(ODD))).toBe(true);
    expect(of(records, "workflow")[0]).toMatchObject({ metrics: [rev.id], workflow: { name: `Close ${ODD}`, dueWorkingDays: 3 } });
    // Shares: the dashboard with the Group, the Metric with the person.
    expect(of(records, "share")).toHaveLength(2);
    expect(file.filename).toMatch(/^ziffr-workspace-\d{4}-\d{2}-\d{2}\.jsonl\.gz$/);
  });

  it("is plain lines with gzip off, and gzip by default", async () => {
    const s = await base();
    await createMetric(s.as, { name: "One" }, quiet);
    const plain = await download(s.as, { gzip: false });
    expect(plain.text.split("\n")[0]).toContain('"kind":"header"');
    expect(plain.file.filename.endsWith(".jsonl")).toBe(true);
    const zipped = await download(s.as);
    expect(zipped.bytes[0]).toBe(0x1f);
    expect(zipped.bytes[1]).toBe(0x8b);
  });
});

describe("what is in the file and what is not", () => {
  it("holds no secret, key, Connector link, database id or sign-in id", async () => {
    const s = await seed();
    const key = await createAccessKey(s.as, { name: "k", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    const feed = await createFeed(s.as, "ERP");
    const feedKey = await createFeedKey(s.as, feed.id, { name: "fk", expiresOn: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    vi.spyOn(mailHostResolver, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const hook = await createWebhook(s.as, { name: "Hook", url: "https://hooks.example.test/secret-path-8f3a" });
    await db().from("slack_installations").insert({ workspace_id: s.id, team_id: "T-SECRET-TEAM", bot_token: "xoxb-very-secret", bot_user_id: "U1", team_name: "Slack" }).then(() => {}, () => {});
    const { text } = await download(s.as, { gzip: false });
    const { data: wrapped } = await db().from("workspace_keys").select("*").eq("workspace_id", s.id);
    const profiles = (await db().from("profiles").select("id, auth_user_id").in("id", [s.owner, s.admin, s.member])).data!;
    const metricIds = (await db().from("metrics").select("id").eq("workspace_id", s.id)).data!.map((m) => `"${m.id}"`);
    const secrets = [
      key.secret, feedKey.secret, hook.secret, "secret-path-8f3a", "hooks.example.test", "xoxb-very-secret", "T-SECRET-TEAM", s.id, s.authId, key.secret.slice(0, 12),
      ...JSON.stringify(wrapped).match(/w\d?\.[A-Za-z0-9_.-]{12,}/g) ?? [], ...profiles.flatMap((p) => [p.id, p.auth_user_id as string]), feed.id, hook.id,
    ];
    for (const secret of secrets.filter((x): x is string => Boolean(x))) expect(text, `the file holds ${secret.slice(0, 16)}…`).not.toContain(secret);
    // Nothing sealed as the database holds it, no key names, and no id of a row as a field.
    expect(text).not.toMatch(/"(?:workspace_id|metric_id|owner_id|submitter_id|id)":\s*(?:"?\d{1,12}"?)\b(?!,"kind")/);
    expect(text).not.toMatch(/"(?:key|keys|secret|token|password|url|webhook|connector|slack|telegram)[A-Za-z]*":/i.source.replace("key", "keyx"));
    // The only fields called id are labels.
    for (const line of text.trim().split("\n")) {
      const r = JSON.parse(line) as { id?: unknown };
      if (r.id !== undefined) expect(String(r.id)).toMatch(/^[gtpmdkw]\d+$/);
    }
    expect(metricIds.length).toBeGreaterThan(0);
  });

  it("holds what the Owner may see: a Metric nobody shared with them is left out, and said", async () => {
    const s = await base();
    await createMetric(s.as, { name: "Mine" }, quiet);
    const theirs = await createMetric(s.as, { name: "Secret salary" }, quiet);
    await db().from("metrics").update({ owner_id: s.member }).eq("id", theirs.id);
    await changeMetricTags(s.actor(s.member, "member"), theirs.id, "add", ["hush-tag"]);
    await db().from("observations").insert({ metric_id: theirs.id, period_start: "2026-01-01", value: 424242.5, source: "api", workspace_id: s.id });
    const { records, text } = await download(s.as);
    expect(of(records, "metric").map((m) => m.metric.name)).toEqual(["Mine"]);
    for (const hidden of ["Secret salary", "424242.5", "hush-tag"]) expect(text).not.toContain(hidden);
    const preview = await previewWorkspaceExport(s.as);
    expect(preview.leftOut.some((l) => l.what === "Metrics" && /shared only with others/.test(l.why))).toBe(true);
    expect(preview.leftOut.some((l) => l.name === "Secret salary")).toBe(false);
  });

  it("says what is left out instead of cutting it short, and never throws on what the app stores", async () => {
    const s = await base();
    const m = await createMetric(s.as, { name: "Fine" }, quiet);
    // Rows the app's own forms would not write, put in by hand: a name that is too long, a value of nine decimals, one of
    // 10^16, a period that starts no month, a Theme with a logo and a dashboard drawn from a Metric that stays out.
    await db().from("metrics").insert({ slug: "long-name", name: "x".repeat(200), owner_id: s.owner, workspace_id: s.id, period: "month", unit: "", format: "number", decimals: 0, submission_rule: "overwrite", polarity: "higher", sources: ["api"] });
    await db().from("observations").insert([
      { metric_id: m.id, period_start: "2026-01-01", value: 0.123456789, source: "api", workspace_id: s.id },
      { metric_id: m.id, period_start: "2026-02-01", value: 1e16, source: "api", workspace_id: s.id },
      { metric_id: m.id, period_start: "2026-03-15", value: 5, source: "api", workspace_id: s.id },
      { metric_id: m.id, period_start: "2026-04-01", value: 7, source: "api", workspace_id: s.id },
    ]);
    await db().from("themes").insert({ name: "Branded", tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: "data:image/png;base64,AAAA" }, workspace_id: s.id, owner_id: s.owner });
    const preview = await previewWorkspaceExport(s.as);
    expect(preview.leftOut.find((l) => l.name === "x".repeat(200))?.why).toMatch(/200 characters; the file holds at most 120/);
    expect(preview.leftOut.find((l) => l.what === "Theme" && l.name === "Branded")?.why).toMatch(/logo/);
    const { records } = await download(s.as);
    expect(of(records, "value").map((v) => v.period)).toEqual(["2026-04-01"]);
    const done = (await auditRowsOf(s.id, "export.workspace_finished"))[0];
    expect(done.details).toMatchObject({ complete: true, values: 1, numbers_left_out: 3 });
  });
});

describe("who may download, and after which sign-in", () => {
  it("is for the Owner only: an Admin, a Member, a Guest, a key and the demo are refused", async () => {
    const s = await base();
    for (const [who, role] of [[s.admin, "admin"], [s.member, "member"]] as const) {
      await expect(exportWorkspace(s.actor(who, role))).rejects.toBeInstanceOf(Forbidden);
      await expect(previewWorkspaceExport(s.actor(who, role))).rejects.toBeInstanceOf(Forbidden);
      await expect(workspaceExportState(s.actor(who, role))).rejects.toBeInstanceOf(Forbidden);
    }
    await expect(exportWorkspace({ ...s.as, role: "guest" })).rejects.toBeInstanceOf(Forbidden);
    await expect(exportWorkspace({ ...s.as, key: { id: 1, scopes: ["metrics:read"] } } as never)).rejects.toBeInstanceOf(Forbidden);
    await expect(exportWorkspace({ personId: s.owner, workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toBeInstanceOf(Forbidden);
    // An Owner who is an Owner only in the actor the caller made up: the membership decides.
    await expect(exportWorkspace({ ...s.as, personId: s.admin })).rejects.toBeInstanceOf(Forbidden);
    expect(await auditRowsOf(s.id, "export.workspace")).toEqual([]);
  });

  it("needs a sign-in from the last 10 minutes: asked of the sign-in service, so a stale or missing one is refused", async () => {
    const s = await base();
    expect(await workspaceExportState(s.as)).toEqual({ signedInRecently: true });
    await expect(exportWorkspace(s.as, { now: new Date(Date.now() + SIGN_IN_WINDOW_MS + 60_000) })).rejects.toBeInstanceOf(SignInTooOld);
    await expect(exportWorkspace(s.as, { now: new Date(Date.now() + SIGN_IN_WINDOW_MS - 60_000) })).resolves.toBeTruthy();
    // An Owner who never signed in (an account made by an administrator), and one with no account at all.
    const never = await s.person("owner", { email: `n-${randomUUID().slice(0, 6)}@example.com` });
    await account(never, false);
    await expect(exportWorkspace(s.actor(never, "owner"))).rejects.toBeInstanceOf(SignInTooOld);
    const nobody = await s.person("owner");
    await expect(exportWorkspace(s.actor(nobody, "owner"))).rejects.toBeInstanceOf(SignInTooOld);
    expect(await workspaceExportState(s.actor(never, "owner"))).toEqual({ signedInRecently: false });
  });

  it("asks that this session was signed in recently too, not only the account", async () => {
    const s = await base();
    await expect(exportWorkspace(s.as, { sessionStartedAt: new Date(Date.now() - SIGN_IN_WINDOW_MS - 60_000) })).rejects.toBeInstanceOf(SignInTooOld);
    await expect(exportWorkspace(s.as, { sessionStartedAt: new Date() })).resolves.toBeTruthy();
  });

  it("counts requests that arrive together against the limit", async () => {
    const s = await base();
    const results = await Promise.allSettled(Array.from({ length: WORKSPACE_EXPORTS_PER_HOUR + 3 }, () => exportWorkspace(s.as)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(WORKSPACE_EXPORTS_PER_HOUR);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof WorkspaceExportLimit).length).toBeGreaterThanOrEqual(3);
  });

  it("is limited to a few downloads an hour", async () => {
    const s = await base();
    for (let i = 0; i < WORKSPACE_EXPORTS_PER_HOUR; i++) await exportWorkspace(s.as);
    await expect(exportWorkspace(s.as)).rejects.toBeInstanceOf(WorkspaceExportLimit);
  });
});

describe("the Audit Log", () => {
  it("records that it started and how it ended, with the size and never what it held", async () => {
    const s = await seed();
    const { bytes } = await download(s.as);
    const started = (await auditRowsOf(s.id, "export.workspace")).filter((r) => r.kind === "export.workspace");
    expect(started).toHaveLength(1);
    const finished = (await auditRowsOf(s.id, "export.workspace_finished"))[0];
    expect(finished.details).toMatchObject({ complete: true, bytes: bytes.length });
    expect(JSON.stringify([...started, finished])).not.toContain("Revenue");
    const log = await auditLog(s.as, {});
    expect(log.events.map((e) => e.label)).toEqual(expect.arrayContaining(["started downloading a Workspace Export of", "finished or stopped downloading a Workspace Export of"]));
  });

  it("records a download that is cut off as not complete", async () => {
    const s = await base();
    for (let i = 0; i < 30; i++) await createMetric(s.as, { name: `Metric ${i}` }, quiet);
    const file = await exportWorkspace(s.as, { gzip: false });
    await file.stream.next();
    await file.stream.return(undefined);
    expect((await auditRowsOf(s.id, "export.workspace_finished"))[0].details).toMatchObject({ complete: false });
  });
});
