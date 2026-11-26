// Where a Pack's numbers come from, and what it brings and still needs (spec 0058, GLOSSARY: Comes From, Pack), before
// installing, in Help and at Set up: a table of the numbers and two short lists, all in Ziffr's words from the Pack's
// overview.
// Security: names, kinds of system and notes are a stranger's text. Each is a React text node; nothing of it is read as
// markup and nothing becomes a link.
import { comesFromWords, includedAndNeeded, type KeptOverview } from "@ziffr/pack/comes-from";

/** The table "Where the numbers come from": one row a number; on a phone the two columns sit under each other. */
function NumbersTable({ overview }: { overview: KeptOverview }) {
  if (!overview.numbers.length) return null;
  return (
    <table className="w-full border-collapse text-left">
      <caption className="pb-1.5 text-left font-medium">Where the numbers come from</caption>
      <thead className="sr-only"><tr><th scope="col">Number</th><th scope="col">Where it comes from</th></tr></thead>
      <tbody>
        {overview.numbers.map((n) => {
          const words = comesFromWords(n);
          return (
            <tr key={n.key} className="flex flex-col border-t border-border py-1.5 @md:table-row @md:py-0">
              <th scope="row" className="font-medium @md:w-2/5 @md:py-1.5 @md:pr-3 @md:align-top">{n.name}</th>
              <td className="@md:py-1.5 @md:align-top">
                {words.from}
                {words.delivered && <span className="block text-xs text-muted-foreground">{words.delivered}</span>}
                {n.note && <span className="block text-xs text-muted-foreground">{n.note}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One of the two lists, with its title. */
function Lines({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

/** "Included" and "What you still need": what installing brings, and what the installer provides on top. */
export function PackNeeds({ overview, included = true }: { overview: KeptOverview; included?: boolean }) {
  const lists = includedAndNeeded(overview, overview.targets);
  return (
    <div className="grid gap-3 @xl:grid-cols-2">
      {included && <Lines title="Included" lines={lists.included} />}
      <Lines title="What you still need" lines={lists.needed.length ? lists.needed : ["Nothing more than installing and setting up."]} />
    </div>
  );
}

/** Where a Pack's numbers come from, then what is included and what is still needed. It lays itself out by the room it
 * is given, a page or the side panel. */
export function PackNumbersView({ overview }: { overview: KeptOverview }) {
  return (
    <section aria-label="Where the numbers come from, and what you need" className="@container space-y-3 rounded-[var(--radius-input)] border border-input p-3 text-sm [overflow-wrap:anywhere]">
      <NumbersTable overview={overview} />
      <PackNeeds overview={overview} />
    </section>
  );
}
