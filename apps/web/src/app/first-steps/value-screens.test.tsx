// @vitest-environment node
// First Steps' last three screens as a person sees them (spec 0067, ticket 4; GLOSSARY: First Steps, Value, Submitter):
// each state with the right words and buttons, drawn from what the core hands over (its words are tried on their own).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ unstable_rethrow() {} }));
vi.mock("./value-actions", () => ({ askByEmail: async () => ({}), chooseProvider: async () => ({}), emailAgain: async () => ({}), lookForValue: async () => ({}), pickValueMetric: async () => ({}), readDone: async () => ({}), readFirstValue: async () => ({}), readSender: async () => ({}), typeValue: async () => ({}) }));
import type { FirstSenderView, FirstStepsDone } from "@ziffr/core/first-steps-providers";
import type { FirstValueView } from "@ziffr/core/first-steps-value";
import { Closing } from "./screens/done";
import { Providers } from "./screens/sender";
import { SendFirst } from "./screens/value";

const none = () => {};
const clean = (h: string) => h.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("<!-- -->", "");
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));

const view = (over: Partial<FirstValueView> = {}): FirstValueView => ({
  metric: { id: 1, name: "Signups", unit: "", canType: true }, others: [], invitesWait: true, chosen: false, email: { state: "offered", address: "anna@example.test", reply: true },
  request: null, quiet: null, cooldown: null, checks: [{ text: "Look in the spam folder.", href: "/connectors/outbox", label: "Open the Outbox" }], progress: { value: null, canInvite: false, reply: null }, ...over,
});
const value = (over: Partial<FirstValueView> = {}) => clean(renderToStaticMarkup(<SendFirst ws="w" view={view(over)} reload={async () => {}} go={none} />));
const request = { state: "sent" as const, words: "Sent to anna@example.test. Reply to it with the number." };

describe("Now send your first value", () => {
  it("says what waits for it, and offers email, typing and later", () => {
    const h = value();
    expect(h).toContain("Until it is in, your dashboard stays empty and you cannot invite colleagues.");
    expect(buttons(h).join("|")).toMatch(/Ask me by email.*\|Type it in here.*\|Do this later/);
    expect(h).not.toContain("One value of the set");
  });
  it("says nothing about colleagues where no invitation waits, and that one value of a set is enough", () => {
    const h = value({ invitesWait: false, others: [{ id: 2, name: "Revenue" }] });
    expect(h).toContain("Until it is in, your dashboard stays empty. One value of the set is enough.");
    expect(h).not.toContain("invite colleagues");
    expect(h).toContain("Choose another");
  });
  it("offers only typing where email is not set up, and says who can set it up", () => {
    const h = value({ email: { state: "off", address: null, reply: false } });
    expect(h).toContain("This Ziffr cannot send email yet. Whoever runs it can set that up in the Installation settings.");
    expect(h).not.toContain("Ask me by email");
    expect(h).toContain("Record value");
  });
  it("says the person stopped these emails and offers to switch them on, instead of asking", () => {
    const h = value({ email: { state: "stopped", address: "anna@example.test", reply: true } });
    expect(h).toContain("You stopped requests for numbers by email.");
    expect(buttons(h)).toContain("Get them by email again");
    expect(h).not.toContain("Ask me by email");
  });
  it("shows where the request went, waits for the number, and has the help and the ways on", () => {
    const h = value({ request, cooldown: "You asked a moment ago.", progress: { value: null, canInvite: false, reply: "That request is too old. Ask again." } });
    expect(h).toContain("Sent to anna@example.test.");
    expect(h).toContain("Waiting for your number");
    expect(h).toContain("That request is too old. Ask again.");
    expect(h).toContain("Nothing arrived?");
    expect(h).toContain("Look in the spam folder.");
    expect(buttons(h)).toEqual(expect.arrayContaining(["Ask again", "Type it in here", "Do this later"]));
    expect(h).toContain("You asked a moment ago.");
  });
  it("links the Outbox for a request kept there, and shows the Quiet Hours before asking", () => {
    expect(value({ request: { state: "outbox", words: "The request is kept in the Outbox." } })).toContain('href="/connectors/outbox"');
    expect(value({ quiet: "You are in your Quiet Hours until 07:00." })).toContain("You are in your Quiet Hours until 07:00.");
  });
  it("closes the loop when the value arrives: the number, what is now open, and on", () => {
    const arrived = { metric: "Signups", value: "42", period: "November 2026", byReply: true, waitsApproval: false };
    const h = value({ request, progress: { value: arrived, canInvite: true, reply: null } });
    expect(h).toContain("Your reply arrived");
    expect(h).toContain("42 for November 2026");
    expect(h).toContain("Your dashboard shows its first number");
    expect(h).toContain("You can invite colleagues");
    expect(buttons(h)).toEqual(["Go on"]);
    const typed = value({ progress: { value: { ...arrived, byReply: false, waitsApproval: true }, canInvite: false, reply: null } });
    expect(typed).toContain("Value recorded");
    expect(typed).toContain("It waits for approval. It counts as in.");
    expect(typed).not.toContain("invite colleagues");
  });
});

