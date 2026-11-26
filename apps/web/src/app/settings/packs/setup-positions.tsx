"use client";
// The Positions of Set up from this Pack and what to check before setting up (spec 0058, #1180; GLOSSARY: Position,
// Share, Submitter, Prompt): one picker per Position, then who will see what, every proposed Share with its own tick,
// the messages that go out and what stands in the way. The core works it all out and checks everything again.
import { useEffect, useState } from "react";
import { shown, unwrap } from "@/lib/action-error";
import { planSetUp } from "@/app/pack-setup-actions";
import type { PackSetupInput } from "@ziffr/core/pack-setup";
import type { PackSetupPlan } from "@ziffr/core/pack-setup-plan";

const field = "h-8 max-w-full rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";
const check = "mt-0.5 shrink-0 accent-[var(--color-ink)]";

/** The plan of what `build` asks for, asked again a moment after anything changes. `build` reads the last plan, so a
 * choice that follows from it (the only person there is) is made by itself. A proposed Share is ticked as the person
 * ticked it, else as the plan suggests. `current` says whether the plan shown is of what is asked for now. */
export function usePlan(installId: number, build: (plan: PackSetupPlan | null) => PackSetupInput | null, ticks: Record<string, boolean>) {
  const [last, setLast] = useState<{ plan: PackSetupPlan | null; asked: string; error: string | null }>({ plan: null, asked: "", error: null });
  const shares = (last.plan?.shares ?? []).filter((s) => ticks[s.id] ?? s.suggested).map((s) => s.id);
  const input = build(last.plan);
  const sent = input ? { ...input, shares } : null;
  const asked = sent ? JSON.stringify(sent) : "";
  useEffect(() => {
    if (!asked) return;
    let stale = false;
    const later = setTimeout(async () => {
      try {
        const plan = unwrap(await planSetUp(installId, JSON.parse(asked) as PackSetupInput));
        if (!stale) setLast({ plan, asked, error: null });
      } catch (e) {
        if (!stale) setLast((x) => ({ ...x, asked, error: shown(e) }));
      }
    }, 300);
    return () => { stale = true; clearTimeout(later); };
  }, [installId, asked]);
  const answered = last.asked === asked;
  return { plan: last.plan, input: sent, current: answered && !last.error, error: answered ? last.error : null };
}

type Planned = PackSetupPlan["positions"][number];

