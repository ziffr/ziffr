// The frame of a deck's PowerPoint file (spec 0069; GLOSSARY: Deck Design, Theme, Slide): the file's theme (the
// Theme's colours and fonts), one slide master, and a slide layout per form of the Deck Design with what stands behind
// every slide of that form. A change to any of them in PowerPoint or Keynote reaches the slides. Pure.
import type { Placeholder, TextObj } from "@ziffr/core/deck-drawing/objects";
import { textBody } from "@ziffr/core/deck-drawing/objects";
import { DECK_FONT_FAMILIES } from "@ziffr/core/deck-drawing/fonts";
import type { DeckDrawing, SlideDrawing } from "@ziffr/core/deck-drawing/draw-deck";
import { alignOf, BULLET_INDENT, bodyProperties, bulletFont, color, esc, hundredths, lineSpacing, NS, numberField, PLACEHOLDERS, shapeTree, solid, xfrm, XML, type Look, type Part } from "./xml";

const SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;

/** The file's theme: the Theme's colours and fonts under the names PowerPoint offers them by. */
export function themeXml({ look }: DeckDrawing): string {
  const rgb = (tag: string, value: string) => `<a:${tag}><a:srgbClr val="${esc(value.replace("#", "").toUpperCase())}"/></a:${tag}>`;
  const face = (family: string) => `<a:latin typeface="${esc(family)}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (width: number) => `<a:ln w="${width}">${fill}<a:prstDash val="solid"/></a:ln>`;
  const effect = "<a:effectStyle><a:effectLst/></a:effectStyle>";
  const links = rgb("hlink", look.slots.accent1) + rgb("folHlink", look.slots.accent5);
  return (
    `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Ziffr"><a:themeElements>` +
    `<a:clrScheme name="Ziffr">${SLOTS.map((slot) => rgb(slot, look.slots[slot])).join("")}${links}</a:clrScheme>` +
    `<a:fontScheme name="Ziffr"><a:majorFont>${face(DECK_FONT_FAMILIES[look.fonts.head].family)}</a:majorFont><a:minorFont>${face(DECK_FONT_FAMILIES[look.fonts.body].family)}</a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Plain"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line(9525)}${line(19050)}${line(28575)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
  );
}

/** The look of a placeholder as one level of a list style. */
function level(look: Look, o: TextObj, tag = "a:lvl1pPr", bullet = "<a:buNone/>", margin = ' marL="0" indent="0"'): string {
  const { size, line, color: role, bold, face } = o.body;
  const font = face === "head" ? "+mj" : "+mn";
  return (
    `<${tag}${margin} algn="${alignOf(o.body)}">${lineSpacing(look, size, line)}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>${bullet}` +
    `<a:defRPr sz="${hundredths(size)}" b="${bold ? 1 : 0}" kern="100">${solid(look, role)}<a:latin typeface="${font}-lt"/><a:ea typeface="${font}-ea"/><a:cs typeface="${font}-cs"/></a:defRPr></${tag}>`
  );
}

/** One placeholder of each kind. */
export type Placeholders = Partial<Record<Placeholder, TextObj>>;

/** The placeholder of each kind that stands for a set of slides; of the headlines the largest. */
export function representatives(slides: SlideDrawing[]): Placeholders {
  const found: Placeholders = {};
  for (const o of slides.flatMap((s) => s.objects)) {
    if (o.type !== "text" || !o.placeholder) continue;
    const held = found[o.placeholder];
    if (!held || (o.placeholder === "title" && o.body.size > held.body.size)) found[o.placeholder] = o;
  }
  return found;
}

const SAMPLE: Record<Exclude<Placeholder, "number">, string> = { title: "A headline that states the conclusion, on at most two lines", source: "Source" };

/** A placeholder of a layout or the master, with words that show what goes there. */
function frameShape(o: TextObj, id: number, place: string, framing: string, list: string): string {
  const kind = o.placeholder!;
  const words = kind === "number" ? numberField("‹#›") : `<a:r><a:rPr lang="en-GB" dirty="0"/><a:t>${SAMPLE[kind]}</a:t></a:r>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${PLACEHOLDERS[kind].name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${PLACEHOLDERS[kind].ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${place}</p:spPr><p:txBody>${framing}<a:lstStyle>${list}</a:lstStyle><a:p>${words}<a:endParaRPr lang="en-GB" dirty="0"/></a:p></p:txBody></p:sp>`
  );
}

const plain = (size: number, bold: boolean, face: "head" | "body", line: number): TextObj => ({
  type: "text",
  id: "",
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  body: textBody([], { size, color: "ink", face, bold, line }),
});

/** The slide master: the page's colour, the placeholders every layout starts from, and the text styles. `layouts` is the list of its layouts, as the package has it. */
export function masterXml(look: Look, placeholders: Placeholders, layouts: string): string {
  const shapes = Object.values(placeholders)
    .map((o, i) => frameShape(o, i + 2, `${xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`, bodyProperties(o.body), level(look, o)))
    .join("");
  const body = plain(14, false, "body", 1.4);
  const bullets = level(look, body, "a:lvl1pPr", `${bulletFont(look)}<a:buChar char="•"/>`, BULLET_INDENT);
  return (
    `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill>${color(look, "surface")}</a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `${layouts}<p:txStyles><p:titleStyle>${level(look, placeholders.title ?? plain(26, true, "head", 1.25))}</p:titleStyle><p:bodyStyle>${bullets}</p:bodyStyle>` +
    `<p:otherStyle>${level(look, body)}</p:otherStyle></p:txStyles></p:sldMaster>`
  );
}

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/**
 * A slide layout. It repeats from the master only what differs, so that a change to the master reaches it. `type` is
 * PowerPoint's own name for the kind of layout.
 */
export function layoutXml(
  look: Look,
  part: Part,
  layout: { name: string; type: "title" | "titleOnly" | "blank"; objects: SlideDrawing["layout"]["objects"]; placeholders: Placeholders },
  master: Placeholders,
): string {
  const own = Object.values(layout.placeholders).map((o, i) => {
    const base = master[o.placeholder!];
    const moved = !base || differs([o.x, o.y, o.w, o.h], [base.x, base.y, base.w, base.h]);
    const styled = (t: TextObj) => [t.body.size, t.body.line, t.body.color, t.body.bold, t.body.face, t.body.align];
    const restyled = !base || differs(styled(o), styled(base));
    const reframed = !base || differs([o.body.valign, o.body.inset, o.body.wrap], [base.body.valign, base.body.inset, base.body.wrap]);
    // Ids of their own, above any the layout's shapes take.
    return frameShape(o, 1000 + i, moved ? xfrm(o) : "", reframed ? bodyProperties(o.body) : "<a:bodyPr/>", restyled ? level(look, o) : "");
  });
  const tree = shapeTree(look, part, layout.objects, () => "", own.join(""));
  return `${XML}<p:sldLayout ${NS} type="${layout.type}" preserve="1" userDrawn="1"><p:cSld name="${esc(layout.name)}">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}
