// The cards of the Ways in and out step (spec 0052, ticket 8; GLOSSARY: Setup Guide, Connector): the whole matrix of what
// a self-hosted Installation can have (mail server, inbound mail, Slack app, Slack connected, Telegram bot, Telegram
// on) against who is looking (Owner or Member, Installation Admin or not, linked or not), checked cell by cell against
// what each way must say. No database: the facts are the states `whatWorksHere` returns.
import { describe, expect, it } from "vitest";
import type { WorkspaceRoleName } from "./actor";
import { askableWays, HOW_TO, INSTALLATION_PAGE, wayCards, type CardInput, type WayCard } from "./ways-in-and-out";
import { WAYS, type Way, type WayState } from "./what-works-here";

type Facts = { mail: "none" | "send" | "both"; slack: "no-app" | "not-connected" | "connected"; telegram: "no-bot" | "off" | "on" };

/** The states `whatWorksHere` gives for these facts (its words are not under test here, its states are). */
function states(f: Facts, ended = false): WayState[] {
  const s = (way: Way, state: WayState["state"], reason = "reason", limit: string | null = null): WayState => ({ way, label: way, state, reason, limit });
  if (ended) return WAYS.map((w) => s(w, "off", "This trial has ended: nothing is sent or taken any more."));
  return [
    f.mail === "none" ? s("email", "simulated") : s("email", "real"),
    f.mail === "both" ? s("email-replies", "real") : s("email-replies", "off"),
    f.slack === "no-app" ? s("slack", "simulated") : f.slack === "connected" ? s("slack", "real") : s("slack", "off"),
    f.telegram === "no-bot" ? s("telegram", "simulated") : f.telegram === "on" ? s("telegram", "real") : s("telegram", "off"),
    s("web-form", "real"), s("api", "real"), s("mcp", "real"), s("feeds", "real"), s("whatsapp", "simulated"), s("tickets", "simulated"),
  ];
}

const input = (f: Facts, over: Partial<CardInput> = {}, ended = false): CardInput => ({ ways: states(f, ended), role: "owner", installationAdmin: false, slackLink: null, telegramLinked: false, ...over });
const get = (cards: WayCard[], way: WayCard["way"]) => cards.find((c) => c.way === way)!;

const MAIL = ["none", "send", "both"] as const;
const SLACK = ["no-app", "not-connected", "connected"] as const;
const TELEGRAM = ["no-bot", "off", "on"] as const;
const ROLES: WorkspaceRoleName[] = ["owner", "admin", "member"];

