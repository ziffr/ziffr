"use client";
// Deck export (GLOSSARY: Snapshot): values as of the moment of export, stamped on every slide.
// Text, shapes and arrows become native PowerPoint objects; line and bar widgets become native
// (editable) charts, number widgets text, history tables tables; everything else an image.
import { getArrowInfo, renderPlaintextFromRichText, type Editor, type TLShape } from "tldraw";
import { format } from "date-fns";
import { formatValue } from "@ziffr/core/format";
import type { CanvasData, SlideDesign } from "@ziffr/core/types";
import { masterGeometry } from "./master";
import { orderedSlides, SLIDE_W, SLIDE_H } from "./layouts";
import { WIDGET_SHAPE, widgetFromShape, type WidgetShape } from "./widget-shape";
import { widgetMetrics } from "@/views/widget-body";
import { storyBreakdown, storyDefaults } from "@/views/story";
import { fillSettings } from "@ziffr/core/placeholders";
import { FONTS } from "@ziffr/core/themes";
import { dataAsOf } from "@ziffr/core/snapshot-periods";
import type { Theme } from "@ziffr/core/types";
import { dayAfter, isPartial, pointName, shownSeries, SHOWN_BY, type DisplayPoint } from "@ziffr/core/display-periods";

// Hex values for PowerPoint, which cannot read CSS variables. Set from the deck's theme when an export starts
// (GLOSSARY: Theme); these defaults mirror Coral.
let INK = "221B19";
let INK_2 = "312926";
let MUTED = "615955";
let PAPER = "F1ECE8";
let COTTON = "FDFBF8";
let RULE = "D9D3CF";
let ERROR = "BE2323";
// Exported decks travel: the theme's fonts by the names PowerPoint knows; it substitutes ones it lacks.
let FONT = "Arial";
let HEAD_FONT = "Arial";

function applyExportTheme(theme: Theme | undefined) {
  if (!theme) return;
  const t = theme.tokens;
  const h = (c: string) => c.replace("#", "").toUpperCase();
  INK = h(t.ink); INK_2 = h(t.data[0] ?? t.ink); MUTED = h(t.muted); COTTON = h(t.surface); RULE = h(t.rule); ERROR = h(t.bad);
  PAPER = h(t.canvas);
  FONT = FONTS[t.fontBody]?.office ?? "Arial";
  HEAD_FONT = FONTS[t.fontHeading]?.office ?? FONT;
  TL_COLORS.black = INK;
  TL_COLORS.grey = MUTED;
}

const TL_COLORS: Record<string, string> = {
  black: INK, grey: MUTED, "light-violet": "B9A9E0", violet: "6A4FB3", blue: "3C64B4", "light-blue": "6FA8DC",
  yellow: "D9A21B", orange: "D9772B", green: "4C8B5A", "light-green": "8CC08C", "light-red": "E28A8A", red: "B9413B", white: "FFFFFF",
};
const TL_TEXT_PX: Record<string, number> = { s: 18, m: 24, l: 36, xl: 44 };

const IN_PER_SLIDE_W = 13.333;
const IN_PER_SLIDE_H = 7.5;

type Box = { x: number; y: number; w: number; h: number };

function frameBox(editor: Editor, frame: TLShape, child: TLShape): Box {
  const f = editor.getShapePageBounds(frame)!;
  const b = editor.getShapePageBounds(child)!;
  return { x: b.x - f.x, y: b.y - f.y, w: b.w, h: b.h };
}

function descendants(editor: Editor, id: TLShape["id"]): TLShape[] {
  return editor.getSortedChildIdsForParent(id).flatMap((cid) => {
    const s = editor.getShape(cid)!;
    return s.type === "group" ? descendants(editor, cid) : [s];
  });
}

async function shapeImage(editor: Editor, ids: TLShape["id"][]) {
  const { url } = await editor.toImageDataUrl(ids, { format: "png", pixelRatio: 2, background: false, padding: 0 });
  return url;
}

