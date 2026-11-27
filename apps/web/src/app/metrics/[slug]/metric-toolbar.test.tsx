// @vitest-environment happy-dom
// Edit in the header of a Metric's page (GLOSSARY: Metric, Share): only for who may change the Metric, in the ⋯ menu
// on a phone, and it opens the form of Edit details on the Description tab with the focus in it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuEntry } from "@/components/object-toolbar";

const seen = vi.hoisted(() => ({ phone: false, menu: [] as { label: string }[], search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: seen.push, refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(seen.search) }));
vi.mock("@/lib/use-media", () => ({ useMedia: () => seen.phone }));
vi.mock("@/components/object-toolbar", () => ({ ObjectToolbar: ({ lead, children, menu }: { lead?: React.ReactNode; children?: React.ReactNode; menu: MenuEntry[] }) => { seen.menu = menu; return <div>{lead}{children}</div>; } }));
vi.mock("@/app/canvas-actions", () => ({}));
vi.mock("@/app/series-actions", () => ({ updateMetricDetails: vi.fn(), sameNamedMetrics: vi.fn(async () => []) }));
vi.mock("@/components/alerts", () => ({ AlertMe: () => null }));
vi.mock("@/components/delete-metrics", () => ({ DeleteMetrics: () => null }));
vi.mock("./ask-now", () => ({ askNow: vi.fn() }));
vi.mock("./assistant-prompt", () => ({ AssistantPrompt: () => null }));
vi.mock("./archive-metric", () => ({ ArchiveMetric: () => null, useBringBack: () => vi.fn() }));
vi.mock("./fill-past", () => ({ FillPast: () => null }));
vi.mock("./record-value", () => ({ RecordValue: () => null }));
import { MetricToolbar, type MetricToolbarProps } from "./metric-toolbar";
import { EditDetails } from "./edit-details";
import { EDIT_HREF } from "./edit-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement; let root: Root;
async function mount(node: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(node); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); seen.phone = false; seen.search = ""; vi.clearAllMocks(); });

const toolbar = (canEdit: boolean): MetricToolbarProps => ({
  id: 7, people: [], share: null, metric: { id: 7, name: "Orders", slug: "orders", description: "", unit: "", period: "month" }, mcp: null, record: null, askable: false,
  canEdit, alert: null, canDuplicate: false, canPaste: false, canCreateDashboard: false, dashboards: [], archive: { allowed: false, archived: false }, canDelete: false,
});
const link = () => host.querySelector<HTMLAnchorElement>("a");
const entry = () => (seen.menu as MenuEntry[]).find((m) => m.label === "Edit");

describe("Edit in the header of a Metric's page", () => {
  it("leads who may change the Metric to the form", async () => {
    await mount(<MetricToolbar {...toolbar(true)} />);
    expect(link()?.textContent?.trim()).toBe("Edit");
    expect(link()?.getAttribute("href")).toContain(EDIT_HREF);
    expect(link()?.className).toContain("max-sm:hidden");
    expect(entry()).toBeUndefined();
  });

  it("is in the menu on a phone", async () => {
    seen.phone = true;
    await mount(<MetricToolbar {...toolbar(true)} />);
    entry()?.onSelect?.();
    expect(seen.push).toHaveBeenCalledWith(EDIT_HREF, { scroll: false });
  });

  it.each([false, true])("is not there for anyone else (phone: %s)", async (phone) => {
    seen.phone = phone;
    await mount(<MetricToolbar {...toolbar(false)} />);
    expect(link()).toBeNull();
    expect(entry()).toBeUndefined();
  });

  it("opens Edit details with the focus in the form", async () => {
    seen.search = EDIT_HREF.slice(1);
    const metric = { id: 7, name: "Orders", description: "", calculation_note: null, unit: "", unit_position: "after", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", aggregation: "sum", target_min: null, target_max: null, formula: null, total: null, attainment_method: null, ask_note: "never" } as unknown as Parameters<typeof EditDetails>[0]["metric"];
    await mount(<EditDetails metric={metric} fixed={null} money={{ unit: "EUR", unit_position: "after" }} numberStyle="1,234.5" attainmentMethod="ratio" />);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Edit Orders");
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });
});
