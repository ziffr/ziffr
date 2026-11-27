// The words an owner reads when someone stops requests for numbers (GLOSSARY: Prompt, Submitter), and the line beside
// that Submitter on the Metric's page.
import { describe, expect, it } from "vitest";
import { buttonTo } from "./mail-links";
import { describeWithStops, routePrompts, type PromptWay, type RoutesInput } from "./prompt-route";
import { stopNotice, type StoppedMetric } from "./stop-notice";

const metric = (name: string, over: Partial<StoppedMetric> = {}): StoppedMetric => ({ name, slug: name.toLowerCase(), still: [], others: [], feeds: [], form: true, ...over });

describe("the notice to an owner", () => {
  it("says plainly that nobody is asked, and offers someone else or the form link", () => {
    const n = stopNotice("Sara", "email", [metric("Revenue"), metric("Visits")]);
    expect(n.subject).toBe("Sara is no longer asked for numbers by email");
    expect(n.text).toBe("Sara unsubscribed, so Ziffr can't ask them by email for:\n- Revenue\n- Visits\n\nNobody else is asked for these, so they will stay empty.\n\nChoose someone else, or send Sara a link to enter them, on each Metric's page.");
    expect(n.link).toBe("/metrics/revenue?tab=settings#who-submits");
    expect(`${n.subject}\n${n.text}`).not.toMatch(/reminder|Prompt|Connector/i);
  });
  it("says who is still asked, who sends, and which number stays empty, and opens that one", () => {
    const n = stopNotice("Sara", "email", [metric("Revenue", { others: ["Ben"] }), metric("Visits"), metric("Leads", { feeds: ["Warehouse"] }), metric("Calls", { still: ["slack"] })]);
    expect(n.text).toContain("Ziffr still asks them on Slack for Calls.");
    expect(n.text).toContain("Ben is still asked for Revenue.");
    expect(n.text).toContain("The Feed Warehouse still sends Leads.");
    expect(n.text).toContain("Nobody else is asked for Visits, so it will stay empty.");
    expect(n.link).toBe("/metrics/visits?tab=settings#who-submits");
  });
  it("reads right for one number, for the reader themselves and for another way", () => {
    expect(stopNotice("Sara", "email", [metric("Revenue")]).text).toContain("Nobody else is asked for it, so it will stay empty.\n\nChoose someone else, or send Sara a link to enter it, on the Metric's page.");
    expect(stopNotice("Sara", "email", [metric("Revenue", { others: ["You"], still: ["slack"], form: false })]).text).toBe("Sara unsubscribed, so Ziffr can't ask them by email for:\n- Revenue\n\nZiffr still asks them on Slack.\nYou are still asked for Revenue.\n\nYou can choose someone else on the Metric's page.");
    expect(stopNotice("Sara", "slack", [metric("Revenue")]).subject).toBe("Sara is no longer asked for numbers on Slack");
  });
  it("is a button that says what to do", () => {
    const site = "https://z.example.test";
    expect(buttonTo(`${site}/metrics/revenue?tab=settings#who-submits`, [site]).label).toBe("Choose someone else");
    expect(buttonTo(`${site}/api/unsubscribe/again/abc`, [site]).label).toBe("Get them again");
  });
});

describe("the line beside a Submitter who stopped", () => {
  const input = (chosen: string[], over: Partial<RoutesInput> = {}): RoutesInput => ({ chosen, accepts: ["slack", "web_form"], mailReplies: false, reach: { slack: true, telegram: false, email: true }, ...over });
  const view = (i: RoutesInput, stopped: PromptWay[]) => describeWithStops(i, routePrompts(i), new Set(stopped));
  it("says they are not asked when every way is stopped, and never that a request goes", () => {
    expect(view(input(["email"]), ["email"])).toEqual({ ok: false, text: "Not asked by email (unsubscribed)", why: null, fix: null });
  });
  it("names the way that still goes beside the one stopped", () => {
    expect(view(input(["email", "slack"]), ["email"])).toMatchObject({ ok: true, text: "By Slack", stopped: "Not asked by email (unsubscribed)" });
    expect(view(input(["slack"]), ["email"])).toMatchObject({ ok: true, text: "By Slack", stopped: "Not asked by email (unsubscribed)" });
  });
  it("says nothing of a way the Metric does not use", () => {
    expect(view(input(["slack"], { accepts: ["slack"] }), ["email"]).stopped).toBeUndefined();
  });
});
