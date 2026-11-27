// Who finds Comparisons in a Widget's menu while looking at a dashboard. The menus are drawn open, in place.
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { comparesWhileViewing } from "@/lib/compare-while-viewing";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/viewer", () => ({}));
vi.mock("@/lib/demo-visit-action", () => ({}));
vi.mock("@/app/canvas-actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
const menu = vi.hoisted(() => (prefix: string) => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return Object.fromEntries(["", "Content", "Item", "Separator", "Sub", "SubContent", "SubTrigger", "Trigger", "CheckboxItem", "RadioGroup", "RadioItem"].map((p) => [prefix + p, Part]));
});
vi.mock("@/components/ui/dropdown-menu", () => menu("DropdownMenu"));
vi.mock("@/components/ui/context-menu", () => menu("ContextMenu"));
import { WidgetFrame } from "./widget-frame";

const data = sampleCanvasData("sara", "1,234.5");
type Props = Parameters<typeof WidgetFrame>[0];
const widget = { id: 1, template: "number", metric_ids: [data.metrics[0].id], settings: {}, title: null } as unknown as Props["widget"];
const draw = (props: Partial<Props> = {}) => renderToStaticMarkup(<WidgetFrame widget={widget} data={data} targets={[]} {...props} />);
// An entry of the Comparisons submenu that nothing else on a card says.
const OFFERED = "Full periods instead of to date";
const EDIT_ONLY = /Change view|Show by|Title…|Remove from dashboard/;

describe("Comparisons outside Edit mode", () => {
  it("is in both menus for someone who may change the dashboard, and is the only edit entry there", () => {
    const html = draw({ editable: false, mayWrite: true, mayCompare: true });
    expect(html.split(OFFERED)).toHaveLength(3); // the ⋯ menu and the right-click menu
    expect(html).not.toMatch(EDIT_ONLY);
  });

  it("stays in Edit mode", () => {
    expect(draw({ editable: true })).toContain(OFFERED);
  });

  it("offers Target first, only for a Metric that has one", () => {
    const withTarget = (target_min: number | null) =>
      draw({ editable: true, data: { ...data, targets: {}, metrics: [{ ...data.metrics[0], target_min, target_max: null }] } });
    expect(withTarget(1)).toMatch(/\/svg> Target<[\s\S]*vs previous period/);
    expect(withTarget(null)).not.toMatch(/\/svg> Target</);
  });

  it("is not offered where the frame is given neither right: to a Viewer, in Present or in Read", () => {
    expect(draw()).not.toContain(OFFERED);
    expect(draw({ editable: false, mayWrite: false, mayCompare: false })).not.toContain(OFFERED);
  });

  it("is not offered on a View Link, in a Snapshot or in a preview", () => {
    expect(draw({ readOnly: true, mayCompare: true })).not.toContain(OFFERED);
  });

  it("is not offered for a Widget that is not saved, or one that draws no strip", () => {
    expect(draw({ mayCompare: true, widget: { ...widget, id: undefined } })).not.toContain(OFFERED);
    expect(draw({ mayCompare: true, widget: { ...widget, template: "note", metric_ids: [] } })).not.toContain(OFFERED);
  });

  it("follows the screen's check, and is withheld in a demo visitors may not change", () => {
    expect(comparesWhileViewing(true, false, false)).toBe(true);
    expect(comparesWhileViewing(true, true, true)).toBe(true);
    expect(comparesWhileViewing(true, true, false)).toBe(false);
    expect(comparesWhileViewing(false, false, false)).toBe(false);
    expect(comparesWhileViewing(false, true, true)).toBe(false);
  });
});
