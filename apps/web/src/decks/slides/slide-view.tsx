// One slide on screen (spec 0069; GLOSSARY: Slide): every object of its drawing as a React element, at its place on a
// 1280 by 720 slide that is then scaled to the width it is given, so lines break the same at every size. Always as
// designed: the colours come from the drawing, never from the viewer's Appearance. Words are rendered as text, never as
// markup, and a picture only from a data address the drawing carries. No state and no browser code: it renders anywhere.
import type { CSSProperties, ReactNode } from "react";

import type { DeckLook, SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import type { Cell, ConnectorObj, LineObj, Obj, Para, ShapeObj, TableObj, TextBody } from "@ziffr/core/deck-drawing/objects";
import type { Role } from "@ziffr/core/deck-drawing/theme";

import { slideFontStack } from "./fonts";

type Paint = { colour: (role: Role) => string; font: (face: "head" | "body") => string };
type Leaf = Exclude<Obj, { type: "group" }>;

const PICTURE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,/i;
const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", margin: 0 });

/** The paragraphs of a text body. */
function paragraphs(body: TextBody, paint: Paint): ReactNode {
  let counter = 0;
  return body.paras.map((p: Para, i) => {
    counter = p.bullet === "number" ? counter + 1 : 0;
    const strong = p.runs[0]?.bold ?? p.bold ?? body.bold;
    const style: CSSProperties = {
      fontSize: p.size,
      color: p.color && paint.colour(p.color),
      fontWeight: p.bold === undefined ? undefined : p.bold ? 700 : 400,
      fontFamily: p.face && paint.font(p.face),
      lineHeight: p.line,
      marginTop: i ? p.spaceBefore : undefined,
      marginBottom: i < body.paras.length - 1 ? p.spaceAfter : undefined,
      ...(p.bullet ? { paddingLeft: 18, textIndent: -16 } : {}),
    };
    return (
      <div key={i} style={style}>
        {/* A bullet or number takes the weight of the paragraph's first words, as PowerPoint's does. */}
        {p.bullet && <span style={{ display: "inline-block", width: 16, textIndent: 0, fontWeight: strong ? 700 : 400 }}>{p.bullet === "dot" ? "•" : `${counter}.`}</span>}
        {p.runs.map((r, j) => {
          const style: CSSProperties = { color: r.color && paint.colour(r.color), fontSize: r.size, fontFamily: r.face && paint.font(r.face), fontWeight: r.bold === undefined ? undefined : r.bold ? 700 : 400 };
          // A drawing's links are Ziffr's own (about.ts); nothing but a web address is ever followed.
          return r.href && /^https?:\/\//i.test(r.href) ? (
            <a key={j} href={r.href} target="_blank" rel="noreferrer" style={{ ...style, textDecoration: "underline" }}>
              {r.t}
            </a>
          ) : (
            <span key={j} style={style}>
              {r.t}
            </span>
          );
        })}
      </div>
    );
  });
}

/** How a text body sets its words. */
function setting(body: TextBody, paint: Paint): CSSProperties {
  const [left, top, right, bottom] = body.inset;
  return {
    fontSize: body.size,
    fontWeight: body.bold ? 700 : 400,
    lineHeight: body.line,
    color: paint.colour(body.color),
    fontFamily: paint.font(body.face),
    textAlign: body.align,
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
    textTransform: body.caps ? "uppercase" : "none",
    letterSpacing: body.track ? `${body.track}em` : "normal",
    whiteSpace: body.wrap ? "pre-wrap" : "pre",
    overflowWrap: body.wrap ? "break-word" : "normal",
  };
}

const column = (body: TextBody): CSSProperties => ({ display: "flex", flexDirection: "column", justifyContent: { top: "flex-start", middle: "center", bottom: "flex-end" }[body.valign] });

function Shape({ o, paint }: { o: ShapeObj; paint: Paint }) {
  const stroke = o.stroke && `${o.stroke.width}px ${o.stroke.dash ? "dashed" : "solid"} ${paint.colour(o.stroke.color)}`;
  const common = { "data-id": o.id, "data-kind": "shape", "data-role": o.role, role: o.alt ? "img" : undefined, "aria-label": o.alt };
  return (
    <>
      {o.shape === "diamond" ? (
        <svg {...common} width={o.w} height={o.h} style={{ ...box(o.x, o.y, o.w, o.h), overflow: "visible", opacity: o.opacity }}>
          <polygon points={`${o.w / 2},0 ${o.w},${o.h / 2} ${o.w / 2},${o.h} 0,${o.h / 2}`} fill={o.fill ? paint.colour(o.fill) : "none"} />
        </svg>
      ) : (
        <div {...common} style={{ ...box(o.x, o.y, o.w, o.h), background: o.fill && paint.colour(o.fill), border: stroke, opacity: o.opacity, borderRadius: o.shape === "ellipse" ? "50%" : 0 }} />
      )}
      {o.body && (
        <div data-kind="words" data-role={o.role} style={{ ...box(o.x, o.y, o.w, o.h), ...column(o.body), ...setting(o.body, paint) }}>
          {paragraphs(o.body, paint)}
        </div>
      )}
    </>
  );
}

