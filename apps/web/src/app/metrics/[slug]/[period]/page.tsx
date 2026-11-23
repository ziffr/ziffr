// A Period Record (GLOSSARY: Period Record): one Metric's value for one period, every step it went through, and its
// Threads. The core decides what this person may see; this page only shows it.
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { currentActor } from "@/lib/viewer";
import { getNumberStyle, getYearStart } from "@/lib/data";
import { periodRecord, type PeriodStep } from "@ziffr/core/period-record";
import { formatValue } from "@ziffr/core/format";
import { periodLabel } from "@ziffr/core/periods";
import { StatusBadge } from "@/components/status";
import { periodRecordUrl } from "@/lib/period-record-url";
import type { PeriodStateName } from "@ziffr/core/types";
import { FillIn } from "../fill-in";

const STATE: Record<PeriodStateName, string> = { asked: "Asked, waiting for the value", submitted: "In, not approved yet", approval: "Waiting for Approval", published: "Published", locked: "Locked" };

/** One step in the words of the history list; the value is struck through where a later step replaced it. */
function StepLine({ s, text }: { s: PeriodStep; text: (v: number | null) => string }) {
  const words: Record<PeriodStep["kind"], string> = {
    submitted: "Submitted", filled_in: "Entered", replaced: "Replaced by", correction_proposed: "Correction proposed", correction_accepted: "Correction accepted", correction_declined: "Correction declined",
    approved: "Approved", sent_back: "Sent back", published: "Published", locked: "Period locked", unlocked: "Period unlocked",
  };
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
      <span className="text-xs text-muted-foreground">{s.at ? format(new Date(s.at), "d MMM yyyy") : ""}</span>
      <span>
        <span className="font-medium">{words[s.kind]}</span>
        {s.value !== null && <> <span className={s.superseded ? "fig text-muted-foreground line-through" : "fig"}>{text(s.value)}</span></>}
        <span className="text-muted-foreground">
          {/* A Filled-in Value says whose it is and who typed it (GLOSSARY: Filled-in Value): never one without the other. */}
          {s.kind === "filled_in" && s.enteredBy ? <> by {s.enteredBy} for {s.person}</> : s.person && <> by {s.person}</>}
          {s.channel && <> via {s.channel}</>}
        </span>
        {s.reason && <span className="block text-xs text-muted-foreground">Reason: {s.reason}</span>}
      </span>
    </li>
  );
}

/** One Metric's page for one period; `period` is its first day (YYYY-MM-DD), or YYYY-MM for a month. */
export default async function PeriodRecordPage({ params }: { params: Promise<{ slug: string; period: string }> }) {
  const { slug, period: asked } = await params;
  // A month may be written as 2026-03: the same page as 2026-03-01.
  if (/^\d{4}-\d{2}$/.test(asked)) redirect(periodRecordUrl(slug, `${asked}-01`));
  const [record, yearStart, numberStyle] = await Promise.all([currentActor().then((a) => periodRecord(a, slug, asked)), getYearStart(), getNumberStyle()]);
  // Not shared with this person is the same as not there: nothing is said of a Metric they may not see.
  if (!record) notFound();
  const { metric: m } = record;
  const write = (v: number | null) => formatValue(m, v, numberStyle);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/metrics/${m.slug}?tab=history`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {m.name}</Link>
      <section className="stock rounded-[var(--radius-card)] p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/metrics/${m.slug}`} className="font-medium text-foreground hover:underline">{m.name}</Link>
          <span>{periodLabel(record.period, m.period, yearStart)}</span>
          {record.state && <span className={record.state === "locked" ? "pressed text-xs" : "rounded-[var(--radius-input)] border border-[var(--color-rule-2)] px-1.5 py-0.5 text-xs font-medium text-foreground"}>{STATE[record.state]}</span>}
        </div>
        <h1 className="fig mt-2 text-4xl font-semibold">
          {record.value === null ? "No value yet" : write(record.value)}
          {record.originalValue !== null && <span className="ml-3 align-middle text-lg font-normal text-muted-foreground line-through">{write(record.originalValue)}</span>}
        </h1>
        {record.note && <p className="mt-2 text-xs text-muted-foreground">{record.note}</p>}
        {/* Only for the Metric's owner, its Workflow's owner and a Stand-in who may fill in (the core decides, fill-in-offer.ts). */}
        {record.fillIn && (
          <div id="fill-in" className="mt-4">
            <FillIn offer={record.fillIn} metricName={m.name} periodLabel={periodLabel(record.period, m.period, yearStart)} placeholder={m.unit || "Value"} numberStyle={numberStyle} />
          </div>
        )}
      </section>

      <section className="mt-4 stock rounded-[var(--radius-card)] p-5">
        <h2 className="mb-1 font-medium">History</h2>
        {record.steps.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has happened to this period yet.</p> : (
          <ol>{record.steps.map((s, i) => <StepLine key={i} s={s} text={write} />)}</ol>
        )}
      </section>

      <section className="mt-4">
        <h2 className="mb-2 flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> Threads</h2>
        {record.threads.length === 0 ? <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">No Thread about this period that you may read.</p> : (
          <ul className="space-y-3">
            {record.threads.map((t) => (
              <li key={t.id} className="stock rounded-[var(--radius-card)] p-4">
                <Link href={`/actions/${t.id}`} className="flex flex-wrap items-center gap-2 no-underline hover:underline">
                  <StatusBadge status={t.status} kind={t.kind} size="sm" />
                  <span className="font-medium">{approvalQuestionForWeb(t.question)}</span>
                </Link>
                {t.first && <p className="mt-2 whitespace-pre-wrap text-sm"><span className="font-medium">{t.first.person}:</span> {t.first.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{t.replies === 0 ? "No replies yet" : `${t.replies} ${t.replies === 1 ? "reply" : "replies"}`}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
