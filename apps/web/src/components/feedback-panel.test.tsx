// @vitest-environment happy-dom
// The feedback form in the side panel (spec 0049, ticket #916): the notice, the counter, the checks before sending, the
// success and refusal states and My feedback. The server actions are replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendFeedback = vi.fn();
const myFeedback = vi.fn();
vi.mock("@/app/feedback-actions", () => ({ sendFeedback: (...a: unknown[]) => sendFeedback(...a), myFeedback: () => myFeedback() }));
import { FeedbackPanel } from "./feedback-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = async () => { await act(async () => { root.render(<FeedbackPanel route="/dashboards/4" />); }); await flush(); };
const area = () => host.querySelector<HTMLTextAreaElement>("#feedback-words")!;
const radio = (k: string) => host.querySelector<HTMLInputElement>(`input[value="${k}"]`)!;
const submit = () => host.querySelector<HTMLFormElement>("form")!;
// React tracks the value itself: set it through the native setter so onChange fires.
const type = async (text: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area(), text);
    area().dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const send = () => act(async () => { submit().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  sendFeedback.mockReset(); myFeedback.mockReset(); myFeedback.mockResolvedValue([]);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("FeedbackPanel", () => {
  it("says the words are public, that name and Workspace data are never sent, and what Ziffr adds", async () => {
    await render();
    const notice = host.querySelector("#feedback-notice")!.textContent!;
    expect(notice).toContain("public on GitHub");
    expect(notice).toContain("name");
    expect(notice).toContain("never sent");
    expect(notice).toContain("page you are on");
    expect(notice).toContain("version");
  });

  it("offers the three kinds as a radio group with named controls", async () => {
    await render();
    expect([...host.querySelectorAll('input[name="feedback-kind"]')].map((i) => (i as HTMLInputElement).value)).toEqual(["problem", "idea", "question"]);
    expect(host.querySelector("legend")!.textContent).toBe("What is it?");
    expect(host.querySelector('label[for="feedback-words"]')).not.toBeNull();
  });

  it("counts the characters against the server's maximum", async () => {
    await render();
    expect(host.querySelector("#feedback-count")!.textContent).toBe("0 of 2000 characters");
    await type("hello");
    expect(host.querySelector("#feedback-count")!.textContent).toBe("5 of 2000 characters");
  });

  it("asks for a kind and for words before anything is sent", async () => {
    await render();
    await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Choose what kind of feedback this is.");
    await act(async () => radio("idea").click());
    await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Write what you want to tell us.");
    await type("x".repeat(2001));
    await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Keep it under 2000 characters.");
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it("sends the kind, the words and the page, then thanks the person and reloads My feedback", async () => {
    sendFeedback.mockResolvedValue({ id: "a" });
    await render();
    await act(async () => radio("problem").click());
    await type("The chart is empty");
    await send();
    expect(sendFeedback).toHaveBeenCalledWith({ kind: "problem", words: "The chart is empty", route: "/dashboards/4" });
    expect(host.querySelector('[role="status"]')!.textContent).toContain("Thank you.");
    expect(host.querySelector("form")).toBeNull();
    expect(myFeedback).toHaveBeenCalledTimes(2);
  });

  it("shows the server's refusal (a limit, the demo) as words and keeps what was written", async () => {
    sendFeedback.mockResolvedValue({ error: "That is enough feedback for today. Please try again tomorrow." });
    await render();
    await act(async () => radio("idea").click());
    await type("More charts");
    await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("That is enough feedback for today. Please try again tomorrow.");
    expect(area().value).toBe("More charts");
  });

  it("lists My feedback with kind, first words, status as words and the day", async () => {
    myFeedback.mockResolvedValue([{ id: "a", kind: "idea", words: "More  charts\nplease", route: null, appVersion: null, status: "waiting_for_review", createdAt: "2026-11-20T10:00:00Z" }]);
    await render();
    const li = host.querySelector("section li")!;
    expect(li.textContent).toContain("More charts please");
    expect(li.textContent).toContain("An idea, waiting for review, sent");
  });

  it("says so when there is nothing yet, and when the list cannot be read", async () => {
    await render();
    expect(host.querySelector("section")!.textContent).toContain("You have not sent any feedback yet.");
    act(() => root.unmount());
    root = createRoot(host);
    myFeedback.mockResolvedValue({ error: "You may not do that here." });
    await render();
    expect(host.querySelector("section")!.textContent).toContain("You may not do that here.");
  });
});