const sender = (over: Partial<FirstSenderView> = {}) => clean(renderToStaticMarkup(<Providers ws="w" view={{ several: false, alone: false, locked: false, trial: false, mailReal: true, firstAsk: "Tuesday 1 December at 09:00", ...over }} go={none} />));

describe("Who provides this number from now on?", () => {
  it("names when Ziffr first asks, and offers the three choices", () => {
    const h = sender();
    expect(h).toContain("Who provides this number from now on?");
    expect(h).toContain("Nothing is sent now. Ziffr first asks on Tuesday 1 December at 09:00.");
    expect(buttons(h).join("|")).toMatch(/I will.*\|A colleague.*\|Nobody for now/);
  });
  it("locks the colleague with the reason and the way to open it", () => {
    const h = sender({ locked: true, trial: true, several: true });
    expect(h).toContain("these numbers");
    expect(h).toContain("A colleague (locked)");
    expect(h).toContain("Opens once your own first value is in.");
    expect(buttons(h)).toContain("Send it now");
    expect(h).not.toContain("Ziffr asks them");
  });
  it("says Someone else for one person alone", () => {
    expect(sender({ alone: true })).toContain("Someone else");
  });
});

const done = (over: Partial<FirstStepsDone> = {}) => clean(renderToStaticMarkup(<Closing data={{ workspace: "Nord Co", set: null, metrics: ["Signups"], value: { metric: "Signups", value: "42", period: "November 2026" }, open: false, asked: "You", invitesLocked: false, dashboard: 7, ...over }} go={none} leave={none} />));

describe("the closing screen", () => {
  it("is ready: the summary, the dashboard and the optional steps", () => {
    const h = done();
    expect(h).toContain("Your Workspace is ready");
    for (const words of ["Nord Co", "First metric", "42 for November 2026", "Asked for values", "You"]) expect(h).toContain(words);
    expect(buttons(h).join("|")).toMatch(/Open dashboard\|Invite your team.*\|Connect Slack or Telegram/);
  });
  it("says one thing is still open, asks for the value and shows invitations locked", () => {
    const h = done({ open: true, value: null, invitesLocked: true, set: "Online shop", metrics: ["Orders", "Revenue"] });
    expect(h).toContain("One thing is still open");
    expect(h).toContain("Still waiting");
    expect(h).toContain("Online shop, 2 metrics");
    expect(h).toContain("Invite your team (locked)");
    expect(h).toContain("Send your first value to open invitations.");
    expect(buttons(h)).toContain("Send my first value");
  });
  it("leaves the invite open in an ordinary Workspace that has no value yet", () => {
    const h = done({ open: true, value: null });
    expect(h).toContain("your dashboard is empty");
    expect(h).not.toContain("(locked)");
  });
});
