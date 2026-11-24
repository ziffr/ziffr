// @vitest-environment node
// Ways in and out, the step as a person sees it (spec 0052, ticket 8; GLOSSARY: Setup Guide, Connector, Test Message):
// each state of a self-hosted Installation shows the right card, the right button and the right words, and a Member is
// never offered something that sets up the Workspace. The cards come from the core's `wayCards`, tried on its own.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("@/app/connector-actions", () => ({ sendTestMessage: async () => ({}), setTelegram: async () => ({}), slackLinkCode: async () => ({}), telegramLinkStart: async () => ({}) }));
vi.mock("./ways-actions", () => ({ connectSlackFromGuide: async () => ({}), saveAskMeBy: async () => ({}) }));
vi.mock("./actions", () => ({ skipStep: async () => ({}) }));
import { askableWays, wayCards, type WaysInAndOut } from "@ziffr/core/ways-in-and-out";
import { WAYS, type Way, type WayState } from "@ziffr/core/what-works-here";
import { WaysInAndOutStep } from "./ways";

type Facts = { mail: "none" | "send" | "both"; slack: "no-app" | "not-connected" | "connected"; telegram: "no-bot" | "off" | "on" };
const s = (way: Way, state: WayState["state"], reason = "x"): WayState => ({ way, label: way, state, reason, limit: null });
const states = (f: Facts): WayState[] => [
  f.mail === "none" ? s("email", "simulated") : s("email", "real"), f.mail === "both" ? s("email-replies", "real") : s("email-replies", "off"),
  f.slack === "no-app" ? s("slack", "simulated") : f.slack === "connected" ? s("slack", "real") : s("slack", "off"),
  f.telegram === "no-bot" ? s("telegram", "simulated") : f.telegram === "on" ? s("telegram", "real") : s("telegram", "off"),
  ...WAYS.filter((w) => !["email", "email-replies", "slack", "telegram"].includes(w)).map((w) => s(w, "real")),
];
type Over = { role?: "owner" | "member"; installationAdmin?: boolean; telegramLinked?: boolean; askedBy?: ("email" | "slack" | "telegram")[] };
function data(f: Facts, over: Over = {}): WaysInAndOut {
  const ways = states(f);
  const role = over.role ?? "owner";
  return {
    cards: wayCards({ ways, role, installationAdmin: over.installationAdmin ?? false, slackLink: null, telegramLinked: over.telegramLinked ?? false }),
    askedBy: over.askedBy ?? [], askable: askableWays(ways), manages: role === "owner",
    more: role === "owner" ? [{ label: "A program", href: "/settings/keys", what: "Access Keys" }] : [],
  };
}
const html = (d: WaysInAndOut, notice: string | null = null) => renderToStaticMarkup(<WaysInAndOutStep data={d} following="first_metric" notice={notice} />).replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

describe("nothing set up on the Installation", () => {
  const f: Facts = { mail: "none", slack: "no-app", telegram: "no-bot" };
  it("says in words what is missing, with no button for a way that cannot work, and leaves the form and paste", () => {
    const h = html(data(f));
    expect(h).toContain("This Ziffr has no mail server yet. Whoever runs it adds one on its Installation settings page.");
    expect(h).toContain("This Ziffr has no Slack app yet.");
    expect(h).toContain("This Ziffr has no Telegram bot yet.");
    expect(h).toContain("Not set up on this Ziffr");
    expect(buttons(h)).not.toContain("Send me a test");
    expect(buttons(h)).not.toContain("Add to Slack");
    expect(h).toContain("Every request carries a personal link");
    expect(h).toContain('href="/paste-values"');
    expect(h).toContain("No way of asking reaches you on this Ziffr yet.");
    expect(buttons(h)).toContain("Go on");
    expect(h).toContain("https://docs.ziffr.net/self-hosting/slack/");
    expect(h).not.toContain("Open Installation settings");
  });
  it("links the Installation settings page for an Installation Admin only", () => {
    expect(html(data(f, { installationAdmin: true }))).toContain('href="/installation"');
  });
});

describe("mail only", () => {
  it("offers a test of email and asks by email", () => {
    const h = html(data({ mail: "send", slack: "no-app", telegram: "no-bot" }));
    expect(buttons(h).filter((b) => b === "Send me a test")).toHaveLength(1);
    expect(h).toContain("replies do not come back");
    expect(h).toContain('<option value="email" selected="">Email</option>');
    expect(buttons(h)).toContain("Save and go on");
  });
});

describe("a Slack app on the Installation", () => {
  const f: Facts = { mail: "both", slack: "not-connected", telegram: "no-bot" };
  it("gives an Owner Add to Slack, and a Member only the words", () => {
    expect(buttons(html(data(f)))).toContain("Add to Slack");
    const m = html(data(f, { role: "member" }));
    expect(buttons(m)).not.toContain("Add to Slack");
    expect(m).toContain("An Owner or Admin connects Slack.");
  });
  it("says what Add to Slack came to when it brings the person back", () => {
    expect(html(data(f), "Slack is connected.")).toContain("Slack is connected.");
  });
  it("offers a test and linking once Slack is connected", () => {
    const h = html(data({ ...f, slack: "connected" }));
    expect(buttons(h).filter((b) => b === "Send me a test")).toHaveLength(2);
    expect(buttons(h)).toContain("Link my Slack account");
  });
});

describe("a Telegram bot on the Installation", () => {
  const f: Facts = { mail: "both", slack: "no-app", telegram: "off" };
  it("gives an Owner Turn on Telegram and a Member the words", () => {
    expect(buttons(html(data(f)))).toContain("Turn on Telegram");
    expect(buttons(html(data(f, { role: "member" })))).not.toContain("Turn on Telegram");
  });
  it("then Connect my Telegram to everyone, and a test once connected", () => {
    const on: Facts = { ...f, telegram: "on" };
    expect(buttons(html(data(on, { role: "member" })))).toContain("Connect my Telegram");
    expect(buttons(html(data(on, { telegramLinked: true })))).not.toContain("Connect my Telegram");
    expect(buttons(html(data(on, { telegramLinked: true }))).filter((b) => b === "Send me a test")).toHaveLength(2);
  });
});

describe("everything on", () => {
  const all: Facts = { mail: "both", slack: "connected", telegram: "on" };
  it("offers all three ways to be asked, keeps the saved first way and lists More ways", () => {
    const h = html(data(all, { telegramLinked: true, askedBy: ["slack"] }));
    expect(h).toContain('<option value="slack" selected="">Slack</option>');
    expect(h).toContain("More ways");
    expect(h).toContain('href="/settings/keys"');
    expect(h).toContain("Ask me by");
  });
  it("shows a Member the question about themselves, no Workspace questions and no More ways", () => {
    const h = html(data(all, { role: "member" }));
    expect(h).toContain("How should you be asked?");
    expect(h).not.toContain("How should people be asked and told?");
    expect(h).not.toContain("More ways");
    expect(h).not.toContain("Alerts");
  });
  it("ends with Skip and Save and go on, and every card is named for a screen reader", () => {
    const h = html(data(all));
    expect(buttons(h)).toEqual(expect.arrayContaining(["Skip", "Save and go on"]));
    expect(h.match(/aria-labelledby="way-/g)).toHaveLength(5);
  });
});
