// Questions you can ask about a Metric (GLOSSARY: Metric, Method, Analysis Canvas; ticket #988): the picker's entries that fit this
// Metric on its own, from the same list the Analyze screen offers, so the newer Methods are reachable from the Metric's own page. The
// list comes from the core for the acting person (listPicker puts only Metrics they see on it, and this one is theirs to see here); an
// entry that does not fit stays, greyed, with its reason in words. "See all questions" opens Analyze with this Metric on the canvas.
import Link from "next/link";
import { Lock } from "lucide-react";
import type { Actor } from "@ziffr/core/actor";
import { listPicker, type EntryView } from "@ziffr/core/analysis-picker";
import { cn } from "@/lib/utils";

/** How many fitting entries and how many greyed ones the card shows. */
const SHOWN = { fit: 4, grey: 2 };

/** The entries to show: the first that fit, then a few that do not, each with the reason. */
export function questionsToShow(entries: EntryView[]): EntryView[] {
  return [...entries.filter((e) => e.fit.ok).slice(0, SHOWN.fit), ...entries.filter((e) => !e.fit.ok).slice(0, SHOWN.grey)];
}

/** The card of questions for one Metric. */
export function QuestionsList({ name, slug, entries }: { name: string; slug: string; entries: EntryView[] }) {
  const shown = questionsToShow(entries);
  return (
    <section aria-label={`Questions you can ask about ${name}`} className="mt-6 border-t border-[var(--color-rule-2)] pt-5">
      <h3 className="text-sm font-medium">Questions you can ask about {name}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {shown.map((e) => (
          <li key={e.id} className={cn("rounded-[var(--radius-stock)] p-2.5 text-sm", e.fit.ok ? "stock" : "border border-dashed border-[var(--color-rule-2)] text-muted-foreground")}>
            <span className="flex items-baseline gap-1.5 font-medium">{e.name}{!e.fit.ok && <Lock aria-hidden className="size-3 self-center" />}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{e.fit.ok ? e.sentence : e.fit.reason}</span>
          </li>
        ))}
      </ul>
      <Link href={`/analyze?metric=${encodeURIComponent(slug)}`} className="mt-3 inline-block text-sm underline underline-offset-2 hover:text-foreground">See all questions</Link>
    </section>
  );
}

/** Asks the core for the list with this Metric as the only one on the canvas, and draws it. */
export async function MetricQuestions({ actor, id, name, slug }: { actor: Actor; id: number; name: string; slug: string }) {
  const list = await listPicker(actor, [id], id);
  return <QuestionsList name={name} slug={slug} entries={list.groups.flatMap((g) => g.entries)} />;
}
