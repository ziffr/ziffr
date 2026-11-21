// The MCP server against the running app (spec 0002, ticket #52): an MCP client lists its tools and resources and
// calls each, through @ziffr/sdk, with a real Access Key.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { db } from "@ziffr/core/db";
import { createDashboard, placeWidget } from "@ziffr/core/dashboards";
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
      "list_actions", "list_alerts", "list_dashboards", "list_feeds", "list_metrics", "list_people", "list_projections", "list_snapshots", "list_submitters", "list_target_series", "list_templates", "list_workflows", "mark_task_done", "my_schedule", "period_status", "propose_share", "remove_widget", "reply_to_action", "restore_metric", "self_check", "set_action_status", "set_projections", "set_submitters", "set_target_series", "set_unusual_value_check",
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
    expect(json(await client.callTool({ name: "get_workspace", arguments: {} }))).toEqual({ workspace: { year_start_month: 1 } });
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
