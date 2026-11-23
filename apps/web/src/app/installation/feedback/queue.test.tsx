// @vitest-environment happy-dom
// The review queue (spec 0049, ticket #919): what the table shows, that nothing about the sender is in it, and which
// call each button makes. The server actions are replaced; the rules and the role gate are tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const approve = vi.fn(async (_id: string, _words?: string): Promise<{ error: string } | { ok: true }> => ({ ok: true }));
const reject = vi.fn(async (_id: string, _reason: string): Promise<{ error: string } | { ok: true }> => ({ ok: true }));
vi.mock("@/app/installation-feedback-actions", () => ({ approveFeedbackAction: (i: string, w?: string) => approve(i, w), rejectFeedbackAction: (i: string, r: string) => reject(i, r) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("sonner", () => ({ toast: { success: () => undefined } }));
import { ReviewQueue } from "./queue";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = { id: "11111111-1111-4111-8111-111111111111", kind: "problem", words: "The chart is wrong.", route: "/metrics/:name", appVersion: "0.11.0", createdAt: "2027-01-24" };
let host: HTMLElement; let root: Root;
const button = (label: RegExp) => [...host.querySelectorAll("button")].find((b) => label.test(b.textContent ?? "")) as HTMLButtonElement;
const click = async (label: RegExp) => { await act(async () => { button(label).click(); }); };
async function mount(items = [item]) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<ReviewQueue items={items} />); });
}
async function type(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => { approve.mockClear(); reject.mockClear(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("the queue", () => {
  it("shows kind, words, page, version and day, and says so when empty", async () => {
    await mount();
    const text = host.textContent ?? "";
    for (const part of ["problem", "The chart is wrong.", "/metrics/:name", "0.11.0", "2027-01-24"]) expect(text).toContain(part);
    act(() => root.unmount()); host.remove();
    await mount([]);
    expect(host.textContent).toContain("Nothing is waiting for review.");
  });
  it("approves with one click", async () => {
    await mount();
    await click(/^Approve$/);
    expect(approve).toHaveBeenCalledWith(item.id, undefined);
  });
  it("sends edited words with the approval", async () => {
    await mount();
    await click(/^Edit$/);
    await type(host.querySelector("textarea")!, "The chart shows the wrong total.");
    await click(/Approve edited words/);
    expect(approve).toHaveBeenCalledWith(item.id, "The chart shows the wrong total.");
  });
  it("cannot reject without a reason, and sends it when there is one", async () => {
    await mount();
    await click(/^Reject$/);
    expect(button(/Reject with this reason/).disabled).toBe(true);
    await type(host.querySelector("textarea")!, "Not about Ziffr.");
    await click(/Reject with this reason/);
    expect(reject).toHaveBeenCalledWith(item.id, "Not about Ziffr.");
  });
  it("shows the core's refusal and keeps the row", async () => {
    approve.mockResolvedValueOnce({ error: "That feedback is not waiting for review any more." });
    await mount();
    await click(/^Approve$/);
    expect(host.querySelector("[role=alert]")?.textContent).toContain("not waiting");
  });
});
