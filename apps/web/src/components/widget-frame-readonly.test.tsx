// A read-only Widget frame (a View Link) offers no menu at all, so none of "Add to…" and "Save as…" (#969).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/viewer", () => ({}));
vi.mock("@/app/canvas-actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
import { WidgetFrame } from "./widget-frame";

const data = sampleCanvasData("sara", "1,234.5");

describe("WidgetFrame readOnly", () => {
  it("offers neither Add to… nor Save as…", () => {
    const widget = { id: 1, template: "number", metric_ids: [data.metrics[0].id], settings: {}, title: null } as unknown as Parameters<typeof WidgetFrame>[0]["widget"];
    const html = renderToStaticMarkup(<WidgetFrame readOnly widget={widget} data={data} targets={[{ id: 2, name: "Other" }]} />);
    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/Add to…|Save as…|Copy to|For View Designs/);
  });
});
