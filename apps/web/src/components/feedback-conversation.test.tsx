// @vitest-environment happy-dom
// A feedback as a conversation in the side panel (spec 0049, ticket #918): the person's words, the team's answers as
// "The Ziffr team" in plain text, the reply box only while the feedback is open or answered, and its checks and states.
// The server actions are replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const myFeedback = vi.fn();
const myFeedbackThread = vi.fn();
const replyToMyFeedback = vi.fn();
vi.mock("@/app/feedback-actions", () => ({ sendFeedback: vi.fn(), myFeedback: () => myFeedback(), myFeedbackThread: (...a: unknown[]) => myFeedbackThread(...a), replyToMyFeedback: (...a: unknown[]) => replyToMyFeedback(...a) }));
import { FeedbackPanel } from "./feedback-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "11111111-2222-3333-4444-555555555555";
const row = (status: string) => ({ id: ID, kind: "problem", words: "The chart is wrong.", route: null, appVersion: null, status, createdAt: "2027-01-20T10:00:00Z" });
const thread = (status: string, messages: { fromTeam: boolean; words: string; at: string }[] = []) => ({ ...row(status), messages });
let host: HTMLElement; let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const area = () => host.querySelector<HTMLTextAreaElement>("#feedback-reply");
async function openIt(status: string, messages: { fromTeam: boolean; words: string; at: string }[] = []) {
  myFeedback.mockResolvedValue([row(status)]); myFeedbackThread.mockResolvedValue(thread(status, messages));
  await act(async () => { root.render(<FeedbackPanel route="/dashboards" />); }); await flush();
  await act(async () => { host.querySelector<HTMLButtonElement>("ul button")!.click(); }); await flush();
}
const type = async (text: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area(), text);
  area()!.dispatchEvent(new Event("input", { bubbles: true }));
});
const send = () => act(async () => { host.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { vi.clearAllMocks(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("a feedback as a conversation", () => {
  it("opens from My feedback and shows the person's words, then the answers as The Ziffr team and their own replies as You", async () => {
    await openIt("answered", [{ fromTeam: true, words: "Fixed, see [link](https://example.com).", at: "2027-01-21T10:00:00Z" }, { fromTeam: false, words: "Thanks!", at: "2027-01-22T10:00:00Z" }]);
    expect(myFeedbackThread).toHaveBeenCalledWith(ID);
    const items = [...host.querySelectorAll("ol li")].map((li) => li.textContent);
    expect(items[0]).toContain("You"); expect(items[0]).toContain("The chart is wrong.");
    expect(items[1]).toContain("The Ziffr team");
    expect(items[2]).toContain("You"); expect(items[2]).toContain("Thanks!");
  });

  it("shows the team's words as plain text: no link, no markup", async () => {
    await openIt("answered", [{ fromTeam: true, words: "<img src=x onerror=alert(1)> [x](https://evil.example)", at: "2027-01-21T10:00:00Z" }]);
    expect(host.querySelector("ol a")).toBeNull();
    expect(host.querySelector("ol img")).toBeNull();
    expect(host.querySelector("ol")!.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("has a named reply box with a counter and says the reply is public and posted without a name", async () => {
    await openIt("open");
    expect(host.querySelector('label[for="feedback-reply"]')!.textContent).toBe("Your reply");
    expect(host.querySelector("#feedback-reply-count")!.textContent).toBe("0 of 2000 characters");
    await type("abc");
    expect(host.querySelector("#feedback-reply-count")!.textContent).toBe("3 of 2000 characters");
    expect(host.querySelector("#feedback-reply-note")!.textContent).toMatch(/public/);
    expect(host.querySelector("#feedback-reply-note")!.textContent).toMatch(/without your name/);
  });

  it("offers the reply box for an answered feedback, and none for a closed one or one waiting for review", async () => {
    await openIt("answered"); expect(area()).not.toBeNull();
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await openIt("closed"); expect(area()).toBeNull(); expect(host.textContent).toContain("closed");
    act(() => root.unmount()); host.remove(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await openIt("waiting_for_review"); expect(area()).toBeNull();
  });

  it("checks the words before sending: empty and too long are told, nothing is sent", async () => {
    await openIt("open");
    await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("Write your reply first.");
    await type("x".repeat(2001)); await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("under 2000");
    expect(replyToMyFeedback).not.toHaveBeenCalled();
  });

  it("sends the reply, adds it to the conversation, empties the box and says it was saved", async () => {
    await openIt("answered");
    replyToMyFeedback.mockResolvedValue({ fromTeam: false, words: "Still broken.", at: "2027-01-23T10:00:00Z" });
    await type("Still broken."); await send();
    expect(replyToMyFeedback).toHaveBeenCalledWith({ id: ID, words: "Still broken." });
    expect(host.querySelector("ol")!.textContent).toContain("Still broken.");
    expect(area()!.value).toBe("");
    expect(host.querySelector('[role="status"]')!.textContent).toContain("saved");
  });

  it("tells the refusal in the server's plain words and keeps what was written", async () => {
    await openIt("open");
    replyToMyFeedback.mockResolvedValue({ error: "That is enough replies for now. Please try again tomorrow." });
    await type("One more"); await send();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("enough replies");
    expect(area()!.value).toBe("One more");
  });

  it("goes back to the list", async () => {
    await openIt("open");
    await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent === "Back to My feedback")!.click(); }); await flush();
    expect(host.querySelector("#my-feedback")).not.toBeNull();
  });
});
