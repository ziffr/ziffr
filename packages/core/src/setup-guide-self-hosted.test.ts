// The Setup Guide on a self-hosted Ziffr (spec 0052, ticket 12; GLOSSARY: Setup Guide, Installation, Trial Workspace): a table
// over what an Installation can have (mail server, Slack app, Telegram bot, a public address, the Marketplace, trial mode)
// against what the guide says and offers. Whatever is missing is said in words, the web form and paste always work, and no
// step depends on Ziffr Cloud or the Marketplace. The cards' own matrix (Owner or Member, linked or not) is in
// ways-in-and-out.test.ts; this one adds the Installation's other facts. No database: the states come from the same
// predicates `whatWorksHere` uses (mailEnabled, slackEnabled, telegramEnabled), and the trial's from `whatThisZiffrOffers`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inboundEnabled, mailEnabled } from "./mail";
import { slackEnabled } from "./slack-api";
import { telegramEnabled } from "./telegram-api";
import type { Settings } from "./settings-in-effect";
import { whatThisZiffrOffers, WAYS, type Way, type WayState } from "./what-works-here";
import { wayCards, type WayCard } from "./ways-in-and-out";
import { setupSteps, type SetupFacts } from "./setup-steps";

type Install = { mail: "none" | "send" | "both"; slack: boolean; telegram: boolean; publicUrl: boolean; marketplace: boolean; hostedTrial: boolean };

