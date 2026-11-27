"use client";
// The first requests of a Set up from a Pack (spec 0058; GLOSSARY: Pack, Prompt, Submitter, Workflow): the one tick
// that sends them, off until chosen, saying how many messages go to whom, and on the finished screen what went out and
// when the rest is asked. Used on the Packs page and in the Setup Guide.
import Link from "next/link";
import type { PackSetupOptions, PackSetupResult } from "@ziffr/core/pack-setup";
import type { PackSetupPlan } from "@ziffr/core/pack-setup-plan";

/** Who would get how many requests. */
type Recipients = PackSetupPlan["messages"]["ifSent"];

const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
/** The most people named one by one beside the tick; past it they are counted. */
const NAMED_MAX = 6;

/** What the person setting up gets when they are the only one picked: one request for each Metric they would submit.
 * A number the Pack says nobody types counts only when they chose to be asked for it. The core decides again. */
export function ownRequests(entries: PackSetupOptions["entries"], making: ReadonlySet<string>, askElsewhere: boolean): Recipients {
  const count = entries.filter((e) => making.has(e.key) && !e.derived && (askElsewhere || (e.comesFrom?.by !== "system" && e.comesFrom?.by !== "target"))).length;
  return count ? [{ name: "you", count, you: true }] : [];
}

/** "13 messages to you", or "13 messages to you, 4 messages to Anna". */
function toWhom(to: Recipients): string {
  if (to.length > NAMED_MAX) return `${many(to.reduce((n, p) => n + p.count, 0), "message")} to ${to.length} people`;
  return to.map((p) => `${many(p.count, "message")} to ${p.you ? "you" : p.name}`).join(", ");
}

/** The tick that sends the first requests when setting up; nothing is shown where there is nobody to ask. `followed`
 * says whether a Workflow is picked, to say when they are asked otherwise; left out where the plan above says it. */
export function SendFirstRequests({ to, checked, onChange, followed }: { to: Recipients; checked: boolean; onChange: (send: boolean) => void; followed?: boolean }) {
  if (!to.length) return null;
  const otherwise = followed === undefined ? "" : followed ? " The Workflow asks at its next run." : " No Workflow is picked, so nothing asks by itself.";
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 shrink-0 accent-[var(--color-ink)]" />
      <span className="[overflow-wrap:anywhere]">Send the first requests now: {toWhom(to)}<span className="block text-xs text-muted-foreground">{checked ? "One message for each Metric and person, for the period that ended last." : `Unticked, setting up sends no request.${otherwise}`}</span></span>
    </label>
  );
}

/** The named Metrics, each linked to its page. */
function Named({ metrics }: { metrics: PackSetupResult["later"]["noWorkflow"] }) {
  return <>{metrics.map((m, i) => <span key={m.id}>{i > 0 && ", "}<Link href={`/metrics/${m.slug}`} className="underline">{m.name}</Link></span>)}</>;
}

/** After Set up: how many requests went out, and when what was not asked yet is asked. */
export function RequestsAfterSetUp({ made }: { made: Pick<PackSetupResult, "messages" | "later" | "stoppedNote"> }) {
  const { nextRun, noWorkflow } = made.later;
  const mine = noWorkflow.filter((m) => m.mine), theirs = noWorkflow.filter((m) => !m.mine);
  return (
    <div className="space-y-1 text-xs [overflow-wrap:anywhere]">
      <p>{made.messages ? `${many(made.messages, "request")} for values sent now.` : "No request for values was sent."}</p>
      {made.stoppedNote && <p className="font-medium">{made.stoppedNote}</p>}
      {nextRun > 0 && <p>{many(nextRun, "Metric")} {nextRun === 1 ? "is" : "are"} asked for at the Workflow&rsquo;s next run.</p>}
      {mine.length > 0 && <p>No Workflow asks you for <Named metrics={mine} />. To be asked, open the Metric and choose Ask me now in its menu, or give it a Workflow.</p>}
      {theirs.length > 0 && <p>Nothing asks for <Named metrics={theirs} /> by itself. A Workflow on the Metric asks for its values.</p>}
    </div>
  );
}
