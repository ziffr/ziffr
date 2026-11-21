// The inline views (ticket #539): the shaping of each tool's answer into what the page draws, the pages themselves and
// their registration as MCP Apps resources, with the tools' text answers unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Ziffr } from "@ziffr/sdk";
import { createServer } from "../src/server.js";
import { VIEW_APPS, viewAppHtml } from "../src/views-app.js";
import { formatValue, periodName, shapeDashboard, shapeMetric, shapePeriodStatus } from "../src/view-shape.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const METRIC = { slug: "orders", name: "Orders", description: "Orders per week", period: "week", format: "number", unit: "", unit_position: "after", decimals: 0, polarity: "higher", target_min: 100, target_max: null };
const value = (period: string, v: number, state = "recorded") => ({ period, value: v, state });

describe("shapeMetric", () => {
  it("gives the latest value, the change, the Target Range, the points and the last periods, newest first", () => {
    const s = shapeMetric({ metric: METRIC, values: [value("2026-11-02", 80), value("2026-11-09", 100), value("2026-11-16", 1250, "locked")] })!;
    expect(s.latest).toEqual({ period: "Wk of 16 Nov", text: "1,250", state: "locked" });
    expect(s.change).toEqual({ text: "+1150.0 %", better: true });
    expect(s.target).toEqual({ text: "at least 100", status: "within" });
    expect(s.points).toEqual([80, 100, 1250]);
    expect(s.rows.map((r) => r.period)).toEqual(["Wk of 16 Nov", "Wk of 9 Nov", "Wk of 2 Nov"]);
  });
  it("says below, above and lower-is-better, shows a Condensed Value as its span, and cuts long words", () => {
    const lower = { ...METRIC, polarity: "lower", target_min: 10, target_max: 20, description: "x".repeat(900), name: "n".repeat(900) };
    const s = shapeMetric({ metric: lower, values: [{ ...value("2025-01-06", 5), condensed_from: 4, period_end: "2025-01-31" }, value("2026-01-01", 30)] })!;
    expect(s.target).toEqual({ text: "10 to 20", status: "above" });
    expect(s.rows[1].period).toBe("Jan 25\u2013Jan 25");
    expect(s.description).toHaveLength(300); expect(s.name).toHaveLength(200);
    expect(shapeMetric({ metric: { ...lower, target_min: 40 }, values: [value("2026-01-01", 30)] })!.target?.status).toBe("below");
    expect(shapeMetric({ metric: { ...METRIC, target_min: null, target_max: 9 }, values: [value("2026-01-01", 30)] })!.target).toEqual({ text: "at most 9", status: "above" });
  });
  it("copes with no values, a previous value of zero, a Metric without a target and answers it cannot read", () => {
    const none = shapeMetric({ metric: { ...METRIC, target_min: null }, values: [] })!;
    expect(none).toMatchObject({ latest: null, change: null, target: null, points: [], rows: [] });
    expect(shapeMetric({ metric: { ...METRIC, polarity: "target" }, values: [value("a", 0), value("b", 5)] })!.change).toBeNull();
    expect(shapeMetric({ metric: { ...METRIC, polarity: "target" }, values: [value("a", 2), value("b", 1)] })!.change).toMatchObject({ text: "\u221250.0 %", better: null });
    expect(shapeMetric({ metric: { ...METRIC, polarity: "lower" }, values: [value("a", 2), value("b", 1)] })!.change?.better).toBe(true);
    expect(shapeMetric({ metric: METRIC })).toBeNull();
    expect(shapeMetric(null)).toBeNull();
    expect(shapeMetric({ metric: { slug: "x" }, values: [] })).toBeNull();
  });
});

describe("order", () => {
  it("lists the last periods newest first by period start, whatever order the values came in", () => {
    const s = shapeMetric({ metric: { ...METRIC, period: "month" }, values: [value("2026-09-01", 2), value("2026-01-01", 1), value("2026-10-01", 3)] })!;
    expect(s.rows.map((r) => r.period)).toEqual(["Oct 26", "Sep 26", "Jan 26"]);
    expect(s.points).toEqual([1, 2, 3]);
    expect(s.latest?.period).toBe("Oct 26");
  });
});

