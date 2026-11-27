// @vitest-environment happy-dom
// The screens after a guided Pack set-up (spec 0068, #1345; GLOSSARY: Pack, Invitation, Position, Approver): the first
// number that comes before the invitations, nothing sent before its button, and a change of who approves that is read
// before it is made. The server is stood in for.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PackInvite } from "@ziffr/core/pack-after-invite";
import { HolderTask } from "./holder-task";
import { InvitePanel, type InviteActions } from "./invite";
import { ProvidersTask } from "./providers-task";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); window.scrollTo = () => {}; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const show = async (node: React.ReactNode) => { await act(async () => root.render(node)); await tick(); };
const text = () => host.textContent ?? "";
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
const press = async (name: string) => { await act(async () => button(name).click()); await tick(); };
const boxes = () => [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
async function type(field: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const people: PackInvite["people"] = [
  { id: "lea", name: "Lea", role: "member", state: "open" }, { id: "sam", name: "Sam", role: "guest", state: "open" }, { id: "kim", name: "Kim", role: "guest", state: "open" },
];
const view = (over: Partial<PackInvite> = {}): PackInvite => ({ pack: "Sales forecast", first: null, checks: [], closed: null, people, places: null, mail: true, ...over });

describe("the first number and the invitations", () => {
  it("asks for the number first, says why, and then offers the invitations without sending any", async () => {
    let now = view({ first: { you: true, numbers: [{ id: 4, name: "Commit", unit: "€", period: "week 48", whose: null }], choose: false }, places: 2 });
    const actions: InviteActions = {
      read: vi.fn(async () => now),
      send: vi.fn(async () => { now = view({ places: 2 }); return { ok: true, detail: "Recorded 5." }; }),
      confirm: vi.fn(),
      invite: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, name: id, state: "link" as const, words: "Not emailed. Send them this link.", link: `https://example.test/invite/${id}` }))),
    };
    await show(<InvitePanel actions={actions} providersHref="/use-pack/3/providers" />);
    expect(text()).toContain("Needed before colleagues can be emailed. Then you can invite Lea, Sam, Kim.");
    expect(text()).not.toContain("This will count as");
    expect(button("Invite them")).toBeUndefined();
    await type(host.querySelector("input")!, "5");
    await press("Record value");
    expect(actions.send).toHaveBeenCalledWith(4, "5");
    expect(text()).toContain("Your number is on record.");
    expect(actions.invite).not.toHaveBeenCalled();
    // Only as many are ticked as there are places, whoever needs a role first.
    expect(boxes().map((b) => b.checked)).toEqual([true, true, false]);
    await press("Invite them");
    expect(actions.invite).toHaveBeenCalledWith(["lea", "sam"]);
    expect(host.querySelectorAll("input[readonly]")).toHaveLength(2);
  });

  it("closes the loop where no number can be typed yet, and keeps a refusal beside its person", async () => {
    const none: InviteActions = { read: async () => view({ first: { you: true, numbers: [], choose: true } }), send: vi.fn(), confirm: vi.fn(), invite: vi.fn() };
    await show(<InvitePanel actions={none} providersHref="/use-pack/3/providers" />);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/use-pack/3/providers");
    act(() => root.unmount()); root = createRoot(host);
    const refusing: InviteActions = { read: async () => view({ people: people.slice(0, 1) }), send: vi.fn(), confirm: vi.fn(), invite: async () => [{ id: "lea", name: "Lea", state: "refused", words: "This trial is full.", link: null }] };
    await show(<InvitePanel actions={refusing} providersHref="/x" />);
    await press("Invite them");
    expect(host.querySelector("li")?.textContent).toContain("This trial is full.");
    expect(button("Invite them").disabled).toBe(true);
  });
});

