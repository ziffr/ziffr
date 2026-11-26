// @vitest-environment node
// First Metric, the step as a person sees it (spec 0052, ticket 9; GLOSSARY: Setup Guide, Prompt, Quiet Hours, Outbox):
// each state of the screen with the right words and the right buttons. The words come from the core's pure helpers and
// are tried on their own; here the screen is rendered from a step as the core hands it over.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("./first-metric-actions", () => ({ askFirstMetric: async () => ({}), askMeForIt: async () => ({}), checkFirstMetric: async () => ({}), pickMetric: async () => ({}), sendFirstValue: async () => ({}), tryExampleHere: async () => ({}) }));
vi.mock("./actions", () => ({ skipStep: async () => ({}) }));
import type { FirstMetricStep } from "@ziffr/core/setup-first-metric";
import { didntArrive, whatToLookFor } from "@ziffr/core/first-metric-words";
import { FirstMetricStepView, POLL_EVERY_MS, POLL_FOR_MS } from "./first-metric";

const mine = { id: 1, name: "MRR", unit: "EUR", slug: "mrr", mine: true, submitting: true, ownerName: null, canAsk: true, example: false };
const base = (over: Partial<FirstMetricStep> = {}): FirstMetricStep => ({
  metric: mine, choices: [{ id: 1, name: "MRR" }, { id: 2, name: "Visits" }], trial: false, canTryExample: false, ways: [{ connector: "email", label: "Email" }], asked: [], formCode: null,
  quietBefore: null, cooldown: null, out: false, in: false, value: null, works: null,
  checks: didntArrive({ ways: ["email"], mailReal: true, quietUntil: null, repliesByEmail: true, email: "anna@example.org" }), ...over,
});
const html = (s: FirstMetricStep) => renderToStaticMarkup(<FirstMetricStepView step={s} following="team" />).replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
const asked = { connector: "email" as const, label: "Email", state: "sent" as const, held: false, note: null, at: "2027-01-01T10:42:00Z", look: whatToLookFor("email", { metric: "MRR", email: "anna@example.org", repliesByEmail: true }) };

describe("before asking", () => {
  it("offers Ask me now and a number box, names the ways, and shows no form link yet", () => {
    const h = html(base());
    expect(h).toContain("Try MRR both ways");
    expect(buttons(h)).toEqual(expect.arrayContaining(["Ask me now", "Send the value", "Skip", "Go on"]));
    expect(h).toContain("By Email, as you chose.");
    expect(h).not.toContain("/submit/");
    expect(h).not.toContain("Didn’t arrive");
    expect(h).toContain("Another Metric");
  });
  it("says the Quiet Hours before asking, and when Ask me now may be pressed again, with the button off", () => {
    const h = html(base({ quietBefore: "You are in your Quiet Hours until 07:00: the request will wait until then. It counts as asked, so you can go on.", cooldown: "You asked a moment ago. Ziffr asks at most once every 10 minutes: you can ask again in 7 minutes, at 10:52." }));
    expect(h).toContain("You are in your Quiet Hours until 07:00");
    expect(h).toContain("you can ask again in 7 minutes, at 10:52.");
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Ask me now<\/button>/);
  });
});

describe("after asking", () => {
  it("shows what was sent and what to look for, the form link, the waiting words and Didn’t arrive?", () => {
    const h = html(base({ asked: [asked], out: true, formCode: "tk-abc" }));
    expect(h).toContain("Asked by Email at ");
    expect(h).toContain("An email from Ziffr to anna@example.org");
    expect(h).toContain('href="/submit/tk-abc"');
    expect(h).toContain("Waiting for your value");
    expect(h).toContain("Didn’t arrive?");
    expect(h).toContain("spam folder of anna@example.org");
    expect(h).toContain('href="/connectors/outbox"');
  });
  it("says a held Prompt waits for the Quiet Hours, and a kept one is in the Outbox with its reason", () => {
    expect(html(base({ asked: [{ ...asked, state: "queued", held: true }], out: true }))).toContain("Email: waiting for your Quiet Hours to end.");
    const h = html(base({ asked: [{ ...asked, state: "outbox", note: "Email is not set up." }] }));
    expect(h).toContain("Email: kept in the Outbox: Email is not set up.");
    expect(h).toContain("Open the Outbox");
  });
});

describe("done", () => {
  it("says what arrived and that the loop works, and hides the help and the skip", () => {
    const h = html(base({ asked: [asked], out: true, in: true, works: "MRR for November 2026: 48,200 EUR, by email reply. The loop works." }));
    expect(h).toContain("MRR for November 2026: 48,200 EUR, by email reply. The loop works.");
    expect(buttons(h)).not.toContain("Skip");
    expect(h).not.toContain("Didn't arrive");
    expect(buttons(h)).toContain("Go on");
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>Go on<\/button>/);
  });
});

describe("who owns it", () => {
  it("offers Ask me for it to an owner who does not submit, and no Ask me now yet", () => {
    const h = html(base({ metric: { ...mine, submitting: false, canAsk: false } }));
    expect(buttons(h)).toContain("Ask me for it");
    expect(buttons(h)).not.toContain("Ask me now");
  });
  it("names the owner when someone else owns it and offers one of the viewer's own", () => {
    const h = html(base({ metric: { ...mine, mine: false, submitting: false, canAsk: false, ownerName: "Ben" } }));
    expect(h).toContain("Ben owns MRR.");
    expect(buttons(h)).not.toContain("Ask me now");
    expect(h).toContain("Another Metric");
  });
  it("with no Metric offers to make one, in a trial too, and still lets the person skip", () => {
    const h = html(base({ metric: null, choices: [] }));
    expect(h).toContain('href="/metrics/new?setup=1"');
    expect(buttons(h)).toContain("Skip");
    expect(buttons(html(base({ metric: null, choices: [], trial: true })))).not.toContain("Try the example");
    const owner = html(base({ metric: null, choices: [], trial: true, canTryExample: true }));
    expect(buttons(owner)).toContain("Try the example");
    expect(owner).toContain("how many cups of coffee you drank");
  });
  it("says what the example is before anyone is asked about it", () => {
    const h = html(base({ trial: true, metric: { ...mine, name: "Cups of coffee", example: true } }));
    expect(h).toContain("Try Cups of coffee both ways (the example)");
    expect(h).toContain("Cups of coffee is an example Ziffr made");
    expect(h).toContain("Make a Metric of your own");
    expect(html(base({ trial: true }))).not.toContain("example");
  });
});

describe("the polling", () => {
  it("looks every five seconds for ten minutes at most", () => {
    expect(POLL_EVERY_MS).toBe(5000);
    expect(POLL_FOR_MS).toBe(600_000);
  });
});
