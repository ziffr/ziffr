// The XML of a Slide's objects in a PowerPoint file (spec 0069; GLOSSARY: Deck, Slide, Theme): text, shapes, lines,
// connectors, groups, tables, pictures and placeholders as PresentationML and DrawingML, from the same drawing the screen
// reads. Colours and fonts are references to the file's theme. Untrusted input: every string of a drawing goes through
// `esc`, so typed words stay words, never markup; a link is written only where the caller's `Part` gives one. Pure.
import { boundsOf, type Box, type ConnectorObj, type LineObj, type Obj, type Para, type PictureObj, type Placeholder, type Run, type ShapeObj, type TableObj, type TextBody, type TextObj } from "@ziffr/core/deck-drawing/objects";
import { hexOf, paintOf, type Emphasis, type Role, type Slots } from "@ziffr/core/deck-drawing/theme";

/** English Metric Units of a pixel on a slide 13.333 in wide. */
const emu = (px: number): number => Math.round(px * 9525);
/** Hundredths of a point of a pixel. */
export const hundredths = (px: number): number => Math.round(px * 75);

/** What XML 1.0 cannot carry at all (and the carriage return, which a reader would turn into something else). */
 
const FORBIDDEN = /[\u0000-\u0008\u000B-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\t": "&#9;", "\n": "&#10;" };

/** A string without the characters XML forbids. */
export const clean = (s: string): string => s.replace(FORBIDDEN, "");
/** A string as XML text or as an attribute value. */
export const esc = (s: string): string => clean(s).replace(/[&<>"'\t\n]/g, (c) => ENTITIES[c]!);

/** The namespaces of a slide, layout or master part. */
export const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
/** The first line of every part. */
export const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** What turns a role into a theme colour, and how Google Slides needs things said. */
export type Look = { slots: Slots; emphasis: Emphasis; google: boolean; bodyFamily: string };

/** The relationships of a picture: the pixels every app shows, and the drawing where the picture is one. */
export type Blip = { pixels: string; svg?: string };
/** What only the part being written can answer: the relationship of a link or a picture, null where there is none. */
export type Part = { link(href: string): string | null; picture(o: PictureObj): Blip | null };

/** The font of a bullet or number: the text's own. Google Slides does not follow that, so its file names the family. */
export const bulletFont = (look: Look): string => (look.google ? `<a:buFont typeface="${esc(look.bodyFamily)}"/>` : "<a:buFontTx/>");

/**
 * Line spacing. PowerPoint takes exact points. Google Slides reads those as a share of its own line, about 1.2 times
 * the size, and spreads the lines by a fifth; its file therefore says the share.
 */
export function lineSpacing(look: Look, size: number, line: number): string {
  const spacing = look.google ? `<a:spcPct val="${Math.round((line / 1.2) * 100000)}"/>` : `<a:spcPts val="${hundredths(size * line)}"/>`;
  return `<a:lnSpc>${spacing}</a:lnSpc>`;
}

const SCHEME: Record<string, string> = { dk1: "tx1", lt1: "bg1", dk2: "tx2", lt2: "bg2" };
const share = (v: number) => Math.round(v * 100000);

/** A theme colour reference, with the Theme's pale changes and an opacity. */
export function color(look: Look, role: Role, opacity?: number): string {
  const paint = paintOf(look.slots, role, look.emphasis);
  const alpha = opacity === undefined ? "" : `<a:alpha val="${share(opacity)}"/>`;
  const tag = (name: string, val: string, mods: string) => (mods ? `<a:${name} val="${val}">${mods}</a:${name}>` : `<a:${name} val="${val}"/>`);
  // Google Slides reads the pale changes differently: its file says the colour they come to.
  if (look.google && paint.lumMod !== undefined) return tag("srgbClr", hexOf(look.slots, role, look.emphasis).slice(1).toUpperCase(), alpha);
  const change = (name: string, v: number | undefined) => (v === undefined ? "" : `<a:${name} val="${share(v)}"/>`);
  const mods = change("satMod", paint.satMod === 1 ? undefined : paint.satMod) + change("lumMod", paint.lumMod) + change("lumOff", paint.lumOff) + alpha;
  return tag("schemeClr", SCHEME[paint.slot] ?? paint.slot, mods);
}

/** A solid fill of a role's colour. */
export const solid = (look: Look, role: Role, opacity?: number): string => `<a:solidFill>${color(look, role, opacity)}</a:solidFill>`;

/** The look of a run of words. */
type RunStyle ={ size: number; color: Role; bold: boolean; face: "head" | "body"; caps?: boolean; track?: number };

/** A link keeps the words' own colour, as on screen, in place of the theme's link colour. */
const hyperlink = (id: string) =>
  `<a:hlinkClick r:id="${id}"><a:extLst><a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}">` +
  `<ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext></a:extLst></a:hlinkClick>`;

function runProperties(look: Look, s: RunStyle, tag = "a:rPr", link: string | null = null): string {
  const spacing = s.track ? ` spc="${hundredths(s.track * s.size)}"` : "";
  const caps = s.caps ? ' cap="all"' : "";
  const font = s.face === "head" ? "+mj" : "+mn";
  return (
    `<${tag} lang="en-GB" sz="${hundredths(s.size)}" b="${s.bold ? 1 : 0}"${link ? ' u="sng"' : ""} kern="100"${caps}${spacing} dirty="0">${solid(look, s.color)}` +
    `<a:latin typeface="${font}-lt"/><a:cs typeface="${font}-cs"/>${link ? hyperlink(link) : ""}</${tag}>`
  );
}

const styleOf = (body: TextBody, para: Para, run?: Run): RunStyle => ({
  size: run?.size ?? para.size ?? body.size,
  color: run?.color ?? para.color ?? body.color,
  bold: run?.bold ?? para.bold ?? body.bold,
  face: run?.face ?? para.face ?? body.face,
  caps: body.caps,
  track: body.track,
});

/** A run's words, a line break where they have one. */
const lines = (words: string, properties: string, brk: string) =>
  words
    .split("\n")
    .map((t) => (t ? `<a:r>${properties}<a:t>${esc(t)}</a:t></a:r>` : ""))
    .join(brk);

const ALIGN = { left: "l", center: "ctr", right: "r" } as const;
const ANCHOR = { top: "t", middle: "ctr", bottom: "b" } as const;
/** How a text body's alignment is written. */
export const alignOf = (body: TextBody): string => ALIGN[body.align];

/** The indent of a paragraph with a bullet: the words stand 18 px in, the bullet 16 px before them. */
export const BULLET_INDENT = ` marL="${emu(18)}" indent="${-emu(16)}"`;

function paragraph(look: Look, part: Part, body: TextBody, para: Para, index: number): string {
  const size = para.size ?? body.size;
  const before = index ? (para.spaceBefore ?? 0) : 0;
  const after = index < body.paras.length - 1 ? (para.spaceAfter ?? 0) : 0;
  let bullet = "<a:buNone/>";
  if (para.bullet === "dot") bullet = `${bulletFont(look)}<a:buChar char="•"/>`;
  if (para.bullet === "number") bullet = `${bulletFont(look)}<a:buAutoNum type="arabicPeriod"/>`;
  const runs = para.runs
    .map((r) => {
      const style = styleOf(body, para, r);
      const words = runProperties(look, style, "a:rPr", r.href ? part.link(r.href) : null);
      return lines(r.t, words, `<a:br>${runProperties(look, style)}</a:br>`);
    })
    .join("");
  return (
    `<a:p><a:pPr${para.bullet ? BULLET_INDENT : ' marL="0" indent="0"'} algn="${alignOf(body)}">${lineSpacing(look, size, para.line ?? body.line)}` +
    `<a:spcBef><a:spcPts val="${hundredths(before)}"/></a:spcBef><a:spcAft><a:spcPts val="${hundredths(after)}"/></a:spcAft>${bullet}</a:pPr>` +
    `${runs}${runProperties(look, styleOf(body, para), "a:endParaRPr")}</a:p>`
  );
}

/** The paragraphs of a text body. */
const paragraphs = (look: Look, part: Part, body: TextBody) => body.paras.map((p, i) => paragraph(look, part, body, p, i)).join("");

/** How a text box holds its words: padding, anchor and wrapping; never shrunk or grown by the app that opens it. */
export function bodyProperties(body: TextBody): string {
  const [l, t, r, b] = body.inset;
  return `<a:bodyPr wrap="${body.wrap ? "square" : "none"}" lIns="${emu(l)}" tIns="${emu(t)}" rIns="${emu(r)}" bIns="${emu(b)}" rtlCol="0" anchor="${ANCHOR[body.valign]}" vertOverflow="overflow" horzOverflow="overflow"><a:noAutofit/></a:bodyPr>`;
}

/** The place and size of an object. */
export const xfrm = (r: Box, flips = "", tag = "a:xfrm"): string =>
  `<${tag}${flips}><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(Math.max(0, r.w))}" cy="${emu(Math.max(0, r.h))}"/></${tag}>`;

const named = (id: number, name: string, alt?: string) => `<p:cNvPr id="${id}" name="${esc(name)}"${alt ? ` descr="${esc(alt)}"` : ""}/>`;

/** A text box or a preset shape. */
function shapeXml(look: Look, part: Part, o: ShapeObj | TextObj, id: number): string {
  const text = o.type === "text";
  const stroke = o.type === "shape" ? o.stroke : undefined;
  // A screen border lies inside its box; a PowerPoint outline is centred on the edge.
  const half = stroke ? stroke.width / 2 : 0;
  const rect = { x: o.x + half, y: o.y + half, w: o.w - 2 * half, h: o.h - 2 * half };
  const fill = o.type === "shape" && o.fill ? solid(look, o.fill, o.opacity) : "<a:noFill/>";
  const line = stroke ? `<a:ln w="${emu(stroke.width)}">${solid(look, stroke.color)}${stroke.dash ? '<a:prstDash val="dash"/>' : ""}</a:ln>` : "<a:ln><a:noFill/></a:ln>";
  const body = o.body ? `<p:txBody>${bodyProperties(o.body)}<a:lstStyle/>${paragraphs(look, part, o.body)}</p:txBody>` : "";
  return (
    `<p:sp><p:nvSpPr>${named(id, o.id, o.alt)}<p:cNvSpPr${text ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(rect)}<a:prstGeom prst="${o.type === "shape" ? o.shape : "rect"}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr>${body}</p:sp>`
  );
}

function lineXml(look: Look, o: LineObj | ConnectorObj, id: number, ids: Map<string, number>): string {
  const flips = `${o.x2 < o.x1 ? ' flipH="1"' : ""}${o.y2 < o.y1 ? ' flipV="1"' : ""}`;
  let binding = "";
  let preset = "line";
  let ends = "";
  if (o.type === "connector") {
    // Connection sites of a rectangle: 0 top, 1 left, 2 bottom, 3 right.
    const from = ids.get(o.from);
    const to = ids.get(o.to);
    binding = (from ? `<a:stCxn id="${from}" idx="3"/>` : "") + (to ? `<a:endCxn id="${to}" idx="1"/>` : "");
    preset = Math.abs(o.y2 - o.y1) < 0.5 ? "straightConnector1" : "bentConnector3";
  } else {
    // The preset dash: Google Slides draws a custom one as dash and dot.
    ends = (o.dash ? '<a:prstDash val="dash"/>' : "") + (o.arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : "");
  }
  return (
    `<p:cxnSp><p:nvCxnSpPr>${named(id, o.id)}<p:cNvCxnSpPr>${binding}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr>${xfrm(boundsOf(o), flips)}<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom><a:ln w="${emu(o.width)}">${solid(look, o.color)}${ends}</a:ln></p:spPr></p:cxnSp>`
  );
}

function tableXml(look: Look, part: Part, o: TableObj, id: number): string {
  const edge = (tag: string, border?: { color: Role; width: number }) =>
    border ? `<a:${tag} w="${emu(border.width)}">${solid(look, border.color)}</a:${tag}>` : `<a:${tag} w="0"><a:noFill/></a:${tag}>`;
  const grid = o.cols.map((c) => `<a:gridCol w="${emu(c)}"/>`).join("");
  const rows = o.rows
    .map((row, r) => {
      const cells = row.cells
        .map((c, i) => {
          const [l, t, right, b] = c.body.inset;
          // The line between two rows belongs to both cells and has to say the same in each.
          const above = r ? o.rows[r - 1]!.cells[i]?.borderBottom : undefined;
          return (
            `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(look, part, c.body)}</a:txBody>` +
            `<a:tcPr marL="${emu(l)}" marR="${emu(right)}" marT="${emu(t)}" marB="${emu(b)}" anchor="${ANCHOR[c.body.valign]}">` +
            `${edge("lnL")}${edge("lnR")}${edge("lnT", above)}${edge("lnB", c.borderBottom)}${c.fill ? solid(look, c.fill) : "<a:noFill/>"}</a:tcPr></a:tc>`
          );
        })
        .join("");
      return `<a:tr h="${emu(row.h)}">${cells}</a:tr>`;
    })
    .join("");
  return (
    `<p:graphicFrame><p:nvGraphicFramePr>${named(id, o.id, o.alt)}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `${xfrm(boundsOf(o), "", "p:xfrm")}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">` +
    `<a:tbl><a:tblPr${o.rows[0]?.header ? ' firstRow="1"' : ""}/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function pictureXml(part: Part, o: PictureObj, id: number): string {
  const blip = part.picture(o);
  if (!blip) return "";
  const svg = blip.svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${blip.svg}"/></a:ext></a:extLst>`
    : "";
  return (
    `<p:pic><p:nvPicPr>${named(id, o.id, o.alt)}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${blip.pixels}">${svg}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/** How a slide placeholder is named, marked and found again in its layout. */
export const PLACEHOLDERS: Record<Placeholder, { ph: string; name: string }> = {
  title: { ph: '<p:ph type="title"/>', name: "Headline" },
  source: { ph: '<p:ph type="ftr" sz="quarter" idx="11"/>', name: "Source" },
  number: { ph: '<p:ph type="sldNum" sz="quarter" idx="12"/>', name: "Page number" },
};

/** The field PowerPoint fills with a slide's number. */
export const numberField = (shown: string): string => `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-GB"/><a:t>${esc(shown)}</a:t></a:fld>`;

const place = (o: TextObj) => JSON.stringify([o.x, o.y, o.w, o.h]);
const framing = (o: TextObj) => JSON.stringify([o.body.valign, o.body.inset, o.body.wrap]);
const plainLook = (o: TextObj) => JSON.stringify([styleOf(o.body, { runs: [] }), o.body.line, o.body.align]);
/** Whether every word of a placeholder looks as the layout's text does, so that the slide need not say how. */
const inherits = (o: TextObj, base: TextObj) =>
  o.body.paras.every(
    (p) => !p.bullet && !p.spaceBefore && !p.spaceAfter && p.runs.every((r) => !r.href && JSON.stringify([styleOf(o.body, p, r), p.line ?? o.body.line, o.body.align]) === plainLook(base)),
  );

/**
 * A placeholder of a slide: its words. Place and look come from the layout and the master, and are said here only where
 * this slide differs, such as a headline set smaller to keep to two lines. `field`: the slide number may fill it.
 */
export function placeholderXml(look: Look, part: Part, o: TextObj, base: TextObj, id: number, field: boolean): string {
  const kind = PLACEHOLDERS[o.placeholder!];
  const words = (p: Para) => {
    if (field) return `<a:p>${numberField(p.runs.map((r) => r.t).join(""))}<a:endParaRPr lang="en-GB"/></a:p>`;
    const plain = '<a:rPr lang="en-GB" dirty="0"/>';
    return `<a:p>${p.runs.map((r) => lines(r.t, plain, `<a:br>${plain}</a:br>`)).join("")}<a:endParaRPr lang="en-GB" dirty="0"/></a:p>`;
  };
  const said = inherits(o, base) ? o.body.paras.map(words).join("") : paragraphs(look, part, o.body);
  const moved = place(o) === place(base) ? "<p:spPr/>" : `<p:spPr>${xfrm(o)}</p:spPr>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${kind.name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${kind.ph}</p:nvPr></p:nvSpPr>` +
    `${moved}<p:txBody>${framing(o) === framing(base) ? "<a:bodyPr/>" : bodyProperties(o.body)}<a:lstStyle/>${said}</p:txBody></p:sp>`
  );
}

/**
 * The shape tree of a slide or layout, in drawing order. `placeholder` writes a placeholder of a slide; `extra` is
 * added after the objects.
 */
export function shapeTree(look: Look, part: Part, objects: Obj[], placeholder: (o: TextObj, id: number) => string, extra = ""): string {
  const ids = new Map<string, number>();
  let last = 1;
  const number = (list: Obj[]) => {
    for (const o of list) {
      ids.set(o.id, ++last);
      if (o.type === "group") number(o.children);
    }
  };
  number(objects);
  const write = (o: Obj): string => {
    const id = ids.get(o.id)!;
    switch (o.type) {
      case "text":
        return o.placeholder ? placeholder(o, id) : shapeXml(look, part, o, id);
      case "shape":
        return shapeXml(look, part, o, id);
      case "line":
      case "connector":
        return lineXml(look, o, id, ids);
      case "table":
        return tableXml(look, part, o, id);
      case "picture":
        return pictureXml(part, o, id);
      case "group": {
        const b = boundsOf(o);
        const box = `<a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/>`;
        return (
          `<p:grpSp><p:nvGrpSpPr>${named(id, o.id, o.alt)}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr><a:xfrm>${box}${box.replace("a:off", "a:chOff").replace("a:ext", "a:chExt")}</a:xfrm></p:grpSpPr>${o.children.map(write).join("")}</p:grpSp>`
        );
      }
    }
  };
  return (
    `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `${objects.map(write).join("")}${extra}</p:spTree>`
  );
}
