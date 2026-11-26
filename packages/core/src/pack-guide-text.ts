// A Pack Guide as a person writes it in Export as Pack (spec 0058, GLOSSARY: Pack Guide): one text per section, a
// paragraph per line, "- " for a list, "1. " for numbered steps and "# " for a heading, turned into the blocks of the
// file and back. Pure.
// Security: the texts come from a browser. Their shape and length are checked first, and the blocks made of them are
// held to the very checks a Pack's guide always meets (@ziffr/pack), each problem told at its section and line. Nothing
// is mended quietly beyond spaces and tabs: a web address or markup is refused, never cut out.
import { checkSchema } from "./json-check";
import { checkGuide, PACK_GUIDE_SCHEMA, PACK_GUIDE_SECTIONS, type PackGuide, type PackGuideBlock, type PackGuideSection } from "@ziffr/pack/pack-guide";

/** What a person wrote for each section, as the fields of "Describe your Pack" hold it. */
export type PackGuideText = Partial<Record<PackGuideSection, string>>;

/** One thing the guide may not hold: the section and the line of its field, or neither for the guide as a whole. */
export type GuideProblem = { section: PackGuideSection | null; line: number | null; message: string };

/** The most characters a field is read to: more than the largest guide has in all. */
export const GUIDE_FIELD_MAX = 40_000;

const BULLET = /^[-*•](?: +|$)/;
const NUMBER = /^(\d{1,3})[.)](?: +|$)/;
const HEADING = /^#{1,6}(?: +|$)/;
// Spaces, tabs and the no-break space a word processor leaves. Anything else odd stays, for the check to name.
const SPACES = /[ \t ]+/g;

/** Where each block of a section, and each entry of a list, stood in its field. */
type Lines = { block: number; items: number[] }[];

function blocksOf(text: string): { blocks: PackGuideBlock[]; lines: Lines } {
  const blocks: PackGuideBlock[] = [];
  const lines: Lines = [];
  // An empty line ends a list; a numbered list goes on after one when the next number is not 1 again.
  let apart = false;
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.replace(SPACES, " ").replace(/^ | $/g, "");
    if (!line) { apart = true; return; }
    const number = NUMBER.exec(line);
    const marker = number ?? BULLET.exec(line);
    if (marker) {
      const numbered = number !== null;
      const entry = line.slice(marker[0].length);
      const last = blocks.at(-1);
      if (last?.type === "list" && Boolean(last.numbered) === numbered && (!apart || (numbered && Number(number![1]) > 1))) {
        last.items.push(entry);
        lines.at(-1)!.items.push(i + 1);
      } else {
        blocks.push({ type: "list", items: [entry], ...(numbered ? { numbered: true } : {}) });
        lines.push({ block: i + 1, items: [i + 1] });
      }
    } else {
      const heading = HEADING.exec(line);
      blocks.push(heading ? { type: "heading", text: line.slice(heading[0].length) } : { type: "text", text: line });
      lines.push({ block: i + 1, items: [] });
    }
    apart = false;
  });
  return { blocks, lines };
}

/** A problem of the file's check, said of the thing a person sees in the field. */
function told(path: string, message: string, made: Map<string, { blocks: PackGuideBlock[]; lines: Lines }>): GuideProblem {
  const at = /^(?:guide\.?)?(\w*)(?:\[(\d+)\])?(?:\.(items|text)(?:\[(\d+)\])?)?/.exec(path)!;
  const [, key, n, field, item] = at;
  const section = made.has(key) ? (key as PackGuideSection) : null;
  if (!section) return { section: null, line: null, message: `The guide ${message}` };
  const { blocks, lines } = made.get(key)!;
  if (n === undefined) return { section, line: null, message: `This section ${message}` };
  const block = blocks[Number(n)];
  const where = lines[Number(n)];
  if (item !== undefined) return { section, line: where.items[Number(item)] ?? where.block, message: `This list entry ${message}` };
  const what = field === "items" ? "This list" : block.type === "heading" ? "This heading" : "This paragraph";
  return { section, line: where.block, message: `${what} ${message}` };
}

