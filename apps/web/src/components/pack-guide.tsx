// A Pack Guide as a person reads it (spec 0058, GLOSSARY: Pack Guide), before installing a Pack and, with the installed
// Pack, in Help: the five sections under the titles Ziffr writes, each its headings, paragraphs and lists.
// Security: a guide is text from a stranger. Every text is a React text node, split into plain and bold runs by
// `guideRuns`; nothing of it is read as Markdown or HTML, and nothing becomes a link, a picture or an attribute.
import { guideRuns, PACK_GUIDE_SECTIONS, type PackGuide, type PackGuideBlock, type PackGuideSection } from "@ziffr/pack/pack-guide";

/** The sections that answer "what is it for" and "how do I start": open when the guide appears. */
const OPEN_FIRST: readonly PackGuideSection[] = ["whatItsFor", "firstSteps"];

/** A paragraph or list entry: plain and bold runs, as text. */
function Runs({ text }: { text: string }) {
  return <>{guideRuns(text).map((r, i) => (r.bold ? <strong key={i} className="font-semibold">{r.text}</strong> : <span key={i}>{r.text}</span>))}</>;
}

/** One heading, paragraph or list of a section. */
function Block({ block }: { block: PackGuideBlock }) {
  if (block.type === "heading") return <h4 className="pt-1 font-semibold">{block.text}</h4>;
  if (block.type === "text") return <p><Runs text={block.text} /></p>;
  const List = block.numbered ? "ol" : "ul";
  return (
    <List className={`space-y-1 pl-5 ${block.numbered ? "list-decimal" : "list-disc"}`}>
      {block.items.map((x, i) => <li key={i}><Runs text={x} /></li>)}
    </List>
  );
}

/** Whether a guide has anything to read: one without a section draws nothing. */
export const hasPackGuide = (guide: PackGuide): boolean => PACK_GUIDE_SECTIONS.some((s) => guide[s.key]?.length);

/** A Pack's guide, section by section; a section opens and closes, and what the Pack is for and the first steps start
 * open (the first section there is, when the guide has neither). Draws nothing for a guide without a section. */
export function PackGuideView({ guide, author }: { guide: PackGuide; author: string }) {
  const filled = PACK_GUIDE_SECTIONS.filter((s) => guide[s.key]?.length);
  if (!filled.length) return null;
  const first = filled.some((s) => OPEN_FIRST.includes(s.key)) ? OPEN_FIRST : [filled[0].key];
  return (
    <section aria-label="Pack Guide" className="rounded-[var(--radius-input)] border border-input text-sm [overflow-wrap:anywhere]">
      <p className="px-3 pt-2.5 text-xs text-muted-foreground">Guide to this Pack, written by {author}.</p>
      {filled.map((s) => (
        <details key={s.key} open={first.includes(s.key)} className="border-b border-border px-3 last:border-b-0">
          <summary className="cursor-pointer py-2.5 font-medium">{s.title}</summary>
          <div className="space-y-2 pb-3">{guide[s.key]!.map((b, i) => <Block key={i} block={b} />)}</div>
        </details>
      ))}
    </section>
  );
}
