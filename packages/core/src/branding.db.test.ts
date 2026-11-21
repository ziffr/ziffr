// Branding beyond the app, against the real database (ticket #542; GLOSSARY: Theme): a Workspace's default Theme
// dresses its emails (HTML beside the plain text, the logo attached), the form link and View Link pages, and Slack's
// side bar. Only the look leaves; nothing from a Theme can inject markup; a logo that is not a plain picture is refused.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { createDashboard, placeWidget } from "./dashboards";
import { openViewLink, createViewLink } from "./view-links";
import { submissionForm } from "./page-data";
import { workspaceLook } from "./workspace-look";
import { STARTER_THEME } from "./themes";
import { cleanSlides } from "./theme-tokens";
import { brandLogo } from "./brand-logo";
import { inviteByEmail } from "./invitations";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } delete process.env.ZIFFR_INBOUND_DOMAIN; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
// A 96 x 96 PNG: a made-up mark.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABQklEQVR42u3cwQ3DIBBFQbeUAlJ5iktqMOD8hR2kPVt6I3FafF2Lzuf9+naaK3m6xS6BInAQQ9AQgohBCOGCCIIFEYQKI4gUBBAoiCBMGEEUAH0BBAkjiAEAgAHQE0CIMIIIAAAYAABME4CZ849vAwAAAMBDgQAA2B9gJhIAAGcAjIYCAOAcgJFYAADsAXAHCgAAAAAeirAaAQCAvQBWIwAAsB/ASgQAAPYEWIUAAMC+ACsQAADoATBzjQFYcI8DAHAuwAwCAABnAIwiAABwDsAIAgAAZwHcRQAA4DyA9LIXAAAA2gOkt64BAKixHggAQG+A9CtMAABqrAcCANAbYAYBAAADAIABAMAA6ADg/9Hh+AAAABADQG8ACOH4AAAAgBCOD6FAfAAFACCE40MoEB9CgfggCoSHUCQ+jALRoTwT+wcITdS6TLg8PwAAAABJRU5ErkJggg==";
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A workspace with a default Theme whose accent is too pale to read on its surface, and a logo. */
async function branded(name: string, slides: Record<string, unknown> = {}) {
  const w = await workspace(name); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
  const { error } = await db().from("themes").insert({
    workspace_id: w.id, owner_id: sara, name: "Brand", is_default: true,
    tokens: { ...STARTER_THEME.tokens, accent: "#FFD166", surface: "#FFFFFF" },
    slides: { ...STARTER_THEME.slides, logo: PNG, logo_ratio: 1, footer: "Made with care", ...slides },
  });
  if (error) throw new Error(error.message);
  return { w, sara };
}