describe("formatValue", () => {
  it("writes one style whatever the viewer's locale: unit on its side, the minus sign, and nothing for what is not a number", () => {
    expect(formatValue(11200, { decimals: 0, unit: "$", unit_position: "before", format: "currency" })).toBe("$11,200");
    expect(formatValue(12.5, { decimals: 1, unit: "%", unit_position: "after", format: "percent" })).toBe("12.5\u00a0%");
    expect(formatValue(-1200, { decimals: 0, unit: "EUR", unit_position: "after" })).toBe("\u22121,200\u00a0EUR");
    expect(formatValue(-0.2, { decimals: 0, unit: "" })).toBe("0");
    expect(formatValue(1, { decimals: 99, unit: "" })).toBe("1.000000");
    expect(formatValue(1, {})).toBe("1");
    expect(formatValue(Number.NaN, {})).toBe("");
  });
});

describe("periodName", () => {
  it("names a period from its first day by the Metric's period, in words that hold for any fiscal year", () => {
    expect(periodName("2026-10-01", "month")).toBe("Oct 26");
    expect(periodName("2026-11-16", "week")).toBe("Wk of 16 Nov");
    expect(periodName("2026-11-16", "day")).toBe("16 Nov");
    expect(periodName("2026-07-01", "quarter")).toBe("Jul\u2013Sep 26");
    expect(periodName("2026-11-01", "quarter")).toBe("Nov\u2013Jan 27");
    expect(periodName("2026-01-01", "year")).toBe("2026");
    expect(periodName("2026-04-01", "year")).toBe("Apr 26\u2013Mar 27");
    expect(periodName("2025-01-06", "week", "2025-02-02")).toBe("Jan 25\u2013Feb 25");
    expect(periodName("2025-01-06", "week", "later")).toBe("Jan 25");
    expect(periodName("nonsense", "month")).toBe("nonsense");
  });
});

describe("shapeDashboard", () => {
  const widgets = Array.from({ length: 30 }, (_, i) => ({ id: i, view: "number", title: i === 0 ? null : `W${i}`, metrics: ["a", "b", "c", "d"], x: 0, y: 0, w: 1, h: 1 }));
  it("gives a tile per widget, at most 24, with the introduction cut and the dashboard's own link", () => {
    const s = shapeDashboard({ dashboard: { id: 1, name: "Sales", role: "owner", url: "https://z.test/dashboards/1", intro: "i".repeat(900), widgets } })!;
    expect(s.tiles).toHaveLength(24); expect(s.more).toBe(6); expect(s.intro).toHaveLength(400);
    expect(s.tiles[0]).toEqual({ title: "a", view: "number", metrics: ["a", "b", "c"] });
    expect(s.link).toBe("https://z.test/dashboards/1");
  });
  it("names a Finding by its headline, falls back to the view, and refuses what it cannot read", () => {
    const s = shapeDashboard({ dashboard: { name: "S", widgets: [{ view: "story-line", words: { headline: "Up" } }, { view: "line" }, null] } })!;
    expect(s.tiles.map((t: { title: string }) => t.title)).toEqual(["Up", "line", "Widget"]);
    expect(s.tiles[1].metrics).toEqual([]); expect(s.link).toBeNull(); expect(s.intro).toBe("");
    expect(shapeDashboard({ dashboard: { name: "S" } })).toBeNull();
    expect(shapeDashboard(undefined)).toBeNull();
  });
});

