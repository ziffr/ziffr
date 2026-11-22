// @vitest-environment happy-dom
// The popup on a chart's point (#789): what a Member, a Guest and a View Link see. The core decides the names (its own
// db test); here the card's loader is what it returns for each, and a View Link's read-only card provides none.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { ObservationDetails } from "@ziffr/core/observation-details";
import type { CanvasData } from "@ziffr/core/types";
import { ObservationDetailsProvider, ObservationTip, cachedLoader, type DetailsLoader } from "./observation-tip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const data: CanvasData = sampleCanvasData("v", "1.234,5");
const m = { ...data.metrics[0], target_min: 400, target_max: null, polarity: "higher" as const };
const period = data.series[m.slug].at(-1)!.period;
const withPending = { ...data, pending: { [m.id]: [period] } };

let host: HTMLElement; let root: Root;
async function show(loader: DetailsLoader | null, d: CanvasData = withPending, single = true) {
  vi.useFakeTimers();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => {
    root.render(
      <ObservationDetailsProvider value={loader}>
        <ObservationTip metric={m} period={period} label="Mar 2026" value={311} goal={m} data={d} single={single} />
      </ObservationDetailsProvider>,
    );
  });
  await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); });
  vi.useRealTimers();
  return host.textContent ?? "";
}
afterEach(() => { act(() => root.unmount()); host.remove(); });

const member: ObservationDetails = { source: "Slack", submitter: "Ann Example", openThreads: 2 };
const guest: ObservationDetails = { source: "Slack", submitter: null, openThreads: 0 };

describe("the popup on a chart's point", () => {
  it("shows a Member the period, value, status, Approval, Source, submitter and open Threads", async () => {
    const text = await show(async () => member);
    expect(text).toContain("Mar 2026");
    expect(text).toContain("Too low");
    expect(text).toContain("Not approved yet");
    expect(text).toContain("Source: Slack");
    expect(text).toContain("Submitted by Ann Example");
    expect(text).toContain("2 open Threads");
  });

  it("shows a Guest no other person's name and no Threads they may not read", async () => {
    const text = await show(async () => guest);
    expect(text).toContain("Source: Slack");
    expect(text).not.toContain("Submitted by");
    expect(text).not.toContain("open Thread");
  });

  it("asks nothing on a View Link or a Snapshot (no loader) and shows only what the data carries", async () => {
    const text = await show(null);
    expect(text).toContain("Mar 2026");
    expect(text).toContain("Too low");
    expect(text).not.toContain("Source:");
    expect(text).not.toContain("Submitted by");
  });

  it("asks nothing for a span of a combined series, which is not one Observation", async () => {
    const load = vi.fn(async () => member);
    const text = await show(load, withPending, false);
    expect(load).not.toHaveBeenCalled();
    expect(text).not.toContain("Not approved yet");
  });

  it("asks once per point while the card is shown", async () => {
    const load = vi.fn(async () => member);
    const cached = cachedLoader(load);
    await cached(m.slug, period);
    await cached(m.slug, period);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
