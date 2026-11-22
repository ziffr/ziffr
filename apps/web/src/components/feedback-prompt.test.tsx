// @vitest-environment happy-dom
// The Feedback Prompt card (ticket #722): what each answer does on screen and which calls it makes. The server actions
// are replaced, so this checks the card alone; the rules behind it are tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shown = vi.fn(async () => undefined);
const stop = vi.fn(async (_a: "starred" | "never") => undefined);
const missing = vi.fn(async (_w: string): Promise<void | { error: string }> => undefined);
vi.mock("@/app/feedback-prompt-actions", () => ({ feedbackPromptShown: () => shown(), stopFeedbackPrompt: (a: "starred" | "never") => stop(a), sayWhatIsMissing: (w: string) => missing(w) }));
import { FeedbackPrompt } from "./feedback-prompt";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
const text = () => host.textContent ?? "";
const button = (label: RegExp) => [...host.querySelectorAll("button, a")].find((b) => label.test(b.textContent ?? "")) as HTMLElement;
async function mount(askForStar = true) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<FeedbackPrompt askForStar={askForStar} />); });
}
const click = async (label: RegExp) => { await act(async () => { button(label).click(); }); };

beforeEach(() => { sessionStorage.clear(); shown.mockClear(); stop.mockClear(); missing.mockClear(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("the card", () => {
  it("asks once, tells the server it was shown, and not again in the same session", async () => {
    await mount();
    expect(text()).toContain("Enjoying Ziffr?");
    expect(shown).toHaveBeenCalledTimes(1);
    act(() => root.unmount()); host.remove();
    await mount();
    expect(text()).toBe("");
    expect(shown).toHaveBeenCalledTimes(1);
  });
  it("a yes offers the repository on GitHub in a new tab and stops the card for good when followed", async () => {
    await mount();
    await click(/Yes/);
    const star = button(/Star on GitHub/) as HTMLAnchorElement;
    expect(star.getAttribute("href")).toBe("https://github.com/ziffr/ziffr");
    expect(star.getAttribute("target")).toBe("_blank");
    expect(star.getAttribute("rel")).toContain("noopener");
    expect(text()).toContain("tells GitHub nothing");
    star.addEventListener("click", (e) => e.preventDefault());
    await click(/Star on GitHub/);
    expect(stop).toHaveBeenCalledWith("starred");
    expect(text()).toContain("Thank you");
  });
  it("a yes after an earlier no is only thanked, with no request for a star", async () => {
    await mount(false);
    await click(/Yes/);
    expect(text()).toContain("Thank you");
    expect(text()).not.toContain("Star on GitHub");
  });
  it("a no asks what is missing, says who reads it, and sends the words", async () => {
    await mount();
    await click(/Not yet/);
    expect(text()).toContain("What is missing?");
    expect(text()).toContain("without your name");
    expect((button(/Send/) as HTMLButtonElement).disabled).toBe(true);
    const box = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "More charts");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(/Send/);
    expect(missing).toHaveBeenCalledWith("More charts");
    expect(text()).toContain("Thank you");
  });
  it("shows the server's reason when the words are refused", async () => {
    missing.mockResolvedValueOnce({ error: "Thank you, you have told us already." });
    await mount();
    await click(/Not yet/);
    const box = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "again");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(/Send/);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("told us already");
  });
  it("Not now closes it without a call, and Don't ask again ends it", async () => {
    await mount();
    await click(/Not now/);
    expect(text()).toBe("");
    expect(stop).not.toHaveBeenCalled();
    act(() => root.unmount()); host.remove(); sessionStorage.clear();
    await mount();
    await click(/Don.t ask again/);
    expect(stop).toHaveBeenCalledWith("never");
    expect(text()).toBe("");
  });
});