export async function exportPptx(editor: Editor, data: CanvasData, deckName: string, master: SlideDesign | null, theme?: Theme) {
  applyExportTheme(theme);
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deckName;
  pptx.theme = { headFontFace: HEAD_FONT, bodyFontFace: FONT };
  const asOf = format(new Date(), "d MMMM yyyy");
  const frames = orderedSlides(editor);
  const MASTER = "ZIFFR_MASTER";
  const hex = (c: string) => c.replace("#", "").toUpperCase();
  if (master) {
    // A native PowerPoint slide master: background, logo, footer and number live on the master,
    // so editing the master in PowerPoint changes every slide there too.
    const k = IN_PER_SLIDE_W / SLIDE_W;
    const g = masterGeometry(master, SLIDE_W, SLIDE_H);
    const objects: NonNullable<Parameters<typeof pptx.defineSlideMaster>[0]["objects"]> = [];
    if (master.logo) objects.push({ image: { x: g.logo.x * k, y: g.logo.y * k, w: g.logo.w * k, h: g.logo.h * k, data: master.logo } });
    if (master.footer && master.logo_position !== "bottom-left")
      objects.push({ text: { text: master.footer, options: { x: g.footer.x * k, y: g.footer.y * k, w: g.footer.w * k, h: g.footer.h * k, fontSize: Math.round(g.footer.size * k * 72), color: hex(master.text_color), transparency: 38, fontFace: FONT, margin: 0 } } });
    pptx.defineSlideMaster({
      title: MASTER,
      background: master.background_image ? { data: master.background_image } : { color: hex(master.background_color) },
      objects,
      slideNumber:
        master.show_slide_number && master.logo_position !== "bottom-right"
          ? { x: g.number.x * k, y: g.number.y * k, w: g.number.w * k, h: g.number.h * k, fontSize: Math.round(g.number.size * k * 72), color: hex(master.text_color), fontFace: FONT, align: "right" }
          : undefined,
    });
  }

  for (const [index, frame] of frames.entries()) {
    const fw = (frame.props as { w: number }).w || SLIDE_W;
    const fh = (frame.props as { h: number }).h || SLIDE_H;
    const kx = IN_PER_SLIDE_W / fw;
    const ky = IN_PER_SLIDE_H / fh;
    const k = Math.min(kx, ky);
    const pos = (b: Box) => ({ x: b.x * kx, y: b.y * ky, w: Math.max(b.w * kx, 0.05), h: Math.max(b.h * ky, 0.05) });
    const usesMaster = Boolean(master) && !(frame.meta as { hideMaster?: boolean })?.hideMaster;
    const slide = usesMaster ? pptx.addSlide({ masterName: MASTER }) : pptx.addSlide();
    if (!usesMaster) slide.background = { color: PAPER };

    for (const shape of descendants(editor, frame.id)) {
      const box = frameBox(editor, frame, shape);
      const p = shape.props as Record<string, unknown>;
      try {
        if (shape.type === "text") {
          const px = (TL_TEXT_PX[p.size as string] ?? 24) * ((p.scale as number) ?? 1);
          slide.addText(renderPlaintextFromRichText(editor, p.richText as never), {
            ...pos(box),
            fontSize: Math.round(px * k * 72),
            fontFace: FONT,
            bold: px >= 36,
            color: TL_COLORS[p.color as string] ?? INK,
            align: (p.textAlign as "start" | "middle" | "end") === "middle" ? "center" : (p.textAlign as string) === "end" ? "right" : "left",
            valign: "top",
            margin: 0,
          });
        } else if (shape.type === "geo") {
          const geo = p.geo as string;
          const kind = geo === "ellipse" ? pptx.ShapeType.ellipse : geo === "triangle" ? pptx.ShapeType.triangle : geo === "diamond" ? pptx.ShapeType.diamond : pptx.ShapeType.roundRect;
          const color = TL_COLORS[p.color as string] ?? INK;
          const filled = p.fill !== "none";
          slide.addText(renderPlaintextFromRichText(editor, p.richText as never) || "", {
            ...pos(box),
            shape: kind,
            rectRadius: 0.08,
            fill: filled ? { color, transparency: p.fill === "semi" ? 80 : p.fill === "solid" ? 0 : 88 } : { type: "none" },
            line: { color, width: 1.5, dashType: p.dash === "dashed" ? "dash" : p.dash === "dotted" ? "sysDot" : "solid" },
            fontFace: FONT,
            fontSize: 14,
            color: p.fill === "solid" ? "FFFFFF" : INK,
            align: "center",
            valign: "middle",
          });
        } else if (shape.type === "arrow") {
          const info = getArrowInfo(editor, shape as never);
          if (!info) continue;
          const t = editor.getShapePageTransform(shape.id)!;
          const f = editor.getShapePageBounds(frame)!;
          const a = t.applyToPoint(info.start.point);
          const b = t.applyToPoint(info.end.point);
          const x1 = a.x - f.x, y1 = a.y - f.y, x2 = b.x - f.x, y2 = b.y - f.y;
          slide.addShape(pptx.ShapeType.line, {
            x: Math.min(x1, x2) * kx,
            y: Math.min(y1, y2) * ky,
            w: Math.max(Math.abs(x2 - x1) * kx, 0.01),
            h: Math.max(Math.abs(y2 - y1) * ky, 0.01),
            flipH: x2 < x1,
            flipV: y2 < y1,
            line: { color: TL_COLORS[p.color as string] ?? INK, width: 2, endArrowType: p.arrowheadEnd === "none" ? undefined : "triangle", beginArrowType: p.arrowheadStart && p.arrowheadStart !== "none" ? "triangle" : undefined },
          });
        } else if (shape.type === WIDGET_SHAPE) {
          await addWidget(pptx, slide, shape as WidgetShape, pos(box), data, editor);
        } else {
          slide.addImage({ data: await shapeImage(editor, [shape.id]), ...pos(box) });
        }
      } catch (e) {
        console.warn("Skipped a shape on export", shape.type, e);
      }
    }

    // The snapshot stamp sits centred, clear of the master's footer and number.
    const footerY = ((SLIDE_H - 36 - 21) * IN_PER_SLIDE_W) / SLIDE_W; // same line as the master footer
    slide.addText(`Data as of ${asOf}`, { x: IN_PER_SLIDE_W / 2 - 1.5, y: footerY, w: 3, h: 0.22, fontSize: 9, color: MUTED, fontFace: FONT, align: "center", margin: 0 });
    if (!usesMaster) slide.addText(`${index + 1}`, { x: IN_PER_SLIDE_W - 1, y: footerY, w: 0.6, h: 0.22, fontSize: 9, color: MUTED, align: "right", fontFace: FONT, margin: 0 });
  }

  await pptx.writeFile({ fileName: `${deckName.replace(/[^\w\- ]+/g, "").trim() || "Ziffr deck"}.pptx` });
}

