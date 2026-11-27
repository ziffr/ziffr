"use client";
// The end of a guided Pack set-up (spec 0068; GLOSSARY: Pack, Submitter, Prompt, Outbox, Automation Template): who is
// asked and from when, what is still missing, and the ways to what was made. It shows only what the server answered to
// this Owner or Admin about what they just made.
import Link from "next/link";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_ACTIONS, PHONE_TEXT_LINK } from "@/app/setup/phone";
import { FillFromN8n } from "@/components/fill-from-n8n";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@ziffr/core/format";
import type { PackStartResult } from "@ziffr/core/pack-start";
import type { StartDeclarations } from "@ziffr/core/pack-start-steps";
import { cn } from "@/lib/utils";
import { Lines, NOTE } from "./parts";
import { namesWords } from "./providers";

type Props = {
  result: PackStartResult;
  declarations: StartDeclarations;
  /** The Feeds a template download may send through. */
  feeds: { id: string; name: string }[];
};

const count = (n: number) => `${n} ${n === 1 ? "number" : "numbers"}`;
const OPEN = cn(buttonVariants({ variant: "default" }), "h-11 w-full sm:h-9 sm:w-auto sm:px-6");
const ALSO = cn(buttonVariants({ variant: "outline" }), "h-11 w-full sm:h-9 sm:w-auto");

/** One line for each person asked: how many numbers, and from when. */
const askedLines = (result: Pick<PackStartResult, "asked">) => result.asked.map((a) => {
  const who = a.you ? "You" : a.name;
  const when = a.from ? `asked from ${formatDate(a.from)}` : "nothing asks by itself";
  return `${who}: ${count(a.metrics.length)}, ${when}.`;
});

/** What was made, who is asked, what is missing. */
export function DoneScreen({ result, declarations, feeds }: Props) {
  const system = new Set(declarations.metrics.filter((m) => m.comesFrom === "system").map((m) => m.key));
  const fromSystem = result.metrics.filter((m) => system.has(m.key));
  const waits = result.asked.some((a) => !a.from);
  const [board, ...boards] = result.dashboards;
  const [deck, ...decks] = result.decks;
  return (
    <>
      <ScreenHeading title={`${result.pack.name} is set up`}>{result.asked.length ? "Nothing was sent just now." : "Nothing asks anyone yet."}</ScreenHeading>
      <div className="space-y-5">
        <div className={PHONE_ACTIONS}>
          {board && <Link href={`/dashboards/${board.id}`} className={OPEN}>Open the dashboard</Link>}
          {deck && <Link href={`/decks/${deck.id}/present`} className={board ? ALSO : OPEN}>Open the slides</Link>}
          {!board && !deck && <Link href="/metrics" className={OPEN}>Open your Metrics</Link>}
        </div>
        <Lines title="Who is asked" items={askedLines(result)} />
        {waits && <p className={NOTE}>Where nothing asks by itself, ask from the Metric&rsquo;s page, or give it a Workflow.</p>}
        {!result.mail && result.asked.length > 0 && <p className={NOTE}>Email is not set up here, so requests wait in the Outbox.</p>}
        {result.unasked.length > 0 && (
          <section aria-label="Nobody provides these yet" className="space-y-1.5">
            <h2 className="text-sm font-medium text-muted-foreground">Nobody provides these yet</h2>
            <ul className="stock divide-y divide-border rounded-[var(--radius-card)] px-4 text-sm">
              {result.unasked.map((m) => (
                <li key={m.id} className="py-1 break-words"><Link href={`/metrics/${m.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-8">{m.name}</Link></li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">Open one to choose who provides it.</p>
          </section>
        )}
        <Lines title="Good to know" items={[
          ...result.held.map((h) => (h.approves ? `You approve until ${h.for.name} has joined.` : `You are ${h.name} until ${h.for.name} has joined.`)),
          ...(result.targets ? [`Targets are set for ${count(result.targets)}.`] : []),
          ...(result.needsFirstValue && result.invite.length ? ["Your colleagues can be invited once you have sent one value yourself."] : []),
        ].filter((v, i, all) => all.indexOf(v) === i)} />
        <Lines title="Left out" items={result.leftOut.map((l) => `Not made: ${l.name}. ${l.why}`)} />
        {result.source === "system" && fromSystem.length > 0 && (
          <section aria-label="Connect your system" className="text-sm">
            <h2 className="text-sm font-medium text-muted-foreground">Connect your system</h2>
            <p>{namesWords(fromSystem.map((m) => m.name))}: typed by hand until your system sends them. Once it is connected, remove the people from those Metrics.</p>
            <FillFromN8n metrics={fromSystem} feeds={feeds} templates={result.templates} />
            {result.templates.length === 0 && <p className="text-muted-foreground">This Pack has no ready template for it.</p>}
          </section>
        )}
        {(boards.length > 0 || decks.length > 0) && (
          <p className="flex flex-wrap gap-x-4 text-sm">
            {boards.map((d) => <Link key={d.id} href={`/dashboards/${d.id}`} className={PHONE_TEXT_LINK}>{d.name}</Link>)}
            {decks.map((d) => <Link key={d.id} href={`/decks/${d.id}/present`} className={PHONE_TEXT_LINK}>{d.name}</Link>)}
          </p>
        )}
      </div>
    </>
  );
}
