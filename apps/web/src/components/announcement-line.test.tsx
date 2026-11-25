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

/** The Dismiss button of a line (the phone's "show all" chevron comes first, so find it by its name). */
const dismissButton = (el: ParentNode) => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Dismiss this announcement")) ?? null;

const draw = (scope: string) => act(() => root.render(<AnnouncementLine items={items} scope={scope} extra={{ "demo-reset": <span> Resets in 9 min.</span> }} />));

describe("AnnouncementLine", () => {
  it("shows the words, the live part and a named Dismiss button", () => {
    draw("s1");
    expect(host.querySelector("section")?.getAttribute("aria-label")).toBe("Announcement");
    expect(host.textContent).toContain("This is a shared demo. Resets in 9 min.");
    expect(dismissButton(host)).not.toBeNull();
  });
  it("is gone after Dismiss and stays gone for the visit, but comes back for a new one", () => {
    draw("s1");
    act(() => dismissButton(host)!.click());
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

describe("AnnouncementLine with several", () => {
  const several = [
    { id: "w", text: "Down at six.", level: "warning" as const, dismissible: false },
    { id: "i1", text: "One." },
    { id: "i2", text: "Two." },
    { id: "i3", text: "Three.", link: { href: "https://status.example.org/", label: "Status" } },
  ];
  const drawMany = () => act(() => root.render(<AnnouncementLine items={several} scope="s1" />));
  it("keeps the order, says Warning in words, and gives the line that cannot be dismissed no button", () => {
    drawMany();
    const lines = [...host.querySelectorAll("section")];
    expect(lines.length).toBe(3);
    expect(lines[0].textContent).toContain("Warning: Down at six.");
    expect(dismissButton(lines[0])).toBeNull();
    expect(dismissButton(lines[1])).not.toBeNull();
  });
  it("shows three and the rest behind a named button, and dismissing one lets the next in", () => {
    drawMany();
    const more = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("more"));
    expect(more?.textContent).toBe("+1 more announcement");
    act(() => dismissButton(host.querySelectorAll("section")[1])!.click());
    expect(host.textContent).not.toContain("One.");
    expect(host.textContent).toContain("Three.");
    expect(host.textContent).not.toContain("+1 more");
    // A phone shows one line and says how many are behind "+N more".
    expect(host.textContent).toContain("+2 more announcements");
  });
  it("opens an external link in a new tab safely, and renders markup as plain text", () => {
    act(() => root.render(<AnnouncementLine items={[{ id: "x", text: "<b>bold</b> [x](y)", link: { href: "https://status.example.org/", label: "Status" } }]} scope="s1" />));
    expect(host.querySelector("b")).toBeNull();
    expect(host.textContent).toContain("<b>bold</b> [x](y)");
    const link = host.querySelector("a")!;
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("opens a link inside the app in the same tab", () => {
    act(() => root.render(<AnnouncementLine items={[{ id: "x", text: "Demo.", link: { href: "/demo/leave", label: "Leave" } }]} scope="s1" />));
    expect(host.querySelector("a")!.getAttribute("target")).toBeNull();
  });
});
