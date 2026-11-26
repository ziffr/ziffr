// @vitest-environment node
// The Team step as a person sees it (spec 0052, ticket 10; GLOSSARY: Setup Guide, Invitation, Workspace Role, Domain
// Joining, Business Function): the roles in one line each, the trial's gate in words, what an Admin is not offered, and
// that a suggestion is a button that has not been pressed. The data comes from the core's `teamSetup`, tried on its own.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("@/app/team-actions", () => ({ createGroup: async () => ({}), createInviteLink: async () => "", inviteGateNow: async () => ({}), inviteMember: async () => ({}), setDomainJoining: async () => ({}), setMember: async () => ({}) }));
vi.mock("@/app/series-actions", () => ({ askMeNow: async () => ({}), recordValue: async () => ({}) }));
vi.mock("./team-actions", () => ({ askForMetric: async () => ({}) }));
vi.mock("./actions", () => ({ skipStep: async () => ({}) }));
import { WORKSPACE_ROLE_WORDS } from "@ziffr/core/role-words";
import type { TeamSetup } from "@ziffr/core/team-setup";
import { TeamStep } from "./team";

const base: TeamSetup = {
  isOwner: true, mailOn: true, people: [{ id: "o", name: "Olga", kind: "member", role: "owner", function: null }],
  invitations: [], trial: { onTrial: false }, gate: { state: "open" }, domain: { on: null }, groups: [], asks: [],
};
const html = (d: Partial<TeamSetup> = {}, offer: string | null = "acme.test") => renderToStaticMarkup(<TeamStep data={{ ...base, ...d }} domainOffer={offer} />).replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const emailInput = (h: string) => h.match(/<input[^>]*type="email"[^>]*>/)![0];
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));

describe("the roles", () => {
  it("explains each of the four in one line, from the one place that words them", () => {
    const h = html();
    for (const r of Object.values(WORKSPACE_ROLE_WORDS)) { expect(h).toContain(r.label); expect(h).toContain(r.line); }
  });
  it("offers an Owner all four roles to invite as, and an Admin no Owner", () => {
    const owner = html();
    expect(owner).toMatch(/<option value="owner">Owner<\/option>/);
    const admin = html({ isOwner: false }, null);
    expect(admin).not.toMatch(/<option value="owner">/);
    expect(admin).toMatch(/<option value="admin">Admin<\/option>/);
  });
});

describe("Domain Joining", () => {
  it("is offered to an Owner with the sign-in domain, says why when there is none, and shows what is on", () => {
    expect(html()).toContain("Let people with an address at acme.test ask to join");
    expect(html({}, null)).toContain("Domain Joining needs a verified company address");
    expect(html({ domain: { on: "acme.test" } })).toContain("People with an address at acme.test may ask to join");
  });
  it("is not shown to an Admin or in a trial", () => {
    expect(html({ isOwner: false })).not.toContain("Colleagues at your company");
    expect(html({ trial: { onTrial: true } })).not.toContain("Colleagues at your company");
  });
});

describe("the trial", () => {
  const trial = { onTrial: true };
  it("says right above the greyed fields why they are closed, and ties them to those words", () => {
    const h = html({ trial, gate: { state: "waiting", you: true, metric: null } });
    expect(h).toContain("Invitations are not open yet");
    expect(h.indexOf("Invitations are not open yet")).toBeGreaterThan(h.indexOf('id="team-invite"'));
    expect(h.indexOf("Invitations are not open yet")).toBeLessThan(h.indexOf('type="email"'));
    expect(emailInput(h)).toContain(' disabled=""');
    expect(emailInput(h)).toContain('aria-describedby="team-invite-why"');
    expect(buttons(h)).not.toContain("Make a link for Members");
  });
  it("is open after the first value, with no link to make", () => {
    const h = html({ trial });
    expect(h).not.toContain("Invitations are");
    expect(emailInput(h)).not.toContain(' disabled=""');
    expect(buttons(h)).not.toContain("Make a link for Members");
  });
  it("closes the form when it has ended or every place is taken", () => {
    for (const gate of [{ state: "ended" }, { state: "full", limit: 5 }] as const) expect(emailInput(html({ trial, gate }))).toContain(' disabled=""');
    expect(html({ trial, gate: { state: "ended" } })).toContain("This trial has ended");
  });
  it("outside a trial offers the link and the form is live", () => {
    const h = html();
    expect(buttons(h).some((b) => b.includes("Make a link for Members"))).toBe(true);
    expect(emailInput(h)).not.toContain(' disabled=""');
  });
});

describe("Who is asked for what", () => {
  const asks = [{ metricId: 7, name: "Cash at hand", submitters: [], suggested: [{ id: "b", name: "Ben", function: "Finance" }] }];
  const people: TeamSetup["people"] = [...base.people, { id: "b", name: "Ben", kind: "member", role: "member", function: "Finance" }, { id: "c", name: "Cleo", kind: "contact", role: null, function: null }];
  it("shows a suggestion as a button with the function, says nothing is assigned until pressed, and lists others, Contacts included", () => {
    const h = html({ asks, people });
    expect(buttons(h)).toContain("Suggested: Ben (Finance)");
    expect(h).toContain("Nobody is asked yet.");
    expect(h).toContain("Nothing is assigned until you press.");
    expect(h).toContain("Cleo (Contact)");
    // Ben is suggested, so he is not offered again in the list of others.
    expect(h).not.toMatch(/<option value="b">/);
  });
  it("names the people asked already and does not suggest them", () => {
    const h = html({ asks: [{ ...asks[0], submitters: [{ id: "b", name: "Ben" }], suggested: [] }], people });
    expect(h).toContain("Asked: Ben");
    expect(buttons(h).some((b) => b.startsWith("Suggested"))).toBe(false);
  });
  it("says there is nothing to ask for yet when no Metric may be changed", () => {
    expect(html()).toContain("You have no Metric yet that you can change.");
  });
});

describe("who is here", () => {
  it("shows people with their role and function, and invitations as waiting", () => {
    const h = html({ people: [...base.people, { id: "b", name: "Ben", kind: "member", role: "member", function: "Finance" }], invitations: [{ id: 1, email: "x@acme.test", role: "guest", expiresAt: "2026-12-01" }] });
    expect(h).toContain("Works in Finance");
    expect(h).toContain("x@acme.test");
    expect(h).toContain("invited as Guest, waiting");
  });
  it("can be skipped and left", () => {
    const b = buttons(html());
    expect(b).toContain("Skip");
    expect(b).toContain("Go to Ziffr");
  });
});
