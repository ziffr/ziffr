// @vitest-environment happy-dom
// The home screen hint (spec 0055; GLOSSARY: Installed app): once, on a phone, after signing in, and never on top of
// another first-visit nudge.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHONE_TOUCH } from "@/lib/use-media";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
import { HomeScreenHint } from "./home-screen-hint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let matching: string[] = [];
// The browser's store, made by hand: newer Node has a global of the same name that hides the test browser's.
let stored = new Map<string, string>();
let blocked = false;
const storage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error("blocked");
    stored.set(k, v);
  },
};
const hint = () => host.querySelector("section");
const show = (wait = false) => act(async () => root.render(<HomeScreenHint wait={wait} />));
/** Ziffr opened again: a fresh page in the same browser. */
async function reopen(wait = false) {
  await act(async () => root.unmount());
  root = createRoot(host);
  await show(wait);
}

beforeEach(() => {
  path = "/";
  matching = [PHONE_TOUCH];
  stored = new Map();
  blocked = false;
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  vi.spyOn(window, "matchMedia").mockImplementation((q) => ({ matches: matching.includes(q) }) as MediaQueryList);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeScreenHint", () => {
  it("says on a phone how to add Ziffr, once and not again", async () => {
    await show();
    expect(hint()?.textContent).toContain("Add Ziffr to your home screen");
    expect(hint()?.textContent).toContain("iPhone:");
    expect(hint()?.textContent).toContain("Android:");
    await reopen();
    expect(hint()).toBeNull();
  });

  it("closes with Got it", async () => {
    await show();
    await act(async () => hint()!.querySelector("button")!.click());
    expect(hint()).toBeNull();
  });

  it("does not follow the person to another page, nor come back with the first one", async () => {
    await show();
    path = "/metrics";
    await show();
    expect(hint()).toBeNull();
    path = "/";
    await show();
    expect(hint()).toBeNull();
  });

  it("waits for a later opening while the Setup line is shown, also after it is hidden", async () => {
    await show(true);
    await show(false);
    path = "/metrics";
    await show(false);
    expect(hint()).toBeNull();
    await reopen(false);
    expect(hint()).not.toBeNull();
  });

  it.each(["/setup", "/submit/abc", "/schedule/submit/orders", "/settings/profile", "/decks/3"])("keeps off %s, and for the rest of that opening", async (at) => {
    path = at;
    await show();
    expect(hint()).toBeNull();
    path = "/";
    await show();
    expect(hint()).toBeNull();
    await reopen();
    expect(hint()).not.toBeNull();
  });

  it.each(["/dashboards", "/dashboards/12", "/metrics", "/schedule"])("also arrives at %s", async (at) => {
    path = at;
    await show();
    expect(hint()).not.toBeNull();
  });

  it("says nothing on a larger screen, and keeps its turn for the phone", async () => {
    matching = [];
    await show();
    expect(hint()).toBeNull();
    matching = [PHONE_TOUCH];
    await reopen();
    expect(hint()).not.toBeNull();
  });

  it("says nothing in the installed app", async () => {
    matching = [PHONE_TOUCH, "(display-mode: standalone)"];
    await show();
    expect(hint()).toBeNull();
  });

  it("says nothing where the browser keeps nothing, as it could not stop saying it", async () => {
    blocked = true;
    await show();
    expect(hint()).toBeNull();
  });
});
