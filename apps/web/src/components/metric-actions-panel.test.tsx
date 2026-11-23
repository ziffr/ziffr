// @vitest-environment happy-dom
// The "N open" mark in a Widget's header (spec 0050): a button with a name that says how many and for what, which opens
// the Actions panel for the Widget's Metrics through the address. The server action is replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/metric-actions-actions", () => ({ metricActions: async () => [] }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search), usePathname: () => window.location.pathname }));
import { isViewLinkPath, OpenActionsButton } from "./metric-actions-panel";
import { actionsPanel } from "@/lib/panel-param";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement; let root: Root;
afterEach(() => { act(() => root.unmount()); host.remove(); window.history.replaceState(null, "", "/"); });

describe("OpenActionsButton", () => {
  it("is a button named by the count and the Widget, and opens the Actions of its Metrics", async () => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root.render(<OpenActionsButton slugs={["revenue", "costs"]} count={3} label="3 open questions or tasks for Revenue" />); });
    const b = host.querySelector("button")!;
    expect(b.getAttribute("aria-label")).toBe("3 open questions or tasks for Revenue");
    expect(b.getAttribute("type")).toBe("button");
    await act(async () => { b.click(); });
    expect(new URL(window.location.href).searchParams.get("panel")).toBe(actionsPanel(["revenue", "costs"]));
  });
});

describe("isViewLinkPath", () => {
  it("is true on a View Link page only", () => {
    expect(isViewLinkPath("/v/abc")).toBe(true);
    expect(isViewLinkPath("/dashboards/1")).toBe(false);
    expect(isViewLinkPath("/vision")).toBe(false);
  });
});
