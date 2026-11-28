// The cover slide (spec 0069; GLOSSARY: Slide, Slide Type): the deck's name, the period and the day, and an agenda made
// from the headlines that follow, in the form its Deck Design gives. It reads no Metric. Pure.
import { badge } from "../frame";
import { para, type Obj } from "../objects";
import type { AgendaEntry, Region, SlideType } from "../slide-type";
import type { Role } from "../theme";

/** What the cover says. */
export type CoverContent = { title: string; period: string; date: string; footer: string; agenda: AgendaEntry[] };

const number = (i: number) => String(i + 1).padStart(2, "0");

/** The deck's name in its place: the largest size that keeps it to two lines, or three in the smallest. */
function title({ pen, measure }: Region, words: string, x: number, y: number, w: number, color: Role): Obj {
  const setting = (size: number) => ({ size, face: "head" as const, bold: true });
  const size = [56, 40].find((s) => measure.wrap(words, w, setting(s)).length <= 2) ?? 26;
  const set = measure.fit(measure.balance(words, w, setting(size)), w, setting(size), size === 26 ? 3 : 2);
  return pen.text({ x, y, w, h: 140 }, [set], { size, color, face: "head", bold: true, line: 1.15, placeholder: "title", role: "title" });
}

/** The period and the day under the name, and the footer words at the bottom. */
function facts({ pen, measure }: Region, content: CoverContent, x: number, y: number, w: number, tone: [Role, Role]): Obj[] {
  return [
    pen.text({ x, y, w, h: 28 }, [measure.fit(content.period, w, { size: 18 }, 1)], { size: 18, color: tone[0] }),
    pen.text({ x, y: y + 32, w, h: 24 }, [measure.fit(content.date, w, { size: 14 }, 1)], { color: tone[1] }),
    ...(content.footer ? [pen.text({ x, y: 664, w: 440, h: 34 }, [measure.fit(content.footer, 440, { size: 11 }, 2)], { size: 11, color: "muted", line: 1.4, role: "footer" })] : []),
  ];
}

/** The column design: the agenda in the panel, the name beside it, columns that bleed off the bottom edge. */
function column(content: CoverContent, region: Region): Obj[] {
  const { pen, measure, design } = region;
  const ix = design.cover.panel.x + 48;
  const x = design.cover.panel.w + 48;
  const objects: Obj[] = [];
  if (content.agenda.length) objects.push(pen.text({ x: ix, y: 160, w: 264, h: 18 }, ["Agenda"], { size: 12, color: "panelmark", bold: true, caps: true, track: 0.14 }));
  let y = 196;
  for (const [i, entry] of content.agenda.entries()) {
    const headline = measure.fit(entry.headline, 218, { size: 12 }, 12);
    const tall = 20 + headline.split("\n").length * 17;
    const pitch = Math.max(96, tall + 30);
    // Whole entries only: one that does not fit is left out, never cut.
    if (y + pitch > 704) break;
    objects.push(pen.rect({ x: ix, y, w: 264, h: 1 }, "panelmark", { opacity: 0.4 }));
    objects.push(badge(pen, ix + 16, y + 32, number(i), 16, "panelmark", "panel"));
    objects.push(pen.text({ x: ix + 46, y: y + 18, w: 218, h: tall + 4 }, [para(entry.section), para(headline, { size: 12, color: "panelmark", bold: false })], { color: "paneltext", bold: true, line: 1.4 }));
    y += pitch;
  }
  // The columns that bleed off the bottom edge are decoration, not a chart: no baseline, no figures.
  [54, 76, 70, 104, 124, 150, 182].forEach((h, i) => objects.push(pen.rect({ x: 888 + i * 44, y: 720 - h, w: 28, h }, "neutral2", { role: "bleed" })));
  objects.push(pen.rect({ x, y: 236, w: 56, h: 4 }, "accent"), title(region, content.title, x, 262, 808, "ink"));
  objects.push(...facts(region, content, x, 420, 440, ["ink", "muted"]));
  return objects;
}

/** The band design: the name on the panel, the agenda in columns under it. */
function band(content: CoverContent, region: Region): Obj[] {
  const { pen, measure } = region;
  const objects: Obj[] = [pen.rect({ x: 64, y: 156, w: 56, h: 4 }, "panelmark"), title(region, content.title, 64, 180, 900, "paneltext")];
  objects.push(...facts(region, content, 64, 340, 640, ["paneltext", "panelmark"]));
  content.agenda.slice(0, 4).forEach((entry, i) => {
    const x = 64 + i * 294;
    objects.push(pen.line([x, 472], [x + 270, 472], { color: "ink" }), badge(pen, x + 16, 504, number(i)));
    const headline = measure.fit(entry.headline, 270, { size: 12 }, 5);
    objects.push(pen.text({ x, y: 528, w: 270, h: 126 }, [para(entry.section), para(headline, { size: 12, color: "muted", bold: false })], { bold: true, line: 1.4 }));
  });
  return objects;
}

/** The cover. */
export const cover: SlideType<CoverContent> = {
  id: "cover",
  section: "Cover",
  agenda: false,
  cover: true,
  /**
   *
   */
  fill(slide, _data, deck) {
    const title = slide.headline ?? deck.name;
    return { headline: title, source: "", content: { title, period: deck.period, date: deck.date, footer: deck.footer, agenda: deck.agenda } };
  },
  /**
   *
   */
  draw: (content, region) => (region.design.id === "column" ? column(content, region) : band(content, region)),
};