/** A straight line, or a connector with its two bends. */
function Line({ o, paint }: { o: LineObj | ConnectorObj; paint: Paint }) {
  const pad = 8;
  const x = Math.min(o.x1, o.x2) - pad;
  const y = Math.min(o.y1, o.y2) - pad;
  const w = Math.abs(o.x2 - o.x1) + 2 * pad;
  const h = Math.abs(o.y2 - o.y1) + 2 * pad;
  const middle = (o.x1 + o.x2) / 2;
  const way: [number, number][] = o.type === "connector" ? [[o.x1, o.y1], [middle, o.y1], [middle, o.y2], [o.x2, o.y2]] : [[o.x1, o.y1], [o.x2, o.y2]];
  const dash = o.type === "line" && o.dash ? "6 4" : undefined;
  const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
  const head = [[o.x2, o.y2], ...[0.45, -0.45].map((turn) => [o.x2 - 8 * Math.cos(angle + turn), o.y2 - 8 * Math.sin(angle + turn)])];
  return (
    <svg data-id={o.id} data-kind="line" aria-hidden width={w} height={h} style={{ ...box(x, y, w, h), overflow: "visible" }}>
      {way.slice(1).map(([bx, by], i) => {
        const [ax, ay] = way[i]!;
        return <line key={i} x1={ax - x} y1={ay - y} x2={bx - x} y2={by - y} stroke={paint.colour(o.color)} strokeWidth={o.width} strokeDasharray={dash} />;
      })}
      {o.type === "line" && o.arrow && <polygon points={head.map(([px, py]) => `${px! - x},${py! - y}`).join(" ")} fill={paint.colour(o.color)} />}
    </svg>
  );
}

function tableCell(cell: Cell, height: number, header: boolean, key: number, paint: Paint) {
  const Tag = header ? "th" : "td";
  const { body } = cell;
  const style: CSSProperties = {
    ...setting(body, paint),
    height,
    boxSizing: "border-box",
    verticalAlign: body.valign,
    background: cell.fill && paint.colour(cell.fill),
    border: 0,
    borderBottom: cell.borderBottom ? `${cell.borderBottom.width}px solid ${paint.colour(cell.borderBottom.color)}` : 0,
  };
  return (
    <Tag key={key} scope={header ? "col" : undefined} style={style}>
      {body.paras.some((p) => p.runs.some((r) => r.t)) ? paragraphs(body, paint) : null}
    </Tag>
  );
}

function Table({ o, paint }: { o: TableObj; paint: Paint }) {
  const width = o.cols.reduce((a, b) => a + b, 0);
  const height = o.rows.reduce((a, r) => a + r.h, 0);
  return (
    <table data-id={o.id} data-kind="table" data-h={height} aria-label={o.alt} style={{ position: "absolute", left: o.x, top: o.y, width, margin: 0, borderCollapse: "collapse", borderSpacing: 0, tableLayout: "fixed" }}>
      <colgroup>
        {o.cols.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        {o.rows.map((row, i) => (
          <tr key={i} style={{ height: row.h }}>
            {row.cells.map((cell, j) => tableCell(cell, row.h, row.header === true, j, paint))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One object that is not a group. */
function Drawn({ o, paint }: { o: Leaf; paint: Paint }) {
  switch (o.type) {
    case "text":
      return (
        <div
          data-id={o.id}
          data-kind="text"
          data-role={o.role}
          data-unit={o.unit}
          // The headline is the slide's heading.
          role={o.role === "title" ? "heading" : undefined}
          aria-level={o.role === "title" ? 2 : undefined}
          style={{ ...box(o.x, o.y, o.w, o.h), ...column(o.body), ...setting(o.body, paint) }}
        >
          {paragraphs(o.body, paint)}
        </div>
      );
    case "shape":
      return <Shape o={o} paint={paint} />;
    case "line":
    case "connector":
      return <Line o={o} paint={paint} />;
    case "table":
      return <Table o={o} paint={paint} />;
    case "picture":
      // eslint-disable-next-line @next/next/no-img-element -- a data address drawn at its place; nothing to optimise or fetch
      return PICTURE.test(o.src) ? <img data-id={o.id} data-kind="picture" data-role={o.role} src={o.src} alt={o.alt} style={{ ...box(o.x, o.y, o.w, o.h), maxWidth: "none", objectFit: "contain" }} /> : null;
  }
}

/** Objects in drawing order; a group (a chart) keeps its name for those who cannot see it. */
function objects(list: Obj[], paint: Paint): ReactNode {
  return list.map((o) =>
    o.type === "group" ? (
      <div key={o.id} role="group" aria-label={o.alt}>
        {objects(o.children, paint)}
      </div>
    ) : (
      <Drawn key={o.id} o={o} paint={paint} />
    ),
  );
}

/** One slide, as wide as the element it stands in. */
export function SlideView({ slide, look }: { slide: SlideDrawing; look: DeckLook }) {
  const paint: Paint = { colour: (role) => look.colours[role], font: (face) => slideFontStack(look.fonts[face]) };
  return (
    <div role="group" aria-roledescription="slide" aria-label={slide.headline} data-slide={slide.id} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", containerType: "inline-size" }}>
      <div
        data-canvas
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1280,
          height: 720,
          overflow: "hidden",
          // The width of the element over 1280, as a plain number, without any code in the browser.
          transform: "scale(tan(atan2(100cqw, 1280px)))",
          transformOrigin: "0 0",
          background: paint.colour("surface"),
          color: paint.colour("ink"),
          fontFamily: paint.font("body"),
          // Nothing of the page around it changes how words are set.
          fontStyle: "normal",
          fontKerning: "normal",
          fontFeatureSettings: "normal",
          letterSpacing: "normal",
          wordSpacing: "normal",
          textAlign: "left",
          textTransform: "none",
          textRendering: "geometricPrecision",
          WebkitTextSizeAdjust: "none",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
          direction: "ltr",
        }}
      >
        {objects(slide.layout.objects, paint)}
        {objects(slide.objects, paint)}
      </div>
    </div>
  );
}
