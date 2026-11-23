// @vitest-environment happy-dom
// Where a widget's target chip is drawn (views/header-status.tsx): in a frame it is reported to the header and the body keeps
// a copy that the frame's width hides; without a frame it is drawn where the design puts it, as before.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderStatusProvider, StatusChip, type HeaderStatus } from "./header-status";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chip: HeaderStatus = {
  metric: { target_min: 100, target_max: null, polarity: "higher", unit: "€", unit_position: "after", format: "number", decimals: 0 } as HeaderStatus["metric"],
  value: 90, numberStyle: "1,234.5",
};
let host: HTMLElement; let root: Root;
const mount = async (node: React.ReactNode) => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); await act(async () => { root.render(node); }); };
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("StatusChip", () => {
  it("draws the chip itself where there is no frame to report to", async () => {
    await mount(<StatusChip {...chip} />);
    expect(host.textContent).toMatch(/Too low/);
    expect(host.querySelector(".contents")).toBeNull();
  });

  it("reports its values to the frame's header, and keeps a copy for a card too narrow for the header's", async () => {
    const publish = vi.fn();
    await mount(<HeaderStatusProvider value={publish}><StatusChip {...chip} /></HeaderStatusProvider>);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ value: 90 }));
    // The body's copy hides itself once the frame is wide enough (a container query), never by script.
    expect(host.querySelector("span.contents")?.className).toContain("@min-[16rem]/frame:hidden");
    expect(host.textContent).toMatch(/Too low/);
  });

  it("takes its report back when it goes, so a header never keeps a chip of a view that was changed", async () => {
    const publish = vi.fn();
    await mount(<HeaderStatusProvider value={publish}><StatusChip {...chip} /></HeaderStatusProvider>);
    publish.mockClear();
    await act(async () => { root.render(<HeaderStatusProvider value={publish}><div /></HeaderStatusProvider>); });
    expect(publish).toHaveBeenCalledWith(null);
  });
});
