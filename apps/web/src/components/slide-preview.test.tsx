// A Deck Template's first slides as a Preview draws them (GLOSSARY: Preview, Sample Data, Deck Template): no more than
// asked for, their words filled from Sample Data, and nothing that takes a pointer, the keyboard or a screen reader.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { deckTemplateFromFile } from "@ziffr/core/deck-template-file";
import { packSample, type PackSampleEntry } from "@ziffr/core/pack-sample";

vi.mock("./read-only-frame", () => ({ ReadOnlyFrame: ({ widget }: { widget: { template: string; metric_ids: number[] } }) => <div data-widget={widget.template} data-metrics={widget.metric_ids.join(",")} /> }));
vi.mock("./preview", async () => ({ withPackSample: (sample: { metrics: unknown[] }, pack: { data: { metrics: unknown[]; series: object } }) => ({ ...sample, metrics: [...pack.data.metrics, ...sample.metrics], series: pack.data.series }) }));
import { SlidesPreview } from "./slide-preview";

const entry: PackSampleEntry = { key: "revenue", name: "Revenue", period: "month", aggregation: "sum", unit: "€", unit_position: "after", format: "number", decimals: 0, polarity: "higher", target_min: null, target_max: null, formula: null, total: null, repeat: null };
const slots = [{ label: "Revenue", multiple: false, suggests: "revenue" }];
const body = deckTemplateFromFile({
  format: "ziffr.deck-template/1", name: "Board", description: "", slots: [{ label: "Revenue", suggests: "revenue" }],
  slides: [
    { shapes: [{ shape: "text", x: 64, y: 250, w: 1152, text: ["Board meeting"], size: "xl" }] },
    { shapes: [{ shape: "text", x: 64, y: 56, w: 1152, text: ["{metric} against its target"] }, { shape: "widget", view: "line", slots: [0], x: 64, y: 150, w: 1152, h: 500 }] },
    { shapes: [{ shape: "box", x: 64, y: 150, w: 560, h: 500, text: ["Highlights"] }] },
    { shapes: [{ shape: "text", x: 0, y: 0, w: 100, text: ["A fourth slide"] }] },
  ],
} as never);

describe("slides preview", () => {
  const html = renderToStaticMarkup(<SlidesPreview deck={{ slots: slots as never, body }} pack={packSample("ziffr/board", [entry])} viewer="me" numberStyle="1,234.5" />);

  it("draws the first three slides, their words and boxes", () => {
    expect(html.match(/data-preview="slide"/g)).toHaveLength(3);
    expect(html).toContain("Board meeting");
    expect(html).toContain("Highlights");
    expect(html).not.toContain("A fourth slide");
  });

  it("fills the Slots with the Pack's Sample Data", () => {
    expect(html).toContain("Revenue against its target");
    expect(html).toMatch(/data-widget="line" data-metrics="-1000"/);
  });

  it("is hidden from pointer, keyboard and screen reader", () => {
    expect(html).toMatch(/<div aria-hidden="true" inert="" data-preview="slide"/);
  });
});
