import { describe, expect, it } from "vitest";
import { allowedWays, describeRoute, isNotSentReason, notSentReason, routePrompt, type RouteInput } from "./prompt-route";
import type { SourceId } from "./types";

const all = { slack: true, telegram: true, email: true };
const none = { slack: false, telegram: false, email: false };
const input = (o: Partial<RouteInput>): RouteInput => ({ chosen: "email", accepts: ["slack", "telegram", "mail", "web_form"], mailReplies: true, reach: all, ...o });

describe("routePrompt: chosen vs allowed vs reachable", () => {
  const table: { name: string; i: Partial<RouteInput>; via: string | null; chosen?: boolean; answerHere?: boolean; formLink?: boolean }[] = [
    { name: "chosen, allowed, reachable", i: { chosen: "slack" }, via: "slack", chosen: true, answerHere: true, formLink: false },
    { name: "Telegram chosen and allowed", i: { chosen: "telegram" }, via: "telegram", chosen: true, answerHere: true, formLink: false },
    { name: "email chosen, mail accepted: asks for a reply, no form link", i: { chosen: "email" }, via: "email", chosen: true, answerHere: true, formLink: false },
    { name: "email chosen, only the Web form accepted: form link", i: { chosen: "email", accepts: ["web_form"] }, via: "email", chosen: true, answerHere: false, formLink: true },
    { name: "email chosen, mail accepted but replies do not come back: form link", i: { chosen: "email", accepts: ["mail", "web_form"], mailReplies: false }, via: "email", chosen: true, answerHere: false, formLink: true },
    { name: "email chosen, mail accepted, replies do not come back, no Web form: nothing by email", i: { chosen: "email", accepts: ["mail"], mailReplies: false }, via: null },
    { name: "Slack-only Metric, email chosen: Slack (the owner's bug)", i: { chosen: "email", accepts: ["slack"] }, via: "slack", chosen: false, answerHere: true, formLink: false },
    { name: "Slack-only Metric, Slack not linked: nothing", i: { chosen: "email", accepts: ["slack"], reach: { ...all, slack: false } }, via: null },
    { name: "chosen allowed but not reachable: next allowed (Telegram)", i: { chosen: "slack", reach: { ...all, slack: false } }, via: "telegram", chosen: false, answerHere: true, formLink: false },
    { name: "fixed order Slack, Telegram, email", i: { chosen: "whatsapp" }, via: "slack", chosen: false },
    { name: "fixed order skips what the Metric refuses", i: { chosen: "tickets", accepts: ["telegram", "web_form"] }, via: "telegram", chosen: false },
    { name: "falls to email with a form link when chat is unreachable", i: { chosen: "slack", accepts: ["slack", "web_form"], reach: { ...all, slack: false } }, via: "email", chosen: false, answerHere: false, formLink: true },
    { name: "API-only Metric: no way", i: { accepts: ["api"] }, via: null },
    { name: "nothing reachable", i: { reach: none }, via: null },
  ];
  it.each(table)("$name", ({ i, via, chosen, answerHere, formLink }) => {
    const r = routePrompt(input(i));
    expect(r.via).toBe(via);
    if (r.via) {
      if (chosen !== undefined) expect(r.chosen).toBe(chosen);
      if (answerHere !== undefined) expect(r.answerHere).toBe(answerHere);
      if (formLink !== undefined) expect(r.formLink).toBe(formLink);
      // Never a form link for a Metric that refuses the Web form.
      if (!(i.accepts ?? ["web_form"]).includes("web_form")) expect(r.formLink).toBe(false);
    }
  });
});

describe("allowedWays", () => {
  it("reads the Sources", () => {
    expect(allowedWays(["slack"], true)).toEqual({ slack: true, telegram: false, email: false });
    expect(allowedWays(["mail"], false).email).toBe(false);
    expect(allowedWays(["mail"], true).email).toBe(true);
    expect(allowedWays(["web_form"], false).email).toBe(true);
  });
});

describe("notSentReason", () => {
  it("names the way and what is missing, without names", () => {
    expect(notSentReason(["slack"], true, none)).toBe("Not sent: this Metric takes values only by Slack, and they have no linked Slack account.");
    expect(notSentReason(["slack", "telegram"], true, none)).toBe("Not sent: this Metric takes values only by Slack or Telegram, and they have no linked Slack account and have not connected Telegram.");
    expect(notSentReason(["slack", "telegram", "web_form"], true, none)).toBe("Not sent: this Metric takes values only by Slack, Telegram or email, and they have no linked Slack account and have not connected Telegram and have no email address.");
  });
  it("says when the Metric takes no way a Prompt can go by", () => {
    expect(notSentReason(["api"], true, all)).toContain("none of");
  });
});

describe("describeRoute", () => {
  const view = (i: Partial<RouteInput>) => { const x = input(i); return describeRoute(x, routePrompt(x)); };
  it("says plainly when it goes the chosen way", () => expect(view({ chosen: "slack" })).toEqual({ ok: true, text: "By Slack", why: null, fix: null }));
  it("says why when the chosen way is refused by the Metric", () => {
    const v = view({ chosen: "email", accepts: ["slack"] as SourceId[] });
    expect(v).toMatchObject({ ok: true, text: "By Slack", why: "They chose email, but this Metric does not take values by email.", fix: null });
  });
  it("says why when the chosen way does not reach them, with the fix", () => {
    const v = view({ chosen: "slack", reach: { ...all, slack: false } });
    expect(v).toMatchObject({ text: "By Telegram", why: "They chose Slack, but it does not reach them.", fix: { label: "Link Slack", href: "/connectors" } });
  });
  it("copes with a chosen Connector that is not a way", () => expect(view({ chosen: "tickets" })).toMatchObject({ text: "By Slack", why: null }));
  it("names what to fix when nothing reaches them", () => {
    expect(view({ accepts: ["slack"], reach: none })).toMatchObject({ ok: false, text: "Can’t reach: link Slack", fix: { label: "Link Slack" } });
    expect(view({ accepts: ["web_form"], reach: none })).toMatchObject({ ok: false, fix: { label: "Add an email address", href: "/settings/profile" } });
  });
  it("says when no way is allowed", () => expect(view({ accepts: ["api"] })).toMatchObject({ ok: false, text: "Can’t ask: no way a request can go by", fix: null }));
});

describe("isNotSentReason", () => {
  it("accepts what notSentReason writes and nothing else", () => {
    for (const a of [["slack"], ["slack", "telegram"], ["api"]] as SourceId[][]) expect(isNotSentReason(notSentReason(a, true, none))).toBe(true);
    expect(isNotSentReason("Not sent: <b>anything</b>")).toBe(false);
    expect(isNotSentReason("It could not be delivered.")).toBe(false);
  });
});
