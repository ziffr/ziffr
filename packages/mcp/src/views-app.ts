// The inline views of `get_metric`, `get_dashboard` and `period_status` (ticket #539) as MCP Apps UI resources, built like
// the Share Proposal preview (share-proposal-app.ts): read-only pages the assistant's chat shows beside the tool's text,
// which stays as it was for hosts without MCP Apps. Each page draws only the structured answer the host hands it after the
// handshake, shaped by view-shape.ts, so it shows nothing the tool did not already return for this key (Rule 3). It loads
// nothing from outside (its policy says so, and the host enforces it), draws every word with textContent, never as
// markup, and holds nothing to act with; the one link, "Open in Ziffr", only opens the dashboard's own address (https, or
// http on this computer) in the person's browser. Colours follow the host's theme variables, with light and dark fallbacks.
import { formatValue, periodName, shapeDashboard, shapeMetric, shapePeriodStatus } from "./view-shape.js";
import { SHARE_PROPOSAL_APP_META } from "./share-proposal-app.js";

/** Nothing may be fetched, framed or connected to: the same policy as the Share Proposal preview. */
export const VIEW_APP_META = SHARE_PROPOSAL_APP_META;

/** The three views: the address of the resource, the tool that names it, its title and what it draws. */
export const VIEW_APPS = {
  metric: { uri: "ui://ziffr/metric.html", resource: "metric_view", title: "Metric view", description: "The latest value, Target Range, a sparkline and the last periods of a Metric, shown in the chat for get_metric. Read-only." },
  dashboard: { uri: "ui://ziffr/dashboard.html", resource: "dashboard_view", title: "Dashboard view", description: "A dashboard's introduction and tiles, shown in the chat for get_dashboard. Read-only, with a link that opens it in Ziffr." },
  period: { uri: "ui://ziffr/period-status.html", resource: "period_status_view", title: "Period status view", description: "How a Workflow's period is going, shown in the chat for period_status: the count and the events in order. Read-only." },
} as const;

/** The tool's `_meta` that names its page, in both spellings MCP Apps hosts read. */
export const viewMeta = (kind: keyof typeof VIEW_APPS) => ({ ui: { resourceUri: VIEW_APPS[kind].uri }, "ui/resourceUri": VIEW_APPS[kind].uri });

const RENDER = {
  metric: `
    var s = shapeMetric(data); if (!s) return false;
    add(root, "h2", s.name, "name");
    if (s.latest) {
      var big = add(root, "div", s.latest.text, "big"); add(big, "small", s.latest.period);
      if (s.change) add(root, "div", s.change.text + " on the period before", "change " + (s.change.better === null ? "" : s.change.better ? "good" : "bad"));
    } else add(root, "p", "No values yet.", "note");
    if (s.target) add(root, "div", "Target Range: " + s.target.text + (s.target.status ? ", the latest is " + s.target.status : ""), "target " + (s.target.status === "within" ? "good" : s.target.status ? "bad" : ""));
    spark(root, s.points);
    if (s.rows.length) { var t = add(root, "table"); s.rows.forEach(function (r) { var tr = add(t, "tr"); add(tr, "td", r.period); var c = add(tr, "td", r.text, "num"); if (r.state !== "recorded") add(c, "small", r.state === "locked" ? "locked" : "awaiting approval"); }); }
    return true;`,
  dashboard: `
    var s = shapeDashboard(data); if (!s) return false;
    add(root, "h2", s.name, "name"); if (s.intro) add(root, "p", s.intro, "note");
    var tiles = add(root, "div", "", "tiles");
    s.tiles.forEach(function (t) { var e = add(tiles, "div", t.title, "tile"); add(e, "small", (t.view ? t.view + (t.metrics.length ? ": " : "") : "") + t.metrics.join(", ")); });
    if (s.more) add(root, "p", "and " + s.more + " more", "note");
    var u = safeLink(s.link); if (u) { var b = add(root, "button", "Open in Ziffr"); b.type = "button"; b.addEventListener("click", function () { send({ id: nextId++, method: "ui/open-link", params: { url: u } }); }); }
    return true;`,
  period: `
    var s = shapePeriodStatus(data); if (!s) return false;
    add(root, "h2", s.title, "name"); var big = add(root, "div", s.count, "big"); add(big, "small", s.facts);
    var bar = add(root, "div", "", "bar"); var fill = add(bar, "div", ""); fill.style.width = Math.round(s.share * 100) + "%";
    if (!s.events.length) add(root, "p", "Nothing has happened in this period yet.", "note");
    s.events.forEach(function (e) { var row = add(root, "div", "", "event"); add(row, "span", e.when, "when"); add(row, "span", e.text); if (e.items.length) add(row, "small", e.items.join("; ")); });
    return true;`,
};

/** Draws a sparkline: the points scaled into a small SVG line, with its last point marked. */
const SPARK = `
function spark(parent, points) {
  if (points.length < 2) return;
  var ns = "http://www.w3.org/2000/svg", W = 240, H = 48, lo = Math.min.apply(null, points), hi = Math.max.apply(null, points), r = hi - lo || 1;
  var xy = points.map(function (v, i) { return [(i / (points.length - 1)) * (W - 8) + 4, H - 4 - ((v - lo) / r) * (H - 8)]; });
  var svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "spark"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "The latest " + points.length + " values");
  var line = document.createElementNS(ns, "polyline"); line.setAttribute("points", xy.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ")); svg.appendChild(line);
  var dot = document.createElementNS(ns, "circle"); dot.setAttribute("cx", xy[xy.length - 1][0].toFixed(1)); dot.setAttribute("cy", xy[xy.length - 1][1].toFixed(1)); dot.setAttribute("r", "3"); svg.appendChild(dot);
  parent.appendChild(svg);
}`;