describe("the whole matrix of what an Installation can have", () => {
  for (const mail of MAIL) for (const slack of SLACK) for (const telegram of TELEGRAM) for (const role of ROLES) for (const installationAdmin of [false, true]) for (const slackLink of [null, "code"] as const) for (const telegramLinked of [false, true]) {
    const f: Facts = { mail, slack, telegram };
    const name = `${mail} mail, Slack ${slack}, Telegram ${telegram}, ${role}${installationAdmin ? " and Installation Admin" : ""}, Slack ${slackLink ?? "unlinked"}, Telegram ${telegramLinked ? "linked" : "unlinked"}`;
    it(name, () => {
      const cards = wayCards(input(f, { role, installationAdmin, slackLink, telegramLinked }));
      expect(cards.map((c) => c.way)).toEqual(["web-form", "email", "slack", "telegram", "paste"]);
      const admin = role !== "member";

      // Web form and paste: always ready, nothing to set up.
      expect(get(cards, "web-form")).toMatchObject({ status: "ready", action: null, canTest: false });
      expect(get(cards, "paste")).toMatchObject({ status: "ready", action: "paste", canTest: false });

      // Email.
      const email = get(cards, "email");
      if (mail === "none") expect(email).toMatchObject({ status: "missing-here", action: null, canTest: false, help: { guide: HOW_TO.mail, installationPage: installationAdmin ? INSTALLATION_PAGE : null } });
      else expect(email).toMatchObject({ status: "ready", canTest: true, help: null });
      if (mail === "both") expect(email.line).toContain("Reply with the number");
      if (mail === "send") expect(email.line).toContain("replies do not come back");

      // Slack: never a button that cannot work here, never a Workspace-level press for a Member.
      const sl = get(cards, "slack");
      if (slack === "no-app") expect(sl).toMatchObject({ status: "missing-here", action: null, canTest: false, help: { guide: HOW_TO.slack, installationPage: installationAdmin ? INSTALLATION_PAGE : null } });
      if (slack === "not-connected") expect(sl).toMatchObject(admin ? { status: "one-click", action: "add-slack" } : { status: "ask-admin", action: null });
      if (slack === "connected") expect(sl).toMatchObject({ status: "ready", canTest: true, action: null, also: slackLink ? null : "link-slack" });
      if (slack !== "not-connected") expect(sl.action === "add-slack").toBe(false);

      // Telegram: turn on (Owner or Admin), then connect (everyone), then ready.
      const tg = get(cards, "telegram");
      if (telegram === "no-bot") expect(tg).toMatchObject({ status: "missing-here", action: null, canTest: false, help: { guide: HOW_TO.telegram, installationPage: installationAdmin ? INSTALLATION_PAGE : null } });
      if (telegram === "off") expect(tg).toMatchObject(admin ? { status: "one-click", action: "turn-on-telegram" } : { status: "ask-admin", action: null });
      if (telegram === "on") expect(tg).toMatchObject(telegramLinked ? { status: "ready", canTest: true, action: null } : { status: "one-click", action: "connect-telegram", canTest: false });

      // A Member is never offered something that sets up the Workspace.
      if (!admin) for (const c of cards) expect(["add-slack", "turn-on-telegram"]).not.toContain(c.action);
      // The Installation settings page is linked only for an Installation Admin, and only on a missing way.
      for (const c of cards) if (c.help) expect(c.help.installationPage).toBe(installationAdmin ? INSTALLATION_PAGE : null);
      // A test is only ever offered for a way that works for the viewer.
      for (const c of cards) if (c.canTest) expect(c.status).toBe("ready");
    });
  }
});

describe("the words for what is missing", () => {
  const none: Facts = { mail: "none", slack: "no-app", telegram: "no-bot" };
  it("tells someone who does not run the Installation whom to ask", () => {
    const cards = wayCards(input(none));
    expect(get(cards, "slack").line).toBe("This Ziffr has no Slack app yet. Whoever runs it adds one on its Installation settings page.");
    expect(get(cards, "telegram").line).toBe("This Ziffr has no Telegram bot yet. Whoever runs it adds one on its Installation settings page.");
    expect(get(cards, "email").line).toBe("This Ziffr has no mail server yet. Whoever runs it adds one on its Installation settings page.");
  });
  it("tells an Installation Admin where", () => {
    expect(get(wayCards(input(none, { installationAdmin: true })), "slack").line).toBe("This Ziffr has no Slack app yet. You can add one on the Installation settings page.");
  });
  it("leaves the web form and paste working with nothing set up, so the First Metric can still finish", () => {
    const cards = wayCards(input(none));
    expect(get(cards, "web-form").status).toBe("ready");
    expect(get(cards, "paste").status).toBe("ready");
  });
  it("says so for every way when a trial has ended", () => {
    const cards = wayCards(input({ mail: "send", slack: "connected", telegram: "on" }, {}, true));
    expect(cards.every((c) => c.status === "unavailable" && c.action === null && !c.canTest)).toBe(true);
  });
});

describe("which ways a person may be asked by", () => {
  it("offers exactly the ways that really go out here, never one kept in the Outbox", () => {
    expect(askableWays(states({ mail: "none", slack: "no-app", telegram: "no-bot" }))).toEqual([]);
    expect(askableWays(states({ mail: "send", slack: "not-connected", telegram: "off" }))).toEqual(["email"]);
    expect(askableWays(states({ mail: "both", slack: "connected", telegram: "on" }))).toEqual(["email", "slack", "telegram"]);
  });
});
