// @vitest-environment happy-dom
// The desktop-only message (spec 0055; GLOSSARY: Screen Link): what it says, its two buttons, that pressing "Send me
// the link" names only the path, and that it is for phones only. The core's rules are in screen-link.db.test.ts.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendScreenLink = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/app/connector-actions", () => ({ sendScreenLink: (...args: unknown[]) => sendScreenLink(...args) }));
import { LargerScreenNote, type Look } from "./larger-screen-note";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
beforeEach(() => { sendScreenLink.mockReset(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const show = (path: string, send: boolean, look?: Look) => act(async () => root.render(<LargerScreenNote path={path} send={send} look={look} />));
const byText = (text: string) => [...host.querySelectorAll<HTMLElement>("button, a")].find((b) => b.textContent!.includes(text));
const press = async (text: string) => { await act(async () => { byText(text)!.click(); await new Promise((r) => setTimeout(r, 0)); }); };

describe("LargerScreenNote", () => {
  it("says it is easier on a larger screen, why, and offers both ways on, on a phone only", async () => {
    await show("/decks/3", true, { href: "/decks/3/present" });
    const note = host.querySelector('[role="note"]')!;
    expect(note.className).toContain("sm:hidden");
    expect(note.textContent).toContain("This is easier on a larger screen.");
    expect(note.textContent).toContain("On a phone you can read and present this deck.");
    expect(byText("Send me the link")).toBeTruthy();
    expect(byText("Look at it")!.getAttribute("href")).toBe("/decks/3/present");
  });

  it("sends the path and nothing else, says what became of it and does not send twice", async () => {
    sendScreenLink.mockResolvedValue({ state: "sent", words: "Sent. Look in your email." });
    await show("/analyze", true);
    await press("Send me the link");
    expect(sendScreenLink.mock.calls).toEqual([["/analyze"]]);
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Sent. Look in your email.");
    expect((byText("Send me the link") as HTMLButtonElement).disabled).toBe(true);
    expect(byText("Look at it")).toBeUndefined();
  });

  it("shows a refusal's words and lets the person try again", async () => {
    sendScreenLink.mockResolvedValue({ error: "Guests cannot send themselves links." });
    await show("/connectors/send", true);
    await press("Send me the link");
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Guests cannot send themselves links.");
    expect((byText("Send me the link") as HTMLButtonElement).disabled).toBe(false);
  });

  it("runs what looking means on the screen itself", async () => {
    const onLook = vi.fn();
    await show("/dashboards/1", false, { onLook });
    expect(byText("Send me the link")).toBeUndefined();
    await press("Look at it");
    expect(onLook).toHaveBeenCalledOnce();
  });

  it("shows nothing for a screen that is not made for a larger screen", async () => {
    await show("/metrics", true);
    expect(host.innerHTML).toBe("");
  });
});
