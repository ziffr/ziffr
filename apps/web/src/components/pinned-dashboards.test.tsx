// @vitest-environment happy-dom
// The Pin button in the demo (ticket #764): it looks off, says why, and never calls the server.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const pin = vi.fn(async () => undefined);
const info = vi.fn();
vi.mock("@/app/pin-actions", () => ({ pinDashboard: () => pin(), unpinDashboard: () => pin(), reorderPinned: () => pin() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { info: (m: string) => info(m), error: vi.fn(), success: vi.fn() } }));
import { PIN_OFF_IN_DEMO, PinButton } from "./pinned-dashboards";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement; let root: Root;
async function mount(demo: boolean, compact = false) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<PinButton dashboardId={1} name="Sales" pinned={false} demo={demo} compact={compact} />); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); pin.mockClear(); info.mockClear(); });

describe("the Pin button in the demo", () => {
  for (const compact of [false, true]) {
    it(`${compact ? "compact" : "full"}: shows as off, says why on tap and calls nothing`, async () => {
      await mount(true, compact);
      const b = host.querySelector("button")!;
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.title).toBe(PIN_OFF_IN_DEMO);
      await act(async () => { b.click(); });
      expect(info).toHaveBeenCalledWith(PIN_OFF_IN_DEMO);
      expect(pin).not.toHaveBeenCalled();
    });
  }
  it("outside the demo it pins as before", async () => {
    await mount(false);
    const b = host.querySelector("button")!;
    expect(b.getAttribute("aria-disabled")).toBeNull();
    await act(async () => { b.click(); });
    expect(pin).toHaveBeenCalled();
  });
});