type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;
type Pptx = InstanceType<typeof import("pptxgenjs").default>;

async function addWidget(pptx: Pptx, slide: Slide, shape: WidgetShape, at: { x: number; y: number; w: number; h: number }, live: CanvasData, editor: Editor) {
  const widget = widgetFromShape(shape);
  // A widget of a deck made from a Snapshot exports the values of that period only, as it draws them (spec 0013).
  const data = widget.settings.asOf ? dataAsOf(live, widget.settings.asOf) : live;
  const ms = widgetMetrics(widget, data);
  const m = ms[0];
  if (!m) return;
  // The same points the app draws, by the widget's Display Period when it has one (spec 0018).
  const shown = shownSeries(m, data, SHOWN_BY.includes(widget.template) ? widget.settings.display : undefined, { today: widget.settings.asOf ? dayAfter(widget.settings.asOf) : undefined });
  const by = shown.by;
  const all = shown.points;
  const pts = all.slice(-(widget.settings.window ?? 12));
  const name = (p: DisplayPoint, short = false) => pointName(p, by, m.period, data.yearStart, short);
  // A span's target when combined (see targetsBy), else the Metric's range as always.
  const goal = (p: DisplayPoint | undefined) => (shown.combined ? { min: shown.targets?.at[p?.period ?? ""]?.min ?? null, max: shown.targets?.at[p?.period ?? ""]?.max ?? null } : { min: m.target_min, max: m.target_max });
  const title = widget.title ?? m.name;

  // Card behind every widget, like the cotton sheet in the app.
  slide.addShape(pptx.ShapeType.roundRect, { ...at, rectRadius: 0.06, fill: { color: COTTON }, line: { color: RULE, width: 0.75 }, shadow: { type: "outer", angle: 45, blur: 6, offset: 2, color: "8A7A6C", opacity: 0.25 } });
  const inner = { x: at.x + 0.15, y: at.y + 0.12, w: at.w - 0.3, h: at.h - 0.24 };
  const head = { ...inner, h: 0.3 };
  const body = { x: inner.x, y: inner.y + 0.32, w: inner.w, h: Math.max(inner.h - 0.32, 0.3) };

  const chartOpts = {
    ...body,
    showLegend: false,
    showTitle: false,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisLabelColor: MUTED,
    valAxisLabelColor: MUTED,
    catAxisLabelFontFace: FONT,
    valAxisLabelFontFace: FONT,
    valGridLine: { color: RULE, size: 0.5 },
    catGridLine: { style: "none" as const },
    catAxisLineShow: false,
    valAxisLineShow: false,
  };
  const labels = pts.map((p) => name(p, true));
  const values = pts.map((p) => Math.round(p.value * 100) / 100);

  if (widget.template === "line" && pts.length > 1) {
    slide.addText(title, { ...head, fontSize: 12, bold: true, color: INK, fontFace: FONT, margin: 0 });
    slide.addChart(pptx.ChartType.line, [{ name: m.name, labels, values }], { ...chartOpts, chartColors: [INK_2], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 5 });
  } else if (widget.template === "bars" && pts.length > 0) {
    slide.addText(title, { ...head, fontSize: 12, bold: true, color: INK, fontFace: FONT, margin: 0 });
    slide.addChart(pptx.ChartType.bar, [{ name: m.name, labels, values }], { ...chartOpts, barDir: "col", chartColors: [INK_2], barGapWidthPct: 40 });
  } else if (widget.template === "number") {
    const last = all[all.length - 1];
    const prev = all[all.length - 2];
    const t = goal(last);
    const off = last && ((t.max !== null && last.value > t.max) || (t.min !== null && last.value < t.min));
    // A quarter to date against a whole one would read as a drop: no change then.
    const change = last && prev && prev.value && !last.toDate && !isPartial(last) && !isPartial(prev) ? (last.value - prev.value) / Math.abs(prev.value) : null;
    slide.addText(
      [
        { text: `${title}\n`, options: { fontSize: 12, bold: true, color: INK } },
        { text: formatValue(m, last?.value), options: { fontSize: Math.min(40, Math.max(18, at.h * 9)), bold: true, color: off ? ERROR : INK } },
        { text: change === null ? "" : `  ${change > 0 ? "+" : ""}${(change * 100).toFixed(1)} %\n`, options: { fontSize: 12, color: MUTED, fontFace: FONT } },
        { text: last ? name(last) : "No values yet", options: { fontSize: 10, color: MUTED, breakLine: false } },
      ],
      { ...inner, fontFace: FONT, valign: "top", margin: 0 },
    );
  } else if (widget.template === "ranked") {
    // A ranked-bars Finding as a native bar chart, its words as editable text.
    const d = storyDefaults(widget, data, m);
    const b = storyBreakdown(widget, data, m);
    const s = fillSettings(widget, data);
    const rows = b.rows.slice(0, 12).reverse(); // PowerPoint draws bar charts bottom-up
    slide.addText(
      [
        { text: `${s.headline || d.headline}\n`, options: { fontSize: 16, bold: true, color: INK } },
        { text: s.subline || d.subline, options: { fontSize: 10, color: MUTED } },
      ],
      { x: inner.x, y: inner.y, w: inner.w, h: 0.62, fontFace: FONT, valign: "top", margin: 0 },
    );
    slide.addChart(
      pptx.ChartType.bar,
      [{ name: m.name, labels: rows.map((r) => r.label), values: rows.map((r) => r.value) }],
      {
        x: inner.x, y: inner.y + 0.66, w: inner.w, h: Math.max(inner.h - 0.66 - 0.28, 0.4),
        barDir: "bar", barGapWidthPct: 35, showLegend: false, showTitle: false,
        chartColors: rows.map((r) => (r.label === b.highlight?.label ? INK_2 : RULE)),
        showValue: true, dataLabelFontSize: 9, dataLabelColor: INK, dataLabelPosition: "outEnd", dataLabelFontFace: FONT,
        valAxisHidden: true, valGridLine: { style: "none" }, catAxisLabelFontSize: 10, catAxisLabelColor: INK, catAxisLabelFontFace: FONT, catAxisLineShow: false,
      },
    );
    slide.addText(s.source || d.source, { x: inner.x, y: inner.y + inner.h - 0.24, w: inner.w, h: 0.24, fontSize: 8, color: MUTED, fontFace: FONT, margin: 0 });
  } else if (widget.template === "table") {
    slide.addText(title, { ...head, fontSize: 12, bold: true, color: INK, fontFace: FONT, margin: 0 });
    const rows = all.slice(-(widget.settings.rows ?? 6)).reverse();
    slide.addTable(
      rows.map((r) => [
        { text: name(r, true), options: { color: MUTED } },
        { text: formatValue(m, r.value), options: { align: "right" as const, fontFace: FONT } },
      ]),
      { ...body, fontSize: 10, fontFace: FONT, color: INK, border: { type: "solid", pt: 0.5, color: RULE } },
    );
  } else {
    // Gauge, forecast, correlation, matrix, drivers: the app's own rendering as an image.
    slide.addImage({ data: await shapeImage(editor, [shape.id]), ...at });
  }
}

