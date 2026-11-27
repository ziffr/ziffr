// @vitest-environment happy-dom
// The words above a closed invite form (spec 0040, ADR 0015; GLOSSARY: Invitation, Trial Workspace, Ask me now, Record a
// value): why it is closed and what opens it, for each state, and that the form opens by itself once the gate does. The
// gate itself is the core's, tried against the database.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteGate } from "@ziffr/core/invite-gate";

const { gateNow } = vi.hoisted(() => ({ gateNow: vi.fn() }));
vi.mock("@/app/team-actions", () => ({ inviteGateNow: gateNow }));
vi.mock("@/app/series-actions", () => ({ askMeNow: async () => ({}), recordValue: async () => ({}) }));
vi.mock("@/app/value-note-actions", () => ({ saveFormNote: async () => ({ saved: true, detail: "Your note was saved." }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {}, message() {} } }));
import { InviteLock, seeGate, useInviteGate } from "./invite-lock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const offer = { metricId: 7, name: "Cash at hand", rule: "One value per period", periods: [{ start: "2026-11-01", label: "November 2026", has: null }], placeholder: "1,200", numberStyle: "en" } as never;
const waiting = (metric: Extract<InviteGate, { state: "waiting" }>["metric"], you = true): InviteGate => ({ state: "waiting", you, metric });
const both = { id: 7, name: "Cash at hand", slug: "cash-at-hand", canAsk: true, offer };
const html = (gate: InviteGate) => renderToStaticMarkup(<InviteLock gate={gate} was={null} id="why" />).replaceAll("&#x27;", "'");
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, "").trim());

describe("an Owner whose first value is still missing", () => {
  it("reads why, and gets Ask me now and Record a value for a Metric they send values for", () => {
    const h = html(waiting(both));
    expect(h).toContain("Invitations are not open yet");
    expect(h).toContain("an email to an address nobody has confirmed yet");
    expect(h).toContain("press Ask me now and reply to the request, or record the value here");
    expect(h).toContain("Values from a Feed or an Import do not count.");
    expect(h).toContain('href="/metrics/cash-at-hand"');
    expect(buttons(h)).toEqual(["Ask me now", "Record a value"]);
  });
  it("is offered only what they can do", () => {
    expect(buttons(html(waiting({ ...both, canAsk: false })))).toEqual(["Record a value"]);
    expect(html(waiting({ ...both, canAsk: false }))).toContain("yourself: record it here.");
    expect(buttons(html(waiting({ ...both, offer: null })))).toEqual(["Ask me now"]);
  });
  it("with no Metric to send, is told to make one or take the First Metric step", () => {
    const h = html(waiting(null));
    expect(h).toContain("You do not send values for any Metric yet");
    expect(h).toContain('href="/metrics/new"');
    expect(h).toContain('href="/setup?step=first_metric"');
  });
});

describe("the other closed states", () => {
  it("tells an Admin that an Owner has to send the value, with nothing to press", () => {
    const h = html(waiting(null, false));
    expect(h).toContain("An Owner of this Workspace opens invitations");
    expect(buttons(h)).toEqual([]);
    expect(h).not.toContain("/metrics/new");
  });
  it("says a trial has ended", () => expect(html({ state: "ended" })).toContain("This trial has ended, so nobody can be invited any more."));
  it("says how many a trial holds and how to free a place, linking to Members except there", () => {
    const h = html({ state: "full", limit: 5 });
    expect(h).toContain("at most 5 people");
    expect(h).toContain("revoke an open invitation or remove a person");
    expect(h).toContain('href="/team"');
    expect(renderToStaticMarkup(<InviteLock gate={{ state: "full", limit: 5 }} was={null} id="why" onMembers />)).not.toContain('href="/team"');
  });
  it("says nothing when open, and says so when it has just opened", () => {
    expect(html({ state: "open" })).toBe("");
    const opened = seeGate({ gate: waiting(null), was: null }, { state: "open" });
    expect(opened.was).toBe("waiting");
    expect(seeGate(opened, { state: "open" }).was).toBe("waiting");
    expect(seeGate(opened, { state: "full", limit: 5 }).was).toBeNull();
    expect(renderToStaticMarkup(<InviteLock {...opened} id="why" />)).toContain("Invitations are open now");
    expect(renderToStaticMarkup(<InviteLock gate={{ state: "open" }} was="full" id="why" />)).toContain("There is a free place again");
  });
});

function Form() {
  const invites = useInviteGate();
  return <><InviteLock {...invites} id="why" /><input disabled={invites.closed} /></>;
}

describe("a closed form", () => {
  let host: HTMLElement; let root: Root;
  beforeEach(() => { vi.useFakeTimers(); gateNow.mockReset(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

  it("opens by itself once the value has arrived, says so, and then stops looking", async () => {
    gateNow.mockResolvedValue(waiting(null));
    await act(async () => root.render(<Form />));
    expect(host.querySelector("input")!.disabled).toBe(true);
    gateNow.mockResolvedValue({ state: "open" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(host.querySelector("input")!.disabled).toBe(false);
    expect(host.textContent).toContain("Invitations are open now");
    const looks = gateNow.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(gateNow.mock.calls.length).toBe(looks);
  });
  it("reads again at once after Ask me now, and otherwise only every 30 seconds", async () => {
    gateNow.mockResolvedValue(waiting(both));
    await act(async () => root.render(<Form />));
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(gateNow).toHaveBeenCalledTimes(1);
    gateNow.mockResolvedValue({ state: "open" });
    await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === "Ask me now")!.click(); });
    expect(gateNow).toHaveBeenCalledTimes(2);
    expect(host.querySelector("input")!.disabled).toBe(false);
  });
  it("stays usable when the gate cannot be read: the core refuses in its own words", async () => {
    gateNow.mockResolvedValue({ error: "No." });
    await act(async () => root.render(<Form />));
    expect(host.querySelector("input")!.disabled).toBe(false);
    expect(host.textContent).toBe("");
  });
});