describe("the Theme outside the app", () => {
  it("reads the default Theme's look with a readable accent, and Ziffr's neutral look when there is no Theme", async () => {
    const { w } = await branded("Acme Co");
    const look = await workspaceLook(w.id);
    expect(look).toMatchObject({ name: "Acme Co", logo: PNG, footer: "Made with care" });
    // #FFD166 on white is about 1.4 : 1; the look keeps its hue but darkens it until it reads.
    expect(look.accent).not.toBe("#FFD166");
    const bare = await workspace("Plain"); cleanups.push(bare.cleanup);
    expect(await workspaceLook(bare.id)).toMatchObject({ name: "Plain", logo: null, footer: "" });
  });

  it("emails a Prompt in the Theme: HTML beside the plain text, the logo attached, names escaped", async () => {
    const { w, sara } = await branded("<b>Acme</b> & Sons");
    const ann = await w.person("member", { email: `ann-${randomUUID().slice(0, 8)}@example.test` });
    const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "mail"] });
    await w.token(m.id, ann);
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toBeTruthy();
    const to = (await db().from("profiles").select("email").eq("id", ann).single()).data!.email;
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
    expect(messages).toHaveLength(1);
    const mail = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string; HTML: string; Inline: { ContentID: string; ContentType: string }[] };
    // The plain text is kept; the HTML says the same, with the link, the footer and the logo by content id.
    expect(mail.Text).toMatch(/https:\/\/ziffr\.example\.test\/submit\/tk-/);
    expect(mail.HTML).toMatch(/href="https:\/\/ziffr\.example\.test\/submit\/tk-/);
    expect(mail.HTML).toContain("Made with care");
    expect(mail.HTML).toContain("cid:ziffr-logo");
    expect(mail.HTML).toContain("prefers-color-scheme: dark");
    expect(mail.Inline).toMatchObject([{ ContentID: "ziffr-logo", ContentType: "image/png" }]);
    // The Workspace's name is words people chose: it is escaped wherever it is drawn.
    expect(mail.HTML).not.toContain("<b>Acme</b>");
    expect(mail.HTML).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Sons");
  });

  it("shows the Workspace's name instead of a logo an email client cannot draw", async () => {
    const svg = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>').toString("base64");
    const { w, sara } = await branded("Vector Ltd", { logo: svg });
    const ann = await w.person("member", { email: `ann-${randomUUID().slice(0, 8)}@example.test` });
    const m = await w.metric(sara, { name: "Visits", sources: ["web_form", "mail"] });
    await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const to = (await db().from("profiles").select("email").eq("id", ann).single()).data!.email;
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
    const mail = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { HTML: string; Inline: unknown[] };
    expect(mail.HTML).not.toContain("cid:ziffr-logo");
    expect(mail.HTML).toContain("Vector Ltd");
    expect(mail.Inline).toHaveLength(0);
  });

  it("gives the form link page only the look, and a View Link only the Workspace's name beside its Themes", async () => {
    const { w, sara } = await branded("Acme Co");
    const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Field visits" });
    const t = await w.token(m.id, ann);
    const form = await submissionForm(t);
    // The logo goes as a cacheable address, not inline, and the address serves exactly that picture.
    const [, , , , wsId, hash] = form!.look.logo!.split("/");
    expect(form!.look.logo).toMatch(/^\/api\/brand\/logo\/[0-9a-f-]{36}\/[0-9a-f]{16}$/);
    expect(form!.look.name).toBe("Acme Co");
    expect((await brandLogo(wsId, hash))!.contentType).toBe("image/png");
    expect(await brandLogo(wsId, "0".repeat(16))).toBeNull();
    expect(await brandLogo("not-a-uuid", hash)).toBeNull();
    const other = await workspace("Other"); cleanups.push(other.cleanup);
    expect(await brandLogo(other.id, hash)).toBeNull();
    // Not the Theme row: no data colours, no stored ids, nothing but what draws the page.
    expect(Object.keys(form!.look).sort()).toEqual(["accent", "canvas", "fontBody", "fontHeading", "footer", "ink", "logo", "logoRatio", "logoWidth", "muted", "name", "rule", "surface"]);
    const d = await createDashboard(w.actor(sara), "Board");
    await placeWidget(w.actor(sara), d, { type: "metric", id: m.id });
    const link = await createViewLink(w.actor(sara), "dashboard", d, { label: "", expires: inDays(5), frozen: false });
    const frozen = await createViewLink(w.actor(sara), "dashboard", d, { label: "", expires: inDays(5), frozen: true });
    expect((await openViewLink(link))!.workspaceName).toBe("Acme Co");
    expect((await openViewLink(frozen))!.workspaceName).toBe("Acme Co");
    expect(await openViewLink("x".repeat(30))).toBeNull();
  });

  it("sends invitations from \"<Workspace> via Ziffr\" and always names who is really behind them", async () => {
    const { w, sara } = await branded("Acme Co");
    await db().from("profiles").update({ email: "sara@example.test" }).eq("id", sara);
    const to = `new-${randomUUID().slice(0, 8)}@example.test`;
    await inviteByEmail(w.actor(sara), { email: to, role: "member" });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
    const mail = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string; HTML: string; From: { Name: string; Address: string } };
    expect(mail.From).toMatchObject({ Name: "Acme Co via Ziffr", Address: "ziffr@example.test" });
    for (const body of [mail.Text, mail.HTML]) expect(body).toMatch(/Sent by Ziffr for owner \w+ \(sara@example\.test\), who invited you to Acme Co\./);
  });

  it("refuses an SVG logo that holds a script, a handler or a link out, and keeps a plain one", () => {
    const b64 = (s: string) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
    const slides = (logo: string) => cleanSlides({ ...STARTER_THEME.slides, logo }).logo;
    expect(slides(b64('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'))).not.toBeNull();
    for (const bad of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
      "<html><body>not an svg</body></html>",
    ]) expect(slides(b64(bad))).toBeNull();
    expect(slides("data:image/png;base64,AAAA")).toBeNull();
    expect(slides(PNG)).toBe(PNG);
    expect(slides("https://evil.example/logo.png")).toBeNull();
  });
});
