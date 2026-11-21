// The MCP server against the running app (spec 0002, ticket #52): an MCP client lists its tools and resources and
// calls each, through @ziffr/sdk, with a real Access Key.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { db } from "@ziffr/core/db";
import { createDashboard, placeWidget } from "@ziffr/core/dashboards";
import { saveWorkflow } from "@ziffr/core/workflows";
import { rowsOf, workspace } from "@ziffr/core/test/db-fixtures";
import { Ziffr } from "@ziffr/sdk";
import { createServer } from "../src/server.js";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const json = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

async function connect(scopes: Scope[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const sara = await w.person("owner");
  const orders = await w.metric(ben, { name: "Orders", description: "Orders a month" }); await w.token(orders.id, ben);
  const hidden = await w.metric(sara, { name: "Payroll" });
  await db().from("observations").insert([{ metric_id: orders.id, period_start: "2026-01-01", value: 3, source: "api", workspace_id: w.id }]);
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(new Ziffr({ url: URL, accessKey: secret })).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  cleanups.push(() => client.close());
  return { client, ben, orders, hidden, w };
}

describe("@ziffr/mcp against the app", () => {
  it("offers its tools and calls them through the API", async () => {
    const { client, ben, orders, hidden } = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "add_finding", "add_widget", "archive_metric", "create_alert", "create_dashboard", "create_dashboard_from_template", "create_metric", "create_workflow", "delete_alert", "delete_metric", "delete_workflow", "find", "get_dashboard", "get_metric", "get_snapshot", "get_thread", "get_unusual_value_check", "get_workflow", "get_workspace",
      "list_actions", "list_alerts", "list_dashboards", "list_feeds", "list_metrics", "list_people", "list_projections", "list_snapshots", "list_submitters", "list_target_series", "list_templates", "list_workflows", "mark_task_done", "my_schedule", "period_status", "propose_share", "remove_widget", "reply_to_action", "restore_metric", "self_check", "set_action_status", "set_metric_workflow", "set_projections", "set_submitters", "set_target_series", "set_unusual_value_check",
      "submit_value", "take_snapshot", "update_alert", "update_dashboard", "update_finding", "update_metric", "update_widget", "update_workflow",
    ]);
    // Deleting cannot be undone: assistants are told so, and to confirm with the person first.
    expect(tools.find((t) => t.name === "delete_metric")?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    const metrics = json(await client.callTool({ name: "list_metrics", arguments: {} })).metrics;
    expect(metrics.map((m: { slug: string }) => m.slug)).toEqual([orders.slug]);
    expect(JSON.stringify(metrics)).not.toContain(hidden.slug);
    const got = json(await client.callTool({ name: "get_metric", arguments: { slug: orders.slug, from: "2026-01-01" } }));
    expect(got).toMatchObject({ metric: { slug: orders.slug, name: "Orders" }, values: [{ period: "2026-01-01", value: 3 }] });
    expect(got.values[0]).toMatchObject({ has_thread: false, source: expect.any(String) });
    expect(json(await client.callTool({ name: "get_thread", arguments: { slug: orders.slug, period: "2026-01-01" } }))).toEqual({ metric: orders.slug, period: "2026-01-01", threads: [] });
    expect((await client.callTool({ name: "get_thread", arguments: { slug: hidden.slug, period: "2026-01-01" } })).isError).toBe(true);
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 42, period: "2026-02-01" } }))).toMatchObject({ status: "recorded", value: 42 });
    // find turns words into a slug and a period, and never names a Metric the key's creator does not see.
    const found = json(await client.callTool({ name: "find", arguments: { words: "orders january 2026" } })).found;
    expect(found[0]).toEqual({ slug: orders.slug, name: "Orders", archived: false, period: "2026-01-01", period_label: "January 2026" });
    expect(json(await client.callTool({ name: "find", arguments: { words: "payroll" } })).found).toEqual([]);
    const people = json(await client.callTool({ name: "list_people", arguments: {} })).people;
    expect(people).toHaveLength(2);
    expect(people).toContainEqual({ id: ben, name: expect.any(String), contact: false });
    expect(json(await client.callTool({ name: "get_workspace", arguments: {} }))).toEqual({ workspace: { year_start_month: 1, number_style: "1,234.5", time_zone: "UTC", run_hour: 8, week_start: "monday", reached_by: ["email"] } });
    // Orders is new: no period of it ended yet, so nothing is due.
    const schedule = await client.callTool({ name: "my_schedule", arguments: {} });
    expect(schedule.isError).toBeFalsy();
    expect(schedule.structuredContent).toMatchObject({ today: expect.any(String), overdue: [], undated: [] });
  });
  it("creates a Metric and submits its first value", async () => {
    const { client } = await connect(["metrics:read", "values:submit", "metrics:write"]);
    const created = json(await client.callTool({ name: "create_metric", arguments: { name: "Weekly signups", period: "week", submit: true } })).metric;
    expect(created).toMatchObject({ slug: "weekly-signups", period: "week" });
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: created.slug, value: 9 } }))).toMatchObject({ status: "recorded", value: 9 });
    const refused = await (await connect()).client.callTool({ name: "create_metric", arguments: { name: "X" } });
    expect(refused.isError).toBe(true);
    // A quarterly Metric takes a value for a quarter's first day.
    const nps = json(await client.callTool({ name: "create_metric", arguments: { name: "Quarterly NPS", period: "quarter", submit: true } })).metric;
    expect(nps).toMatchObject({ period: "quarter" });
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: nps.slug, value: 41, period: "2026-07-01" } }))).toMatchObject({ status: "recorded", period: "2026-07-01" });
  });
  it("changes everything about a Metric and sets its schedule (ticket #612)", async () => {
    const { client, ben, w } = await connect(["metrics:read", "values:submit", "metrics:write", "metrics:edit"]);
    const daily = await saveWorkflow(w.actor(ben, "member"), null, "Ask me each day", { dueWorkingDays: 1, steps: [{ type: "publish", lock: false }] });
    // A Metric made here takes values here: leaving api out of the sources does not turn it off, unless asked for.
    const calls = json(await client.callTool({ name: "create_metric", arguments: { name: "Calls", period: "week", submit: true, sources: ["web_form", "mail"], workflow: "Ask me each day" } })).metric;
    expect(calls.sources).toEqual(["web_form", "mail", "api"]);
    expect(calls.workflow).toEqual({ id: daily, name: "Ask me each day", yours: true });
    expect(calls.next_due).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(json(await client.callTool({ name: "get_metric", arguments: { slug: calls.slug } })).metric).toMatchObject({ workflow: { name: "Ask me each day" }, next_due: calls.next_due });
    const noApi = json(await client.callTool({ name: "create_metric", arguments: { name: "Forms only", submit: true, sources: ["web_form"], exclude_api: true } })).metric;
    expect(noApi.sources).toEqual(["web_form"]);
    // The refusal says which Sources the Metric takes and how to change them; update_metric then turns the API on.
    const refused = await client.callTool({ name: "submit_value", arguments: { slug: noApi.slug, value: 1 } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/accepts values from: Web form.*update_metric/);
    const changed = json(await client.callTool({ name: "update_metric", arguments: { slug: noApi.slug, name: "Forms and API", description: "Count of forms", unit: "forms", format: "number", period: "week", submission_rule: "add", sources: ["web_form", "api"] } })).metric;
    expect(changed).toMatchObject({ slug: noApi.slug, name: "Forms and API", description: "Count of forms", unit: "forms", period: "week", sources: ["web_form", "api"] });
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: noApi.slug, value: 4 } }))).toMatchObject({ status: "recorded" });
    // Once there are values, the period stays.
    const stuck = await client.callTool({ name: "update_metric", arguments: { slug: noApi.slug, period: "month" } });
    expect(stuck.isError).toBe(true);
    expect(JSON.stringify(stuck.content)).toMatch(/cannot change once the Metric has values/);
    // The schedule: given, shown, taken away; a Workflow that is not the user's own is refused.
    expect(json(await client.callTool({ name: "set_metric_workflow", arguments: { slug: noApi.slug, workflow: daily } })).metric).toMatchObject({ workflow: { id: daily } });
    expect(json(await client.callTool({ name: "set_metric_workflow", arguments: { slug: noApi.slug, workflow: null } })).metric).toMatchObject({ workflow: null, next_due: null });
    expect((await client.callTool({ name: "set_metric_workflow", arguments: { slug: noApi.slug, workflow: "Nobody's" } })).isError).toBe(true);
    // Reading keys cannot change a thing.
    const reading = (await connect(["metrics:read"])).client;
    expect((await reading.callTool({ name: "update_metric", arguments: { slug: calls.slug, name: "x" } })).isError).toBe(true);
    expect((await reading.callTool({ name: "set_metric_workflow", arguments: { slug: calls.slug, workflow: null } })).isError).toBe(true);
  });
  it("does the whole job in one call for someone who knows nothing about Ziffr (ticket #614)", async () => {
    const { client, w } = await connect(["metrics:read", "values:submit", "metrics:write", "metrics:edit", "workflows:write"]);
    const ws = json(await client.callTool({ name: "get_workspace", arguments: {} })).workspace;
    expect(ws).toMatchObject({ time_zone: "UTC", run_hour: 8, week_start: "monday", reached_by: ["email"] });
    // "Ask me every weekday at 1 pm for the kilometres": one call makes the Metric, its schedule, the person as submitter and the first value.
    const made = json(await client.callTool({ name: "create_metric", arguments: { name: "Kilometres", unit: "km", period: "day", description: "Kilometres driven each day.", schedule: { hour: 13, days: "weekdays" }, first_value: { value: 42 } } }));
    expect(made.url).toMatch(/\/metrics\/kilometres$/);
    expect(made.metric).toMatchObject({ workflow: { name: "Ask me every weekday at 13:00" }, sources: expect.arrayContaining(["api"]) });
    expect(made.next_ask).toMatch(/^You are asked next on \w+day, \d+ \w+ \d{4} at 13:00 \(UTC\)\.$/);
    expect(made.defaults_used.join(" ")).toMatch(/You are the one asked.*Higher is better/);
    expect(made.first_value).toMatchObject({ recorded: true, status: "recorded", value: 42 });
    // The same schedule is used again, not made twice; the Workflow lists the Metrics it asks for.
    const again = json(await client.callTool({ name: "create_metric", arguments: { name: "Steps", period: "day", schedule: { hour: 13, days: "weekdays" } } }));
    expect(again.defaults_used.join(" ")).toMatch(/one you already had/);
    const flows = json(await client.callTool({ name: "list_workflows", arguments: {} }));
    expect(flows.workflows.filter((f: { name: string }) => f.name === "Ask me every weekday at 13:00")).toHaveLength(1);
    const detail = json(await client.callTool({ name: "get_workflow", arguments: { id: made.metric.workflow.id } })).workflow;
    expect(detail.used_by.map((m: { name: string }) => m.name).sort()).toEqual(["Kilometres", "Steps"]);
    expect(detail.asking).toEqual({ hour: 13, days: { kind: "weekdays" } });
    // A colleague's Workflow of the same name is not the user's: it neither blocks the schedule nor is reused.
    const sara = await w.person("owner");
    await saveWorkflow(w.actor(sara, "owner"), null, "Ask me every Monday at 09:00", { dueWorkingDays: 0, steps: [{ type: "publish", lock: false }] });
    const monday = json(await client.callTool({ name: "create_metric", arguments: { name: "Weekly look", period: "week", schedule: { hour: 9, days: [1] } } }));
    expect(monday.metric.workflow).toMatchObject({ name: "Ask me every Monday at 09:00", yours: true });
    // A Metric the key may not create leaves no schedule behind.
    const before = json(await client.callTool({ name: "list_workflows", arguments: {} })).workflows.length;
    const writer = (await connect(["metrics:read", "workflows:write"])).client;
    expect((await writer.callTool({ name: "create_metric", arguments: { name: "No right", schedule: { hour: 7 } } })).isError).toBe(true);
    expect((await writer.callTool({ name: "list_workflows", arguments: {} }).then(json)).workflows.filter((f: { name: string }) => f.name.includes("07:00"))).toEqual([]);
    expect(json(await client.callTool({ name: "list_workflows", arguments: {} })).workflows.length).toBe(before);
    // A first value that cannot be recorded does not undo the Metric: the answer says why.
    const stuck = json(await client.callTool({ name: "create_metric", arguments: { name: "Odd", first_value: { value: 1, period: "2999-01-01" } } }));
    expect(stuck.first_value).toMatchObject({ recorded: false, reason: expect.any(String) });
    expect(stuck.url).toBeTruthy();
  });
  it("makes kilometres per day from an odometer with a formula, in plain steps (ticket #619)", async () => {
    const { client } = await connect(["metrics:read", "values:submit", "metrics:write"]);
    const odo = json(await client.callTool({ name: "create_metric", arguments: { name: "Odometer", unit: "km", period: "week", aggregation: "last", first_value: { value: 13573, period: "2026-11-02" } } }));
    expect(odo.first_value).toMatchObject({ recorded: true, value: 13573 });
    await client.callTool({ name: "submit_value", arguments: { slug: odo.metric.slug, value: 13650, period: "2026-11-09" } });
    const made = json(await client.callTool({ name: "create_metric", arguments: { name: "Kilometres per day", unit: "km per day", formula: `change({${odo.metric.slug}}) / 7`, decimals: 1 } }));
    expect(made.metric).toMatchObject({ derived: true, period: "week", unit: "km per day", decimals: 1, formula: `change({${odo.metric.slug}}) / 7`, sources: [] });
    expect(made.next_ask).toBeNull();
    expect(made.url).toMatch(/\/metrics\/kilometres-per-day$/);
    expect(made.defaults_used.join(" ")).toMatch(/Counted by week.*Nobody is asked/);
    // 77 km since the week before, over 7 days: the first reading has no change yet.
    expect(json(await client.callTool({ name: "get_metric", arguments: { slug: made.metric.slug, from: "2026-11-01" } })).values).toEqual([expect.objectContaining({ period: "2026-11-09", value: 11 })]);
    // What a calculated Metric does not take is said in words the assistant can act on; a formula over a Metric that is not there is refused.
    const misplaced = await client.callTool({ name: "create_metric", arguments: { name: "Odd", formula: `{${odo.metric.slug}} * 2`, submit: true, schedule: { hour: 9 } } });
    expect(misplaced.isError).toBe(true);
    expect(JSON.stringify(misplaced.content)).toMatch(/leave out submit, schedule/);
    const missing = await client.callTool({ name: "create_metric", arguments: { name: "Odd", formula: "{nonesuch} * 2" } });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toMatch(/not a Metric of this Workspace/);
  });
  it("makes a dashboard from a template and writes one up with Findings (spec 0014, spec 0013)", async () => {
    const { client, orders } = await connect(["metrics:read", "dashboards:read", "dashboards:write"]);
    const templates = json(await client.callTool({ name: "list_templates", arguments: { kind: "dashboard" } })).templates;
    expect(templates.map((t: { id: string }) => t.id)).toContain("deep-dive");
    const made = json(await client.callTool({ name: "create_dashboard_from_template", arguments: { template: "deep-dive", name: "Orders in depth", fills: [[orders.slug]] } })).dashboard;
    expect(made).toMatchObject({ name: "Orders in depth", role: "owner", url: expect.stringContaining(`/dashboards/${made.id}`) });
    expect(made.widgets.every((w: { metrics: string[] }) => w.metrics[0] === orders.slug)).toBe(true);
    const written = json(await client.callTool({ name: "create_dashboard", arguments: { name: "Why orders grew", intro: "A first draft." } })).dashboard;
    expect(written).toMatchObject({ intro: "A first draft.", url: expect.stringContaining(`/dashboards/${written.id}`) });
    const finding = json(await client.callTool({ name: "add_finding", arguments: { dashboard_id: written.id, metric: orders.slug, headline: "{metric} grew" } })).finding;
    expect(finding.words.headline).toBe("{metric} grew");
    expect(json(await client.callTool({ name: "update_dashboard", arguments: { dashboard_id: written.id, intro: "Orders grew in March." } })).dashboard.intro).toBe("Orders grew in March.");
    // A key without dashboards:write is refused as a tool error.
    const refused = await (await connect(["metrics:read", "dashboards:read"])).client.callTool({ name: "create_dashboard", arguments: { name: "X" } });
    expect(refused.isError).toBe(true);
  });
  it("lists each visible Metric as a resource and reads it", async () => {
    const { client, orders } = await connect();
    const { resources } = await client.listResources();
    expect(resources.filter((r) => r.uri.startsWith("ziffr://metrics/"))).toEqual([expect.objectContaining({ uri: `ziffr://metrics/${orders.slug}`, name: "Orders" })]);
    const read = await client.readResource({ uri: `ziffr://metrics/${orders.slug}` });
    expect(JSON.parse(String((read.contents[0] as { text: string }).text))).toMatchObject({ metric: { slug: orders.slug }, values: [{ value: 3 }] });
  });
  it("reports what the key may not do as a tool error, not a failure", async () => {
    const { client, orders, hidden } = await connect(["metrics:read"]);
    const refused = await client.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 1 } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/forbidden/);
    expect((await client.callTool({ name: "get_metric", arguments: { slug: hidden.slug } })).isError).toBe(true);
  });
  it("proposes a share, shows it in the chat as an app, and can never confirm it (ticket #538)", async () => {
    const { client, ben, orders, w } = await connect(["metrics:read", "dashboards:read", "shares:propose"]);
    const tools = (await client.listTools()).tools;
    const propose = tools.find((t) => t.name === "propose_share");
    // The tool names its preview page (MCP Apps), and no tool confirms, declines or makes a View Link.
    expect(propose?._meta).toMatchObject({ ui: { resourceUri: "ui://ziffr/share-proposal.html" } });
    expect(tools.map((t) => t.name).filter((n) => /confirm|decline|view_link|share/.test(n))).toEqual(["propose_share"]);
    const page = await client.readResource({ uri: "ui://ziffr/share-proposal.html" });
    const html = page.contents[0] as { mimeType: string; text: string; _meta?: { ui?: { csp?: unknown } } };
    expect(html.mimeType).toBe("text/html;profile=mcp-app");
    expect(html._meta?.ui?.csp).toEqual({ connectDomains: [], resourceDomains: [] });
    expect(html.text).toContain("Confirm in Ziffr");
    expect(html.text).not.toMatch(/innerHTML|<script src|https?:\/\/[a-z]/);
    // Proposing: text for every host, structured content for the page; nothing is shared.
    const dash = await createDashboard(w.actor(ben, "member"), "Orders, last 4 weeks");
    await placeWidget(w.actor(ben, "member"), dash, { type: "metric", id: orders.id });
    const made = await client.callTool({ name: "propose_share", arguments: { dashboard_id: dash, email: "jenny@example.test", ends: inDays(14), message: "Here you go." } });
    expect(made.isError, JSON.stringify(made.content)).toBeFalsy();
    expect((made.content as { text: string }[])[0].text).toMatch(/Prepared, not shared[^]*Nothing was shared or sent[^]*\/actions\/share\/\d+/);
    expect(made.structuredContent).toMatchObject({ status: "open", how: "view_link", recipient: "jenny@example.test", dashboard: { id: dash, name: "Orders, last 4 weeks" } });
    expect(await rowsOf("view_links", { created_by: ben })).toEqual([]);
  });
  it("refuses to propose without the scope", async () => {
    const { client } = await connect(["metrics:read", "dashboards:read"]);
    expect((await client.callTool({ name: "propose_share", arguments: { dashboard_id: 1, email: "a@example.test", ends: inDays(3) } })).isError).toBe(true);
  });
});
