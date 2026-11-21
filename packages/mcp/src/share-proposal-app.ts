// The in-chat preview of a Share Proposal (ticket #538, GLOSSARY: Share Proposal) as an MCP Apps UI resource: a page the
// assistant's chat shows inline for `propose_share`, so the person sees what would be shared, with whom and until when,
// before they open Ziffr. It is read-only and holds nothing to act with: its one button, "Confirm in Ziffr", opens the page
// in Ziffr where the person confirms with their own sign-in. Confirming is never possible from here or with the assistant's
// token. The page loads nothing from outside (its policy says so, and the host enforces it), draws every word with
// textContent, never as markup, and only opens an address on Ziffr's own origin that the tool's answer names. Hosts that
// do not show apps get the tool's text instead.

/** The address of the page's resource, which `propose_share` names in its metadata. */
export const SHARE_PROPOSAL_APP_URI = "ui://ziffr/share-proposal.html";

/** The MIME type MCP Apps hosts look for. */
export const MCP_APP_MIME = "text/html;profile=mcp-app";

/** Nothing may be fetched, framed or connected to: only this page's own inline style and script. */
export const SHARE_PROPOSAL_APP_META = { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } };

/** The page. The host sends the tool's structured answer after the handshake; it is the only input. */
export const SHARE_PROPOSAL_APP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Share Proposal</title>
<style>
:root { color-scheme: light dark; --ink: #1c1b19; --mute: #6b675f; --paper: #fbfaf7; --card: #fff; --rule: #dedad0; --accent: #1c1b19; }
@media (prefers-color-scheme: dark) { :root { --ink: #f2efe8; --mute: #a29d92; --paper: #1d1c1a; --card: #262523; --rule: #3a3834; --accent: #f2efe8; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: transparent; }
.note { color: var(--mute); font-size: 12px; margin: 0 0 8px; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 10px; }
.facts dt { color: var(--mute); } .facts dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.page { border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); padding: 12px; margin-bottom: 12px; }
.page h2 { margin: 0 0 4px; font-size: 16px; } .page p { margin: 0 0 8px; color: var(--mute); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.tile { border: 1px solid var(--rule); border-radius: 6px; background: var(--card); padding: 8px; font-size: 13px; }
.tile small { display: block; color: var(--mute); }
button { font: inherit; padding: 7px 12px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--paper); cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
</style></head><body>
<p id="waiting" class="note">Waiting for the proposal…</p>
<div id="view" hidden>
  <p class="note" id="lead"></p>
  <dl class="facts" id="facts"></dl>
  <div class="page" id="page"><h2 id="name"></h2><p id="intro"></p><div class="tiles" id="tiles"></div></div>
  <p class="note" id="after"></p>
  <button id="confirm" type="button">Confirm in Ziffr</button>
</div>
<script>
(function () {
  var parentWindow = window.parent, nextId = 1, link = null;
  function el(id) { return document.getElementById(id); }
  function add(parent, tag, text, cls) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; parent.appendChild(e); return e; }
  function send(msg) { parentWindow.postMessage(Object.assign({ jsonrpc: "2.0" }, msg), "*"); }
  function size() { send({ method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } }); }
  function show(data) {
    if (!data || typeof data !== "object" || !data.dashboard) return;
    var viewLink = data.how === "view_link";
    el("waiting").hidden = true; el("view").hidden = false;
    el("lead").textContent = "Prepared, not shared. Nothing is shared or sent until you confirm in Ziffr.";
    var facts = el("facts"); facts.textContent = "";
    function fact(k, v) { add(facts, "dt", k); add(facts, "dd", v); }
    fact("Share", String(data.dashboard.name));
    fact(viewLink ? "With" : "With (in Ziffr)", String(data.recipient));
    if (viewLink) { fact("How", data.live ? "View Link, live numbers" : "View Link, numbers kept as they are when you confirm"); fact("Works until", String(data.ends)); if (data.message) fact("Message", String(data.message)); }
    else fact("How", "Share, can look but not change");
    fact("Open until", String(data.expires).slice(0, 10));
    var p = data.preview || { name: data.dashboard.name, intro: "", widgets: [] };
    el("name").textContent = String(p.name || ""); el("intro").textContent = String(p.intro || "").slice(0, 400);
    var tiles = el("tiles"); tiles.textContent = "";
    (p.widgets || []).slice(0, 12).forEach(function (w) {
      var t = add(tiles, "div", String(w.title || (w.metrics && w.metrics[0]) || w.view || "Widget"), "tile");
      if (w.metrics && w.metrics.length) add(t, "small", w.metrics.slice(0, 3).join(", "));
    });
    el("after").textContent = viewLink ? "The numbers show when the page opens; the page in Ziffr shows exactly what the recipient will see." : "";
    try { var u = new URL(String(data.url)); link = (u.protocol === "https:" || u.protocol === "http:") ? u.href : null; } catch (e) { link = null; }
    el("confirm").disabled = !link;
    size();
  }
  el("confirm").addEventListener("click", function () {
    // The host opens the address in the person's browser, where they sign in to Ziffr and confirm there.
    if (link) send({ id: nextId++, method: "ui/open-link", params: { url: link } });
  });
  window.addEventListener("message", function (event) {
    // Only the host that embeds this page speaks to it.
    if (event.source !== parentWindow) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    // The handshake: once the host has answered ui/initialize, say the page is ready, and it sends the tool's answer.
    if (m.id === 1 && m.result) send({ method: "ui/notifications/initialized" });
    if (m.method === "ui/notifications/tool-result" && m.params) show(m.params.structuredContent);
  });
  send({ id: nextId++, method: "ui/initialize", params: { protocolVersion: "2026-01-26", appInfo: { name: "ziffr-share-proposal", version: "1.0.0" }, appCapabilities: {} } });
})();
</script></body></html>`;