/** The picker of one Position: one person, or several. Someone who may not fill it is not offered, and why is said. */
export function PositionField({ position, people, chosen, onChange, of }: { position: Planned; people: PackSetupPlan["people"]; chosen: string[]; onChange: (ids: string[]) => void; /** The line the picker belongs to, for its name. */ of?: string }) {
  const why = new Map(position.refused.map((r) => [r.id, r.why]));
  const offered = people.filter((p) => !why.has(p.id));
  const refused = people.filter((p) => why.has(p.id));
  // The Pack's own word, which may be one or many people ("Observers"), so the question never changes its number.
  const label = `Who is the ${position.name}?${position.several ? " Pick one or more." : ""}${of ? ` (${of})` : ""}`;
  return (
    <div className="space-y-1">
      {position.several ? (
        <fieldset>
          <legend className="text-xs font-medium">{label}</legend>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {offered.map((p) => (
              <li key={p.id}><label className="flex items-start gap-2"><input type="checkbox" className={check} checked={chosen.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} /> {p.name}</label></li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <label className="flex flex-wrap items-center gap-2">
          <span className="w-44 text-xs font-medium">{label}</span>
          <select className={field} aria-label={label} value={chosen[0] ?? ""} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}>
            <option value="">Nobody yet</option>
            {offered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <p className="text-xs text-muted-foreground">Whoever fills it {position.places}.</p>
      {refused.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Why is someone missing?</summary>
          <ul className="mt-1 list-disc pl-4">{refused.map((p) => <li key={p.id}>{p.name}: {why.get(p.id)}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

const many = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const asks = (list: PackSetupPlan["messages"]["now"]) => list.map((m) => `${m.name} (${m.count})`).join(", ");

/** What a proposed Share does for the person's sight, in words. */
const shows = (s: PackSetupPlan["shares"][number]) => (s.keeps ? "lets them see a number they are not asked for" : s.showsMore ? "shows them more" : "shows them no more than they see");

/** What adding a line does not change of what is there, for the person to do by hand. */
export function ByHand({ items }: { items: string[] }) {
  return (
    <div className="mt-2 text-xs">
      <p className="font-medium">Left to do by hand</p>
      <ul className="list-disc space-y-0.5 pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

/** What to check before setting up: what is made, who will see what, the proposed Shares, what a new line is added to,
 * the messages and the rest. */
export function PlanCheck({ plan, ticks, onTick, askNow, onAskNow, offerTicks, onOffer }: { plan: PackSetupPlan; ticks: Record<string, boolean>; onTick: (changes: Record<string, boolean>) => void; askNow: boolean; onAskNow: (v: boolean) => void; offerTicks: Record<string, boolean>; onOffer: (id: string, on: boolean) => void }) {
  const byPerson = [...new Set(plan.shares.map((s) => s.person))];
  return (
    <section aria-label="Check before you set up" className="space-y-3 rounded-[var(--radius-input)] bg-muted p-3 [overflow-wrap:anywhere]">
      <h4 className="font-medium">Check before you set up</h4>
      <details className="text-xs">
        <summary className="cursor-pointer">Makes {many(plan.makes.metrics.length, "Metric")}, {many(plan.makes.dashboards.length, "dashboard")} and {many(plan.makes.workflows.length, "Workflow")}.</summary>
        <p className="mt-1">{[...plan.makes.metrics, ...plan.makes.dashboards.map((d) => `the dashboard ${d}`), ...plan.makes.workflows.map((w) => `the Workflow ${w}`)].join("; ")}</p>
      </details>

      <div>
        <h5 className="text-xs font-medium">Who will see what</h5>
        <ul className="mt-1 space-y-1">
          {plan.sees.map((p) => (
            <li key={p.id}>
              {p.metrics.length === 0 ? <p className="text-xs"><span className="font-medium">{p.name}</span> sees none of these Metrics.</p> : (
                <details className="text-xs" open={p.metrics.length <= 6}>
                  <summary className="cursor-pointer"><span className="font-medium">{p.name}</span> sees {many(p.metrics.length, "Metric")}</summary>
                  <ul className="mt-0.5 list-disc pl-5">{p.metrics.map((m, i) => <li key={i}>{m.name} <span className="text-muted-foreground">({m.why.join(", ")})</span></li>)}</ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>

      {plan.shares.length > 0 && (
        <div>
          <h5 className="text-xs font-medium">Shares the Pack proposes</h5>
          <p className="text-xs text-muted-foreground">Only what is ticked is shared. A Share that would show someone more, or lets them change something, starts unticked.{plan.shares.some((s) => s.keeps && s.suggested) && " One that lets a person see a number they would submit, but are not asked for, starts ticked."}</p>
          {byPerson.map((person) => {
            const theirs = plan.shares.filter((s) => s.person === person);
            const on = theirs.filter((s) => ticks[s.id] ?? s.suggested).length;
            return (
              <fieldset key={person} className="mt-2">
                <legend className="text-xs font-medium">Share with {person} ({on} of {theirs.length} ticked)</legend>
                {theirs.length > 1 && (
                  <button type="button" className="text-xs underline" onClick={() => onTick(Object.fromEntries(theirs.map((s) => [s.id, on < theirs.length])))}>
                    {on < theirs.length ? `Tick all for ${person}` : `Untick all for ${person}`}
                  </button>
                )}
                <ul className="mt-1 space-y-1">
                  {theirs.map((s) => (
                    <li key={s.id}>
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" className={check} checked={ticks[s.id] ?? s.suggested} onChange={(e) => onTick({ [s.id]: e.target.checked })} />
                        <span>The {s.kind} {s.item}, as {s.role === "editor" ? "Editor" : "Viewer"} <span className="text-muted-foreground">({shows(s)}{s.role === "editor" ? ", and lets them change it" : ""})</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      )}

      {plan.offers.length > 0 && (
        <fieldset className="space-y-1 text-xs">
          <legend className="font-medium">Add to what is set up</legend>
          {plan.offers.map((o) => (
            <label key={o.id} className="flex items-start gap-2"><input type="checkbox" className={check} checked={offerTicks[o.id] ?? o.suggested} onChange={(e) => onOffer(o.id, e.target.checked)} /> <span>{o.words}</span></label>
          ))}
        </fieldset>
      )}
      {plan.byHand.length > 0 && <ByHand items={plan.byHand} />}

      <div className="text-xs">
        <h5 className="font-medium">Messages</h5>
        <p>{plan.messages.now.length ? `Requests for values sent now: ${asks(plan.messages.now)}.` : "No request for values goes out now."}</p>
        {plan.messages.nextRun.length > 0 && <p>Asked at the Workflow&rsquo;s next run: {asks(plan.messages.nextRun)}.</p>}
        {plan.messages.unasked.length > 0 && <p>Nothing asks these by itself, as their Metrics follow no Workflow: {asks(plan.messages.unasked)}.</p>}
        {plan.notAsked.map((x) => <p key={x}>{x}</p>)}
        {plan.messages.others > 0 && (
          <label className="mt-1 flex items-start gap-2"><input type="checkbox" className={check} checked={askNow} onChange={(e) => onAskNow(e.target.checked)} /> Ask the others for the current period now ({many(plan.messages.others, "message")})</label>
        )}
      </div>

      {plan.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs">{plan.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {plan.problems.length > 0 && (
        <div role="alert" className="text-xs">
          <p className="font-medium">Before you can set up:</p>
          <ul className="list-disc space-y-0.5 pl-5">{plan.problems.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