/** The page of one view. The host sends the tool's structured answer after the handshake; it is the only input. */
export function viewAppHtml(kind: keyof typeof VIEW_APPS): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${VIEW_APPS[kind].title}</title>
<style>
:root { color-scheme: light dark; --ink: #1c1b19; --mute: #6b675f; --card: #fff; --rule: #dedad0; --good: #1b7a3d; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --ink: #f2efe8; --mute: #a29d92; --card: #262523; --rule: #3a3834; --good: #5fcf80; --bad: #ff8a80; } }
:root[data-theme="light"] { color-scheme: light; --ink: #1c1b19; --mute: #6b675f; --card: #fff; --rule: #dedad0; --good: #1b7a3d; --bad: #b3261e; }
:root[data-theme="dark"] { color-scheme: dark; --ink: #f2efe8; --mute: #a29d92; --card: #262523; --rule: #3a3834; --good: #5fcf80; --bad: #ff8a80; }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; font: 14px/1.45 var(--font-sans, system-ui, sans-serif); color: var(--color-text-primary, var(--ink)); background: transparent; }
.note, small { color: var(--color-text-secondary, var(--mute)); font-size: 12px; } p.note { margin: 0 0 8px; }
.name { margin: 0 0 6px; font-size: 16px; } .big { font-size: 28px; font-weight: 600; line-height: 1.2; } .big small { display: block; font-weight: 400; }
.change, .target { font-size: 13px; margin-top: 2px; } .good { color: var(--good); } .bad { color: var(--bad); }
.spark { display: block; width: 100%; max-width: 240px; height: 48px; margin: 10px 0; fill: none; stroke: var(--color-text-secondary, var(--mute)); stroke-width: 1.5; } .spark circle { fill: var(--color-text-primary, var(--ink)); stroke: none; }
table { border-collapse: collapse; width: 100%; max-width: 320px; } td { padding: 2px 8px 2px 0; border-top: 1px solid var(--color-border-primary, var(--rule)); } td.num { text-align: right; font-variant-numeric: tabular-nums; } td.num small { display: block; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 8px 0; }
.tile { border: 1px solid var(--color-border-primary, var(--rule)); border-radius: 6px; background: var(--color-background-secondary, var(--card)); padding: 8px; font-size: 13px; overflow-wrap: anywhere; } .tile small { display: block; }
.bar { height: 8px; border-radius: 4px; background: var(--color-border-primary, var(--rule)); margin: 8px 0 10px; overflow: hidden; } .bar div { height: 100%; background: var(--good); }
.event { padding: 3px 0; border-top: 1px solid var(--color-border-primary, var(--rule)); font-size: 13px; } .event .when { color: var(--color-text-secondary, var(--mute)); margin-right: 8px; font-variant-numeric: tabular-nums; } .event small { display: block; }
button { font: inherit; margin-top: 4px; padding: 7px 12px; border-radius: 6px; border: 1px solid var(--color-text-primary, var(--ink)); background: transparent; color: inherit; cursor: pointer; }
</style></head><body>
<p id="waiting" class="note">Waiting for the answer…</p>
<div id="view" hidden></div>
<script>
${formatValue.toString()}
${periodName.toString()}
${shapeMetric.toString()}
${shapeDashboard.toString()}
${shapePeriodStatus.toString()}
${SPARK}
(function () {
  var parentWindow = window.parent, nextId = 1;
  function add(parent, tag, text, cls) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; }
  function send(msg) { parentWindow.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*"); }
  function size() { send({ method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }); }
  // Only a plain https address (or http on this computer) without credentials is ever opened, and only by the person's click.
  function safeLink(value) { try { var u = new URL(String(value)); var local = u.hostname === "localhost" || u.hostname === "127.0.0.1"; return ((u.protocol === "https:" || (u.protocol === "http:" && local)) && !u.username && !u.password) ? u.href : null; } catch (e) { return null; } }
  // The host's theme: its light or dark, and its colour and font variables, taken only as plain values.
  function theme(ctx) {
    if (!ctx) return;
    if (ctx.theme === "light" || ctx.theme === "dark") document.documentElement.setAttribute("data-theme", ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars && typeof vars === "object") Object.keys(vars).forEach(function (k) { var v = vars[k]; if (/^--[a-z0-9-]{1,60}$/.test(k) && typeof v === "string" && v.length < 200 && /^[#a-zA-Z0-9 .,%()'"\\/_-]+$/.test(v) && !/url|expression|var\\(/i.test(v)) document.documentElement.style.setProperty(k, v); });
  }
  function show(data) {
    var root = document.getElementById("view"); root.textContent = "";
    var ok = (function () {${RENDER[kind]}
    })();
    if (!ok) return;
    document.getElementById("waiting").hidden = true; root.hidden = false; size();
  }
  window.addEventListener("message", function (event) {
    // Only the host that embeds this page speaks to it.
    if (event.source !== parentWindow) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id === 1 && m.result) { theme(m.result.hostContext); send({ method: "ui/notifications/initialized" }); }
    if (m.method === "ui/notifications/host-context-changed" && m.params) theme(m.params);
    if (m.method === "ui/notifications/tool-result" && m.params) show(m.params.structuredContent);
  });
  send({ id: nextId++, method: "ui/initialize", params: { protocolVersion: "2026-01-26", appInfo: { name: "ziffr-${kind}-view", version: "1.0.0" }, appCapabilities: {} } });
})();
</script></body></html>`;
}
