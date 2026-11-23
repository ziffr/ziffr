// @vitest-environment happy-dom
// The "Send feedback" entry of the user menu (spec 0049, ticket #916): there only when the layout says this is hosted
// Ziffr, and it opens the form in the side panel.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboards", useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/feedback-actions", () => ({ sendFeedback: async () => ({}), myFeedback: async () => [] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/viewer", () => ({}));
vi.mock("@/lib/auth", () => ({}));vi.mock("@/app/auth-actions", () => ({ signOut: async () => {} }));
vi.mock("@/app/actions", () => ({ setViewer: async () => {}, switchWorkspace: async () => {} }));
import { AppShell } from "./app-shell";
import type { Account } from "./nav-parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!window.matchMedia) window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

let host: HTMLElement; let root: Root;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const account = (sendFeedback: boolean): Account => ({ name: "Sara", workspaces: [{ id: "w", name: "Acme" }], current: "w", sendFeedback });
async function openMenu(sendFeedback: boolean) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<AppShell workspace={[]} settings={[]} pinned={[]} due={0} account={account(sendFeedback)} guide="/guide" collapsed={false}>page</AppShell>); });
  const trigger = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.title === "Sara")!;
  await act(async () => { trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); trigger.click(); });
  await tick();
}
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("the user menu", () => {
  it("has Send feedback on hosted Ziffr, and it opens the form in the side panel", async () => {
    await openMenu(true);
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.includes("Send feedback"));
    expect(item).toBeDefined();
    await act(async () => item!.click()); await tick();
    expect(document.querySelector("[data-slide-over]")!.textContent).toContain("Your words");
  });

  it("does not have it anywhere else", async () => {
    await openMenu(false);
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((i) => i.textContent);
    expect(items.some((t) => t?.includes("Sign out"))).toBe(true);
    expect(items.some((t) => t?.includes("Send feedback"))).toBe(false);
  });
});
