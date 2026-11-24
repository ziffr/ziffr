// @vitest-environment happy-dom
// The chart above a result's words (ticket #1076): it draws the numbers the core's chart holds and no others, a period without a value is a gap, a bar the
// words are about is told apart by more than colour, and the picture is reachable by keyboard and described by the Takeaway. The charts are the ones the core
// gives for a real result (the very data the Takeaway is written from).
import { act, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { entryOf, type EntryId } from "@ziffr/core/method-picker";
import { runEntry, type PickWorld, type Picked } from "@ziffr/core/method-picker-run";
import type { BarsChart, EffectsChart, ForecastChart, GridChart, LinesChart, ResultChart } from "@ziffr/core/result-chart";
import { ResultCharts } from "./index";

// Charts measure their box in a browser; here every chart gets the same fixed size.
vi.mock("recharts", async (orig) => {
  const real = await orig<typeof import("recharts")>();
  const Fixed = ({ children }: { children: ReactNode }) => (isValidElement(children) ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 480, height: 240 }) : null);
  return { ...real, ResponsiveContainer: Fixed };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = sampleCanvasData("sara", "1,234.5");
const [a, b, c] = data.metrics;
const world: PickWorld = { metrics: data.metrics, series: data.series, breakdowns: {}, ctx: { style: "1,234.5", charts: true }, yearStart: 1 as never, today: "2027-01-15" };
const chartOf = (id: EntryId, slots: Picked["slots"], settings: Picked["settings"] = {}): ResultChart => runEntry(entryOf(id)!, world, { slots, settings }).chart!;

let host: HTMLElement; let root: Root;
async function draw(chart: ResultChart | undefined) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(<ResultCharts chart={chart} describedBy="words" style="1,234.5" yearStart={1} />); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("the chart of a result", () => {
  it("is described by the Takeaway, reachable by keyboard, and named", async () => {
    await draw(chartOf("correlation", { first: [a], second: [b] }));
    const figures = [...host.querySelectorAll("figure")];
    expect(figures.map((f) => f.getAttribute("data-result-chart-part"))).toEqual(["lines", "scatter"]);
    for (const f of figures) {
      expect(f.getAttribute("aria-describedby")).toBe("words");
      expect(f.tabIndex).toBe(0);
      expect(f.getAttribute("aria-label")).toBeTruthy();
      expect(f.querySelector("figcaption")!.textContent).toBe(f.getAttribute("aria-label"));
    }
  });

  it("takes no room where there is no picture", async () => {
    await draw(undefined);
    expect(host.innerHTML).toBe("");
    act(() => root.unmount()); host.remove();
    await draw([]);
    expect(host.innerHTML).toBe("");
  });

  it("draws every number of a chart of lines, each line with its own marker and name, and a gap where a period has no value", async () => {
    const chart = chartOf("correlation", { first: [a], second: [b] });
    const lines = chart[0] as LinesChart;
    // Make a gap: the first Metric has no value in the fifth period.
    lines.lines[0].values[4] = null;
    await draw([lines]);
    const dots = [...host.querySelectorAll("[data-chart=lines] [data-period]")];
    const first = dots.filter((d) => d.tagName === "circle");
    const second = dots.filter((d) => d.tagName === "rect");
    expect(first.map((d) => d.getAttribute("data-value"))).toEqual(lines.lines[0].values.filter((v) => v !== null).map(String));
    expect(second.map((d) => d.getAttribute("data-value"))).toEqual(lines.lines[1].values.map(String));
    expect(first.some((d) => d.getAttribute("data-period") === lines.periods[4])).toBe(false);
    // The legend names both lines and the side of each axis.
    const legend = host.querySelector("ul")!.textContent!;
    expect(legend).toContain(`${a.name}`);
    expect(legend).toContain("(left axis)");
    expect(legend).toContain("(right axis)");
  });

  it("marks the best delay with a solid bar and a word under it, and draws every delay's number", async () => {
    await draw(chartOf("lag", { first: [a], second: [b] }));
    const bars = [...host.querySelectorAll("rect[data-label]")];
    const chart = chartOf("lag", { first: [a], second: [b] })[0] as BarsChart;
    expect(bars.map((r) => r.getAttribute("data-value"))).toEqual(chart.bars.map((x) => String(x.value)));
    const best = chart.bars.find((x) => x.tag === "best")!;
    expect(bars.find((r) => r.getAttribute("data-label") === best.label)!.getAttribute("fill")).toBe("var(--color-data)");
    expect(bars.filter((r) => r.getAttribute("fill") === "var(--color-data)")).toHaveLength(1);
    expect(host.textContent).toContain("best delay");
  });

  it("writes each driver's share with its strength word", async () => {
    const chart = chartOf("moves", { metric: [a], drivers: [b, c] });
    await draw(chart);
    const bars = chart.find((p) => p.kind === "bars") as BarsChart;
    const rows = [...host.querySelectorAll("[data-chart=rows] li")];
    expect(rows.map((r) => r.getAttribute("data-label"))).toEqual(bars.bars.map((x) => x.label));
    bars.bars.forEach((x, i) => expect(rows[i].textContent).toContain(x.note!));
  });

  it("writes a what-if's rows in each Metric's own unit, and a row nothing can be said of without a bar", async () => {
    const chart = chartOf("what-if", { metric: [a], others: [b, c] }, { percent: 10 });
    await draw(chart);
    const effects = chart[0] as EffectsChart;
    const rows = [...host.querySelectorAll("[data-chart=effects] li")];
    expect(rows).toHaveLength(effects.rows.length);
    effects.rows.forEach((r, i) => expect(rows[i].getAttribute("data-value")).toBe(r.effect === null ? "" : String(r.effect)));
    expect(rows[0].textContent).toContain("the change asked for");
  });

  it("writes every pair of the matrix with its number and its word", async () => {
    const chart = chartOf("matrix", { metrics: [a, b, c] });
    await draw(chart);
    const grid = chart[0] as GridChart;
    const cells = [...host.querySelectorAll("[data-chart=grid] td[data-r]")];
    expect(cells).toHaveLength(grid.cells.length);
    for (const cell of grid.cells) expect(host.textContent).toContain(cell.word!);
    expect(host.querySelector("table caption")).toBeTruthy();
  });

  it("writes small changes with the decimals the words use, never as 0", async () => {
    const unit = { name: "M", unit: "€", unit_position: "after" as const, decimals: 0 };
    await draw([{ kind: "bars", measure: "change", unit, about: ["M"], bars: [{ label: "A", value: 0.4 }, { label: "B", value: -0.3 }, { label: "", value: 0.1, tag: "total" }] }]);
    const text = host.textContent!.replace(/\s/g, " ");
    expect(text).toContain("+0.4 €");
    expect(text).toMatch(/[−-]0\.3 €/);
  });

  it("draws a forecast's history with a gap where a period has no value: the line has two segments", async () => {
    const chart = chartOf("forecast", { metric: [a] });
    const f = chart[0] as ForecastChart;
    f.history.splice(10, 1);
    await draw([f]);
    const solid = [...host.querySelectorAll("path.recharts-line-curve")].filter((p) => p.getAttribute("stroke") === "var(--color-data)" && !p.getAttribute("stroke-dasharray"));
    expect(solid).toHaveLength(1);
    expect((solid[0].getAttribute("d")!.match(/M/g) ?? []).length).toBe(2);
  });
});
