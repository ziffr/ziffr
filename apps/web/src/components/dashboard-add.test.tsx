// @vitest-environment happy-dom
// Adding a widget to a dashboard (#1338): what is dropped or added is filled in (the Slot window) and put in its place,
// a card stays a card while the grid library reports a move for the place it is dragged over, and the grid starts afresh
// after a drop so the added widget is drawn. The panel itself is replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import type { DropSource } from "@/app/canvas-actions";

type PanelProps = { onAdd: (s: DropSource, from: number[]) => void; onDrag?: (from: number[] | null) => void };
const { panel } = vi.hoisted(() => ({ panel: { props: null as null | PanelProps } }));
vi.mock("./add-widget", () => ({ AddWidget: (p: PanelProps) => { panel.props = p; return <aside />; } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboards/1" }));
import { scaledGrid, useAddWidget } from "./dashboard-add";
import { SlideOverProvider } from "./slide-over-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = sampleCanvasData("sara", "1,234.5");
const complete = vi.fn(async (s: DropSource): Promise<DropSource | null> => s);
const put = vi.fn();
let add!: ReturnType<typeof useAddWidget>;
function Page({ mayChange }: { mayChange: boolean }) {
  add = useAddWidget({ dashboardId: 4, mayChange, widgets: [], complete, put });
  return <>{add.panel(data, [])}</>;
}

let host: HTMLElement; let root: Root;
const draw = (mayChange = true) => act(async () => { root.render(<SlideOverProvider><Page mayChange={mayChange} /></SlideOverProvider>); });
beforeEach(async () => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); panel.props = null; vi.clearAllMocks(); await draw(); await act(async () => add.openAdd()); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const source: DropSource = { type: "metric", id: 7 };

describe("adding a widget to a dashboard", () => {
  it("puts what + adds in the next free place, filled in starting from the picked Metric", async () => {
    await act(async () => panel.props!.onAdd(source, [3]));
    expect(complete).toHaveBeenCalledWith(source, [3]);
    expect(put).toHaveBeenCalledWith(4, source, undefined);
  });

  it("puts nothing when the person gives up on the Slots", async () => {
    complete.mockResolvedValueOnce(null);
    await act(async () => panel.props!.onAdd(source, []));
    expect(put).not.toHaveBeenCalled();
  });

  it("keeps a dragged card a card while the grid reports a move, puts it where it is dropped and starts the grid afresh", async () => {
    await act(async () => panel.props!.onDrag!([3]));
    await act(async () => add.moveStart());
    expect(add.carrying).toBe("card");
    const before = add.gridKey;
    const event = { dataTransfer: { getData: () => JSON.stringify(source) } } as unknown as Event;
    await act(async () => add.drop(event, { x: 5, y: 2 }));
    expect(add.carrying).toBeNull();
    expect(add.gridKey).not.toBe(before);
    expect(complete).toHaveBeenCalledWith(source, [3]);
    expect(put).toHaveBeenCalledWith(4, source, { x: 5, y: 2 });
  });

  it("has no panel for someone who may not change the dashboard", async () => {
    panel.props = null;
    await draw(false);
    expect(add.open).toBe(false);
    expect(host.querySelector("aside")).toBeNull();
  });
});

describe("a grid drawn smaller", () => {
  const size = () => ({ w: 3, h: 4 });
  it("moves its widgets at the scale, and measures a dragged card at its own size with the difference made up", () => {
    expect(scaledGrid(0.5, false, size).positionStrategy?.scale).toBe(0.5);
    expect(scaledGrid(0.5, true, size).positionStrategy).toBeUndefined();
    expect(scaledGrid(1, false, size).positionStrategy).toBeUndefined();
  });
});