describe("shapePeriodStatus", () => {
  const status = { workflow: { id: 3, name: "Weekly numbers" }, period: { start: "2026-11-16", name: "Week 47, 2026" }, in: 5, of: 6, published: 1, locked: 0, events: [{ day: "2026-11-16", time: "08:00", text: "Asked 6 people", items: ["Mia: Revenue"] }, { day: "2026-11-17", time: "09:00", text: "Published" }] };
  it("gives the count, the share in and the events in order", () => {
    const s = shapePeriodStatus(status)!;
    expect(s).toMatchObject({ title: "Weekly numbers, Week 47, 2026", count: "5 of 6 in", facts: "1 published, 0 locked" });
    expect(s.share).toBeCloseTo(5 / 6);
    expect(s.events).toEqual([{ when: "2026-11-16 08:00", text: "Asked 6 people", items: ["Mia: Revenue"] }, { when: "2026-11-17 09:00", text: "Published", items: [] }]);
    expect(shapePeriodStatus({ ...status, of: 0, in: 0 })!.share).toBe(0);
    expect(shapePeriodStatus({ ...status, in: 9 })!.share).toBe(1);
  });
  it("is nothing for the answer that only lists Workflows", () => {
    expect(shapePeriodStatus({ workflows: [] })).toBeNull();
    expect(shapePeriodStatus(null)).toBeNull();
  });
});

describe("the pages", () => {
  it.each(Object.keys(VIEW_APPS) as (keyof typeof VIEW_APPS)[])("%s loads nothing from outside, draws with textContent and its script parses", (kind) => {
    const html = viewAppHtml(kind);
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(|XMLHttpRequest|WebSocket|<script src|<link|https?:\/\/(?!www\.w3\.org\/2000\/svg)[a-z]/);
    // The shaping functions run in the page as written here: no helper from the build may leak into them.
    expect(html).not.toContain("__name");
    const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
    expect(() => new Function(script)).not.toThrow();
  });
  it("only the dashboard page can open a link, and never an unsafe one", () => {
    expect(viewAppHtml("dashboard")).toContain("ui/open-link");
    expect(viewAppHtml("metric")).not.toContain("Open in Ziffr");
    expect(viewAppHtml("dashboard")).toContain("!u.username && !u.password");
  });
});

const DASHBOARD = { id: 7, name: "Sales", role: "owner", url: "https://ziffr.test/dashboards/7", intro: "How we sell", widgets: [{ id: 1, view: "number", title: "Orders", metrics: ["orders"], x: 0, y: 0, w: 1, h: 1 }] };
async function connect() {
  const answer = (url: URL) => url.pathname.startsWith("/api/v1/dashboards/7") ? DASHBOARD : url.pathname.endsWith("/orders") ? METRIC : { items: [value("2026-11-16", 5)], next: null };
  const ziffr = new Ziffr({ url: "http://ziffr.test", accessKey: "zk_test", fetch: async (u) => Response.json(answer(new URL(String(u)))), maxRetries: 0 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ziffr).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  cleanups.push(() => client.close());
  return client;
}

describe("the server", () => {
  it("names each view's page on its tool, serves the pages as MCP Apps resources, and keeps the text answers", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools;
    for (const [tool, kind] of [["get_metric", "metric"], ["get_dashboard", "dashboard"], ["period_status", "period"]] as const) {
      expect(tools.find((t) => t.name === tool)?._meta, tool).toMatchObject({ ui: { resourceUri: VIEW_APPS[kind].uri }, "ui/resourceUri": VIEW_APPS[kind].uri });
      const page = await client.readResource({ uri: VIEW_APPS[kind].uri });
      const c = page.contents[0] as { mimeType: string; text: string; _meta?: { ui?: { csp?: unknown } } };
      expect(c.mimeType).toBe("text/html;profile=mcp-app");
      expect(c._meta?.ui?.csp).toEqual({ connectDomains: [], resourceDomains: [] });
      expect(c.text).toBe(viewAppHtml(kind));
    }
    // The text is what it always was, and the structured answer the pages read is the same data.
    const res = await client.callTool({ name: "get_dashboard", arguments: { id: 7 } });
    expect(JSON.parse((res.content as { text: string }[])[0].text)).toEqual({ dashboard: DASHBOARD });
    expect(res.structuredContent).toEqual({ dashboard: DASHBOARD });
  });
});