/** The guide a person's texts make, or null when every field is empty, with everything it may not hold. What came from
 * the browser may be anything: only a text under a section's name is read. */
export function guideFromText(input: unknown): { guide: PackGuide | null; problems: GuideProblem[] } {
  const fields = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const problems: GuideProblem[] = [];
  const made = new Map<string, { blocks: PackGuideBlock[]; lines: Lines }>();
  for (const { key } of PACK_GUIDE_SECTIONS) {
    const text = Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined;
    if (text === undefined || text === null || text === "") continue;
    if (typeof text !== "string") problems.push({ section: key, line: null, message: "This section is not a text." });
    else if (text.length > GUIDE_FIELD_MAX) problems.push({ section: key, line: null, message: `This section has ${text.length.toLocaleString("en")} characters, more than a whole guide may hold.` });
    else {
      const section = blocksOf(text);
      if (section.blocks.length) made.set(key, section);
    }
  }
  if (problems.length || !made.size) return { guide: null, problems };
  const guide: PackGuide = Object.fromEntries([...made].map(([k, s]) => [k, s.blocks]));
  const found = checkSchema(PACK_GUIDE_SCHEMA, guide).map((p) => told(p.path, p.message, made));
  checkGuide(guide, (path, message) => found.push(told(path, message, made)));
  // One line, one problem: the first says what to change, and the check runs again after it.
  const seen = new Set<string>();
  const first = found.filter((p) => { const k = `${p.section}:${p.line}`; return seen.has(k) ? false : (seen.add(k), true); });
  return first.length ? { guide: null, problems: first } : { guide, problems: [] };
}

/** A guide as the fields hold it, so that a guide a Pack was installed with can be offered and changed. */
export function guideToText(guide: PackGuide): PackGuideText {
  return Object.fromEntries(PACK_GUIDE_SECTIONS.filter((s) => guide[s.key]?.length).map((s) => [s.key, guide[s.key]!.map((b) =>
    b.type === "heading" ? `# ${b.text}` : b.type === "text" ? b.text : b.items.map((x, i) => (b.numbered ? `${i + 1}. ${x}` : `- ${x}`)).join("\n"),
  ).join("\n\n")]));
}

/** The kinds of things a Pack holds, with the heading each gets in the list of contents. */
const KINDS = [["metrics", "metric", "Metrics"], ["dashboards", "template", "Dashboards"], ["decks", "template", "Decks"], ["workflows", "template", "Workflows"], ["views", "design", "View Designs"], ["themes", "theme", "Themes"]] as const;

/** The most entries one list of the contents has, as the format allows, and the most bytes of names the whole list is
 * given, which leaves the person room to write within a guide's size. */
const LIST = 20;
const LISTED = 12_000;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** The names of what goes into a Pack's file, by kind, as the text "Each part" starts with. Only the contents given here
 * are named. */
export function contentsText(contents: object): string {
  const out: string[] = [];
  let length = 0;
  let left = 0;
  for (const [kind, field, title] of KINDS) {
    const items = (contents as Record<string, Record<string, { name?: unknown }>[] | undefined>)[kind] ?? [];
    const names = items.map((x) => String(x[field]?.name ?? "").replace(/\*{2,}/g, "*")).filter(Boolean);
    const kept = names.filter((name) => (length + bytes(name) <= LISTED ? ((length += bytes(name)), true) : false));
    left += names.length - kept.length;
    if (!kept.length) continue;
    const lists = Array.from({ length: Math.ceil(kept.length / LIST) }, (_x, i) => kept.slice(i * LIST, (i + 1) * LIST).map((n) => `- ${n}`).join("\n"));
    out.push(`# ${title}\n${lists.join("\n\n")}`);
  }
  if (left) out.push(`And ${left} more.`);
  return out.join("\n\n");
}