const KEY = "k".repeat(32);
/** The settings an Installation with these facts has. */
function settings(f: Install): Settings {
  const s: Settings = { ZIFFR_SECRETS_KEY: Buffer.from(KEY).toString("base64") };
  if (f.publicUrl) s.ZIFFR_SITE_URL = "https://ziffr.example.test";
  if (f.mail !== "none") Object.assign(s, { ZIFFR_SMTP_URL: "smtp://mail.example.test:25", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" });
  if (f.mail === "both") Object.assign(s, { ZIFFR_INBOUND_DOMAIN: "replies.example.test", ZIFFR_INBOUND_SECRET: "s".repeat(32) });
  if (f.slack) Object.assign(s, { ZIFFR_SLACK_CLIENT_ID: "id", ZIFFR_SLACK_CLIENT_SECRET: "secret", ZIFFR_SLACK_SIGNING_SECRET: "x".repeat(16) });
  if (f.telegram) s.ZIFFR_TELEGRAM_BOT_TOKEN = "123456:ABCdefGHIjklMNOpqrsTUVwxyz0123456789";
  if (f.marketplace) Object.assign(s, { ZIFFR_MARKETPLACE: "on", ZIFFR_MARKETPLACE_URL: "https://marketplace.example.test" });
  if (f.hostedTrial) Object.assign(s, { ZIFFR_CLOUD_KEY: "c".repeat(32), ZIFFR_TRIAL_DAYS: "14" });
  return s;
}

/** The ways as `whatWorksHere` gives them for an ordinary Workspace of this Installation whose Slack is connected and
 * Telegram is on (the cards' other states are the cards matrix's). */
function waysOf(s: Settings): WayState[] {
  const st = (way: Way, state: WayState["state"]): WayState => ({ way, label: way, state, reason: "reason", limit: null });
  return WAYS.map((w) => {
    if (w === "email") return st(w, mailEnabled(s) ? "real" : "simulated");
    if (w === "email-replies") return st(w, inboundEnabled(s) ? "real" : "off");
    if (w === "slack") return st(w, slackEnabled(s) ? "real" : "simulated");
    if (w === "telegram") return st(w, telegramEnabled(s) ? "real" : "simulated");
    if (w === "whatsapp" || w === "tickets") return st(w, "simulated");
    return st(w, "real");
  });
}

const get = (cards: WayCard[], way: WayCard["way"]) => cards.find((c) => c.way === way)!;
/** Words that would make a step depend on hosted Ziffr, or send a self-hoster to a paid or hosted place. */
const HOSTED = /ziffr cloud|subscribe|subscription|marketplace|trial|ziffr\.net\/(pricing|sign)/i;

const MAIL = ["none", "send", "both"] as const;
const BOOL = [false, true] as const;

describe("the Setup Guide on every kind of Installation", () => {
  for (const mail of MAIL) for (const slack of BOOL) for (const telegram of BOOL) for (const publicUrl of BOOL) for (const marketplace of BOOL) for (const hostedTrial of BOOL) {
    const f: Install = { mail, slack, telegram, publicUrl, marketplace, hostedTrial };
    const name = `mail ${mail}, Slack app ${slack ? "yes" : "no"}, Telegram bot ${telegram ? "yes" : "no"}, ${publicUrl ? "public address" : "no public address"}, Marketplace ${marketplace ? "on" : "off"}, ${hostedTrial ? "hosted with trials" : "self-hosted"}`;
    it(name, () => {
      const s = settings(f);
      const ways = waysOf(s);
      // What is real follows the Installation's facts: no public address means no mail and no Slack, as the queue says.
      const mailReal = mail !== "none" && publicUrl;
      expect(mailEnabled(s)).toBe(mailReal);
      expect(slackEnabled(s)).toBe(slack && publicUrl);

      for (const role of ["owner", "admin", "member"] as const) for (const installationAdmin of BOOL) {
        const cards = wayCards({ ways, role, installationAdmin, slackLink: null, telegramLinked: false });
        // The two ways in that need nothing are always there, so the First Metric step can finish anywhere.
        expect(get(cards, "web-form")).toMatchObject({ status: "ready" });
        expect(get(cards, "paste")).toMatchObject({ status: "ready" });
        // Each missing way is said in words, with where to add it and no button that cannot work.
        const email = get(cards, "email");
        if (mailReal) expect(email.status).toBe("ready");
        else expect(email).toMatchObject({ status: "missing-here", action: null, canTest: false });
        const sl = get(cards, "slack");
        if (!(slack && publicUrl)) expect(sl).toMatchObject({ status: "missing-here", action: null, canTest: false });
        const tg = get(cards, "telegram");
        if (!telegram) expect(tg).toMatchObject({ status: "missing-here", action: null, canTest: false });
        for (const c of cards.filter((x) => x.status === "missing-here")) {
          expect(c.line).toMatch(installationAdmin ? /Installation settings page/ : /Whoever runs it/);
          expect(c.help?.installationPage ?? null).toBe(installationAdmin ? "/installation" : null);
        }
        // Nothing a card says depends on hosted Ziffr, the Marketplace or a trial.
        for (const c of cards) expect(`${c.label} ${c.line} ${c.limit ?? ""}`).not.toMatch(HOSTED);
      }

      // Nothing is lost on the way: with every messenger missing the steps still finish by skipping what cannot work
      // here, and the First Metric step ticks from a Prompt out and a value in (web form), whatever else is there.
      const none: SetupFacts = {
        profileAnswered: true, clockSet: true, packInstalled: false, metrics: 1, startedFromScratch: true, preferenceReal: false,
        testMessageSent: false, promptOut: true, valueIn: true, hasOtherMember: false, openInvitation: false, domainJoining: false,
        contactSubmits: false, businessFunctionSet: true,
      };
      const done = setupSteps(none, "owner", { workspace: ["ways", "team"], person: [] });
      expect(done.finished).toBe(true);
      expect(done.steps.find((x) => x.id === "first_metric")!.ticked).toBe(true);

      // Trials: only on hosted Ziffr. A self-hoster who sets trial days without a Ziffr Cloud key gets none (the same
      // refusal as the sign-in), and a hosted one offers a trial whose Slack, Telegram and email states agree with the above.
      return whatThisZiffrOffers(s).then((o) => {
        expect(o.trial !== null).toBe(hostedTrial);
        if (o.trial) {
          const of = (w: Way) => o.trial!.ways.find((x) => x.way === w)?.state;
          expect(of("email")).toBe(ways.find((x) => x.way === "email")!.state);
          expect(of("slack") === "real").toBe(slackEnabled(s));
          expect(of("telegram") === "real").toBe(telegramEnabled(s));
        }
      });
    });
  }

  it("a self-hosted Ziffr that sets trial days without a Ziffr Cloud key offers no trial, and the guide is the same", async () => {
    const s = { ...settings({ mail: "both", slack: true, telegram: true, publicUrl: true, marketplace: false, hostedTrial: false }), ZIFFR_TRIAL_DAYS: "14" };
    expect((await whatThisZiffrOffers(s)).trial).toBeNull();
  });
});

describe("no step of the Setup Guide depends on Ziffr Cloud or the Marketplace", () => {
  // The guide's own code reads the Installation's settings and the Workspace, never the hosted or Marketplace checks.
  const FILES = ["setup-guide.ts", "setup-steps.ts", "setup-first-metric.ts", "setup-from-pack.ts", "included-packs.ts", "ways-in-and-out.ts", "team-setup.ts", "first-metric-loop.ts", "test-message.ts"];
  for (const file of FILES) {
    it(file, () => {
      let text: string;
      try { text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8"); } catch { return; }
      expect(text).not.toMatch(/hostedByCloud|ZIFFR_CLOUD|from "\.\/marketplace/);
    });
  }
});
