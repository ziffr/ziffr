// @vitest-environment happy-dom
// The Announcement line: shown at first, gone after Dismiss, back for another visit, and fine without storage.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnnouncementLine } from "./announcement-line";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = [{ id: "demo-reset", text: "This is a shared demo." }];
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const draw = (scope: string) => act(() => root.render(<AnnouncementLine items={items} scope={scope} extra={{ "demo-reset": <span> Resets in 9 min.</span> }} />));

describe("AnnouncementLine", () => {
  it("shows the words, the live part and a named Dismiss button", () => {
    draw("s1");
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Announcement");
    expect(host.textContent).toContain("This is a shared demo. Resets in 9 min.");
    expect(host.querySelector("button")?.textContent).toContain("Dismiss this announcement");
  });
  it("is gone after Dismiss and stays gone for the visit, but comes back for a new one", () => {
    draw("s1");
    act(() => host.querySelector("button")!.click());
    expect(host.querySelector("section")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    draw("s1");
    expect(host.querySelector("section")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    draw("s2");
    expect(host.querySelector("section")).not.toBeNull();
  });
});