describe("what could keep the loop open", () => {
  it("says whose number a colleague's becomes before it is sent", async () => {
    const actions: InviteActions = { read: async () => view({ first: { you: true, numbers: [{ id: 4, name: "Commit, Sam", unit: "€", period: "week 48", whose: "Sam" }], choose: false } }), send: vi.fn(), confirm: vi.fn(), invite: vi.fn() };
    await show(<InvitePanel actions={actions} providersHref="/x" />);
    expect(text()).toContain("This will count as Sam’s number for week 48.");
    expect(actions.send).not.toHaveBeenCalled();
  });

  it("shows a value that waits for the person's check, with the button that confirms it", async () => {
    let now = view({ people: [], checks: [{ actionId: 8, metric: "Commit, Sam", value: "12,500 €", period: "week 48" }] });
    const actions: InviteActions = { read: async () => now, send: vi.fn(), invite: vi.fn(), confirm: vi.fn(async () => { now = view({ people: [] }); return { words: "Confirmed by you." }; }) };
    await show(<InvitePanel actions={actions} providersHref="/x" />);
    expect(text()).toContain("Waits for your check: 12,500 €");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/actions/8");
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Yes, it is right"))!.click());
    await tick();
    expect(actions.confirm).toHaveBeenCalledWith(8);
    expect(text()).toContain("Confirmed by you.");
    expect(text()).not.toContain("Waits for your check");
  });

  it("says why nobody can be invited, also at the end of a set-up", async () => {
    const actions: InviteActions = { read: async () => view({ closed: "Your trial holds 5 people, and every place is taken." }), send: vi.fn(), confirm: vi.fn(), invite: vi.fn() };
    await show(<InvitePanel actions={actions} providersHref="/x" />);
    expect(text()).toContain("every place is taken");
    expect(button("Invite them")).toBeUndefined();
  });
});

describe("choosing providers and who approves", () => {
  it("has no Nobody for now, and says what changes before saving", async () => {
    const save = vi.fn(async () => ({ numbers: 1, asked: [{ id: "me", name: "Mia", you: true, from: "2026-11-30" }], invite: false, notes: [] }));
    await show(<ProvidersTask view={{ pack: "Finance", numbers: [{ id: 1, name: "Revenue", workflow: "Month close", opens: true }], me: { id: "me", name: "Mia" }, people: [], practice: false, trial: false, max: 5, mail: true }} save={save} inviteHref="/i" done="/p" />);
    expect(text()).not.toContain("Nobody for now");
    expect(text()).toContain("Asked by the Workflow “Month close”: Revenue.");
    expect(text()).toContain("The web form, email, Slack and Telegram open for Revenue.");
    expect(save).not.toHaveBeenCalled();
    await press("Save");
    expect(save).toHaveBeenCalledWith([{ who: "me" }]);
    expect(text()).toContain("Nothing was sent just now.");
  });

  it("shows the changes first and sends only the ticked Shares with the plan's mark", async () => {
    const plan = vi.fn(async () => ({ changes: ["Approves in “Weekly”: Ben instead of You."], shares: [{ id: "dashboard 2 viewer", words: "Ben can see the dashboard “Forecast”", showsMore: true, suggested: false }], byHand: [], notes: [], problem: null, mark: "m" }));
    const change = vi.fn(async () => ({ changed: ["Approves in “Weekly”: Ben instead of You."], byHand: [] }));
    await show(<HolderTask view={{ pack: "Sales forecast", positions: [{ position: "sales-lead", name: "Sales lead", line: null, holders: ["You"], heldFor: "Lea" }], members: [{ id: "ben", name: "Ben", you: false }] }} actions={{ plan, change }} done="/p" />);
    expect(button("See what changes").disabled).toBe(true);
    await type(host.querySelector("select")!, "ben");
    await press("See what changes");
    expect(change).not.toHaveBeenCalled();
    expect(boxes().map((b) => b.checked)).toEqual([false]);
    await press("Make these changes");
    expect(change).toHaveBeenCalledWith({ position: "sales-lead", line: null, person: "ben", shares: [], mark: "m" });
    expect(text()).toContain("Changed");
  });
});