export async function exportPdf(editor: Editor, deckName: string) {
  const frames = orderedSlides(editor);
  const images: string[] = [];
  for (const f of frames) images.push((await editor.toImageDataUrl([f.id], { format: "png", pixelRatio: 2, background: true, padding: 0 })).url);
  const asOf = format(new Date(), "d MMMM yyyy");
  const w = window.open("", "_blank");
  if (!w) return;
  const doc = w.document;
  doc.title = deckName;
  const style = doc.createElement("style");
  style.textContent = `
    @page { size: 13.333in 7.5in; margin: 0 }
    html, body { margin: 0; background: #${PAPER} }
    figure { margin: 0; width: 13.333in; height: 7.5in; position: relative; break-after: page }
    img { width: 100%; height: 100%; object-fit: contain; display: block }
    figcaption { position: absolute; left: 0.4in; bottom: 0.2in; font: 9pt system-ui, sans-serif; color: #${MUTED} }`;
  doc.head.appendChild(style);
  const loads = images.map((src, i) => {
    const fig = doc.createElement("figure");
    const img = doc.createElement("img");
    img.alt = `Slide ${i + 1}`;
    const loaded = new Promise((r) => (img.onload = r));
    img.src = src;
    const cap = doc.createElement("figcaption");
    cap.textContent = `Data as of ${asOf}, slide ${i + 1}`;
    fig.append(img, cap);
    doc.body.appendChild(fig);
    return loaded;
  });
  await Promise.all(loads);
  w.focus();
  w.print();
}
