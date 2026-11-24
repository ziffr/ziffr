// The Title field of a widget's settings (#1078): the default as placeholder text, a live preview with Placeholders filled in, the shared hints.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";

vi.mock("server-only", () => ({}));
import { WidgetTitleEditor, previewTitle } from "./widget-title-editor";

const data = sampleCanvasData("sara", "1,234.5");
const m = data.metrics[0];
const widget = { id: 1, template: "number", metric_ids: [m.id], settings: {}, title: null } as unknown as Parameters<typeof WidgetTitleEditor>[0]["widget"];

describe("WidgetTitleEditor", () => {
  it("shows the default title as the field's placeholder, with the shared Placeholder hints", () => {
    const html = renderToStaticMarkup(<WidgetTitleEditor widget={widget} data={data} onSave={() => {}} />);
    expect(html).toContain(`placeholder="${m.name}"`);
    expect(html).toContain("Words that fill themselves in");
    expect(html).toContain("{metric 2}");
  });
  it("previews a title with its Placeholders filled in, and the default when emptied", () => {
    expect(previewTitle(widget, data, "{metric}: x")).toBe(`${m.name}: x`);
    expect(previewTitle(widget, data, "   ")).toBe(m.name);
    const html = renderToStaticMarkup(<WidgetTitleEditor widget={{ ...widget, title: "{metric}!" }} data={data} onSave={() => {}} />);
    expect(html).toContain(`${m.name}!`);
    expect(html).not.toContain(">{metric}!<");
  });
});
