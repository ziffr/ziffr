"use client";
// Set up from this Pack (spec 0030, ticket 277, spec 0058; GLOSSARY: Pack, Metric Catalog, Derived Metric, Slot,
// Workflow Template, Position, Repeat, Workspace Limit): an installed Pack's entries made into Metrics, its Dashboard
// Templates into dashboards and its Workflow Templates into Workflows, as the person picks, with the lines of its
// Repeats and the people of its Positions. A large set is made in steps. The core checks everything again, the
// Workspace Limit included, and makes nothing when anything is refused.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { approversStart, openSlots, setupStart, type LineRow } from "./setup-defaults";
import { DashboardPick, WorkflowPick } from "./setup-templates";
import { RepeatLines } from "./setup-lines";
import { FillFromN8n } from "@/components/fill-from-n8n";
import { packSetup, setUpPack } from "@/app/pack-setup-actions";
import { PlanCheck, PositionField, usePlan } from "./setup-positions";
import type { PackSetupInput, PackSetupOptions, PackSetupResult, PackSetupRoom, PackSetupStep, SetupRun } from "@ziffr/core/pack-setup";

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

/** The button that opens setting up from one installed Pack, and the form it opens. */
export function SetUpFromPack({ installId, viewer }: { installId: number; viewer: string }) {
  const [options, setOptions] = useState<PackSetupOptions | null>(null);
  const [pending, start] = useTransition();
  const open = () => start(async () => {
    try { setOptions(unwrap(await packSetup(installId))); } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });
  if (!options) return <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={open}><Wand2 aria-hidden /> Set up from this Pack</Button>;
  return <SetUpForm options={options} viewer={viewer} onClose={() => setOptions(null)} />;
}

/** What making `n` Metrics does to the Workspace's limit, said before the button is pressed: it fits, it goes over the
 * Size within the room and its days over, or it does not fit. Numbers only; the core checks again on Set up. */
function Fit({ room, n }: { room: PackSetupRoom; n: number }) {
  const where = room.label ? `Size ${room.label}` : "the limit";
  const way = <>Untick some, archive Metrics, or <Link href="/settings/workspace#size" className="underline">change the Size</Link>.</>;
  if (n === 0) return <p className="text-xs text-muted-foreground">{room.left.toLocaleString("en-US")} of {room.limit.toLocaleString("en-US")} Metrics left in {where}.</p>;
  if (n > room.allowed) return <p role="alert" className="font-medium">Makes {n} Metric{n === 1 ? "" : "s"}, but only {room.allowed} fit now ({room.left.toLocaleString("en-US")} of {room.limit.toLocaleString("en-US")} left in {where}). {way}</p>;
  if (n > room.left) return <p role="status" className="text-xs">Makes {n} Metric{n === 1 ? "" : "s"}: {n - room.left} more than {where} holds ({room.left.toLocaleString("en-US")} of {room.limit.toLocaleString("en-US")} left). The Workspace may be over its limit for {room.graceDays} days; after that new Metrics wait. <Link href="/settings/workspace#size" className="underline">Size and usage</Link></p>;
  return <p className="text-xs text-muted-foreground">Makes {n} Metric{n === 1 ? "" : "s"}: {room.left - n} of {room.limit.toLocaleString("en-US")} left in {where} afterwards.</p>;
}

/** Sets up in as many steps as it takes, saying how far it is after each, and answers what was made. */
async function setUpInSteps(installId: number, input: PackSetupInput, progress: (words: string) => void): Promise<PackSetupResult> {
  const tagsLeftOut: PackSetupResult["tagsLeftOut"] = [];
  let run: SetupRun | null = null;
  for (;;) {
    const step: PackSetupStep = unwrap(await setUpPack(installId, input, run));
    if (step.done) return { ...step.result, tagsLeftOut: [...tagsLeftOut, ...step.result.tagsLeftOut] };
    tagsLeftOut.push(...step.tagsLeftOut);
    run = step.run;
    progress(`Made ${step.made} of ${step.of} Metrics\u2026`);
  }
}

/** After Set up: the templates the Pack says fill its entries, each for the Metrics made from them (spec 0043); when it
 * names none that applies, any template for every Metric that takes values. Derived Metrics are left out: they take none. */
function FillAfterSetUp({ options, made }: { options: PackSetupOptions; made: PackSetupResult }) {
  const values = made.metrics.filter((m) => m.takesValues);
  const named = options.suggestedFeeds.flatMap((s) => {
    const template = options.templates.find((t) => t.id === s.template);
    const metrics = values.filter((m) => s.fills.includes(m.key));
    return template && metrics.length ? [{ template, metrics }] : [];
  });
  if (!values.length) return null;
  if (!named.length) return <FillFromN8n metrics={values} feeds={options.feeds} templates={options.templates} />;
  return (
    <>
      {named.map(({ template, metrics }) => (
        <div key={template.id} className="mt-3">
          <p className="text-xs">{options.install.name} says {template.label} can fill {metrics.map((m) => m.name).join(", ")}.</p>
          <FillFromN8n metrics={metrics} feeds={options.feeds} templates={[template]} />
        </div>
      ))}
    </>
  );
}

function SetUpForm({ options, viewer, onClose }: { options: PackSetupOptions; viewer: string; onClose: () => void }) {
  const router = useRouter();
  const [start0] = useState(() => setupStart(options, viewer));
  const [picked, setPicked] = useState<Set<string>>(start0.picked);
  const [askMe, setAskMe] = useState(true);
  // The dashboard and the Workflow picked, by scope: "" for the whole set, else the Repeat's key.
  const [boards, setBoards] = useState<Record<string, string>>({ ...start0.lineDashboards, "": start0.dashboard });
  const [flows, setFlows] = useState<Record<string, string>>({ ...start0.lineWorkflows, "": start0.workflow });
  const [fills, setFills] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<string>("");
  const [approversBy, setApproversBy] = useState<Record<string, string[]>>(start0.workflow ? { [start0.workflow]: start0.approvers } : {});
  const [lines, setLines] = useState<Record<string, LineRow[]>>(() => Object.fromEntries(options.repeats.map((r) => [r.key, [{ id: 1, name: "", fills: {} }]])));
  const [made, setMade] = useState<PackSetupResult | null>(null);
  const [progress, setProgress] = useState("");
  const [pending, start] = useTransition();
  const [positionFills, setPeople] = useState<Record<string, string[]>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [askNow, setAskNow] = useState(false);
  const byKey = useMemo(() => new Map(options.entries.map((e) => [e.key, e])), [options.entries]);

  // A Derived Metric's inputs are made with it: shown ticked, and kept while it is.
  const making = useMemo(() => {
    const all = new Set(picked);
    for (const k of picked) for (const i of byKey.get(k)?.inputs ?? []) all.add(i);
    return all;
  }, [picked, byKey]);
  const scopes = [null, ...options.repeats];
  const templates = scopes.flatMap((r) => options.dashboards.find((d) => d.key === boards[r?.key ?? ""]) ?? []);
  const workflows = scopes.flatMap((r) => options.workflows.find((w) => w.key === flows[r?.key ?? ""]) ?? []);
  const approversOf = (w: PackSetupOptions["workflows"][number]) => approversBy[w.key] ?? approversStart(options, viewer, w.approvers);
  // Whether the person is still asked for anything themselves: for every Metric no Position covers.
  const uncovered = [...making].some((k) => !byKey.get(k)?.asksPosition && !byKey.get(k)?.derived);
  const pickOf = (d: PackSetupOptions["dashboards"][number]) => ({ key: d.key, fills: d.slots.map((_s, i) => (fills[`${d.key} ${i}`] ? [fills[`${d.key} ${i}`]!] : null)) });
  const flowOf = (w: PackSetupOptions["workflows"][number]) => ({ key: w.key, approvers: approversOf(w) });
  const [shared, sharedFlow] = [templates.find((d) => !d.repeat), workflows.find((w) => !w.repeat)];
  const asked: PackSetupInput = {
    metrics: [...making],
    submitters: askMe && uncovered ? [viewer] : [],
    feed: feed || null,
    dashboard: shared ? pickOf(shared) : null,
    workflow: sharedFlow ? flowOf(sharedFlow) : null,
    lineDashboards: templates.filter((d) => d.repeat).map(pickOf),
    lineWorkflows: workflows.filter((w) => w.repeat).map(flowOf),
  };
  // Who fills a Position: as picked, and by itself the only person there is.
  const chosen = (plan: Parameters<Parameters<typeof usePlan>[1]>[0], from: Record<string, string[]>, key: string): string[] => {
    const alone = plan?.people.length === 1 && plan.people[0]!.id === viewer && !plan.positions.find((p) => p.key === key)?.refused.some((r) => r.id === viewer);
    return from[key] ?? (alone ? [viewer] : []);
  };
  const planned = usePlan(options.install.id, (plan) => {
    if (!options.positions || made) return null;
    const fillsFor = (repeat: string | null, from: Record<string, string[]>) => (plan?.positions ?? []).filter((p) => p.repeat === repeat).map((p) => ({ position: p.key, people: chosen(plan, from, p.key) }));
    return {
      ...asked, askNow, people: fillsFor(null, positionFills),
      lines: options.repeats.flatMap((r) => (lines[r.key] ?? []).filter((l) => l.name.trim()).map((l) => ({ repeat: r.key, name: l.name.trim(), people: fillsFor(r.key, l.fills) }))),
    };
  }, ticks);
  const count = options.positions ? planned.plan?.makes.metrics.length ?? 0 : making.size;
  // A line with people but no name would be left out without a word.
  const unnamed = Object.values(lines).some((rows) => rows.some((l) => !l.name.trim() && Object.values(l.fills).some((x) => x.length)));
  const ready = (making.size > 0 || templates.length > 0 || workflows.length > 0)
    && templates.every((d) => openSlots(options, d, making).every(({ index }) => fills[`${d.key} ${index}`]))
    && workflows.every((w) => { const a = approversOf(w); return a.length === w.approvers && a.every(Boolean) && new Set(a).size === a.length; })
    && (!options.positions || (planned.current && !planned.plan?.problems.length && !unnamed));

  const toggle = (key: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(key); else n.delete(key); return n; });
  const submit = () => start(async () => {
    try {
      setMade(await setUpInSteps(options.install.id, options.positions ? planned.input! : asked, setProgress));
      toast.success(`Set up from ${options.install.name}`);
      router.refresh();
    } catch (e) {
      toast.error("Set up did not finish", { description: shown(e), duration: Infinity, closeButton: true });
      router.refresh();
    } finally {
      setProgress("");
    }
  });

  if (made) {
    return (
      <div className="mt-3 rounded-[var(--radius-input)] border border-input p-3 text-sm" aria-live="polite">
        <p className="font-medium">Set up from {options.install.name}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {made.metrics.map((m) => <li key={m.id}><Link href={`/metrics/${m.slug}`} className="underline">{m.name}</Link></li>)}
          {made.dashboards.map((d) => <li key={d.id}>The dashboard <Link href={`/dashboards/${d.id}`} className="underline">{d.name}</Link></li>)}
          {made.workflows.map((w) => <li key={w.id}>The Workflow <Link href={`/workflows?id=${w.id}`} className="underline">{w.name}</Link></li>)}
        </ul>
        {options.positions && <p className="mt-2 text-xs">{made.shares} Share{made.shares === 1 ? "" : "s"} made, {made.messages} request{made.messages === 1 ? "" : "s"} for values sent now. Change who does what on each Metric, Workflow and dashboard.</p>}
        {made.tagsLeftOut.length > 0 && (
          <p role="status" className="mt-2 text-xs">Some Tags stayed off their Metrics because of the Tag limits (10 per Metric, 200 in the Workspace): {made.tagsLeftOut.map((l) => `${l.metric}: ${l.tags.join(", ")}`).join("; ")}. Merge or delete Tags that are not needed, then add these by hand.</p>
        )}
        <FillAfterSetUp options={options} made={made} />
        <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>Done</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 rounded-[var(--radius-input)] border border-input p-3 text-sm">
      <div>
        <p className="font-medium">Set up from {options.install.name}</p>
        <p className="text-xs text-muted-foreground">Makes ordinary Metrics, dashboards and Workflows, as if you made them by hand. Each Metric counts towards the Workspace&rsquo;s limit.</p>
      </div>
      {options.refusal && <p role="alert" className="font-medium">{options.refusal}</p>}
      {options.room && !options.refusal && <Fit room={options.room} n={count} />}
      {options.room && options.refusal && <p className="text-xs"><Link href="/settings/workspace#size" className="underline">Size and usage</Link></p>}

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium">Metrics to make</legend>
        {options.entries.map((e) => {
          const needed = !picked.has(e.key) && making.has(e.key);
          return (
            <label key={e.key} className="flex items-start gap-2">
              <input type="checkbox" checked={making.has(e.key)} disabled={needed} onChange={(ev) => toggle(e.key, ev.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
              <span>{e.name} <span className="text-xs text-muted-foreground">by {e.period}{e.unit ? `, in ${e.unit}` : ""}{e.repeat ? `, one for each ${options.repeats.find((r) => r.key === e.repeat)?.name ?? e.repeat}` : ""}{e.derived ? `, a Derived Metric computed from ${e.inputs.map((i) => byKey.get(i)?.name ?? i).join(" and ")}, made too` : ""}{needed ? ", made for a Derived Metric" : ""}</span>{e.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{e.tags.map((t) => <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>)}</span>}</span>
            </label>
          );
        })}
        {uncovered && (
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={askMe} onChange={(e) => setAskMe(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> Ask me for {options.positions ? "the values no Position covers" : "their values"} (a first request goes out now)</label>
        )}
        {making.size > 0 && options.feeds.length > 0 && (
          <label className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Values come from the Feed</span>
            <select value={feed} onChange={(e) => setFeed(e.target.value)} className={field} aria-label="Feed that submits their values">
              <option value="">None</option>
              {options.feeds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {feed && <span className="text-xs text-muted-foreground">It becomes a Submitter of each Metric that takes values, and their API Source is on.</span>}
          </label>
        )}
      </fieldset>

      {options.repeats.map((r) => (
        <RepeatLines key={r.key} repeat={r} rows={lines[r.key] ?? []} onChange={(rows) => setLines((x) => ({ ...x, [r.key]: rows }))} plan={planned.plan} chosen={(row, position) => chosen(planned.plan, row.fills, position)} />
      ))}

      {scopes.map((r) => (
        <DashboardPick key={r?.key ?? ""} options={options} of={r} value={boards[r?.key ?? ""] ?? ""} onChange={(key) => setBoards((x) => ({ ...x, [r?.key ?? ""]: key }))} making={making} fills={fills} onFill={(slot, metric) => setFills((f) => ({ ...f, [slot]: metric }))} />
      ))}
      {scopes.map((r) => (
        <WorkflowPick key={r?.key ?? ""} options={options} of={r} value={flows[r?.key ?? ""] ?? ""} onChange={(key) => setFlows((x) => ({ ...x, [r?.key ?? ""]: key }))} approvers={approversOf} onApprovers={(flow, ids) => setApproversBy((x) => ({ ...x, [flow]: ids }))} />
      ))}
      {workflows.length > 0 && making.size > 0 && <p className="text-xs text-muted-foreground">The Metrics that take values follow {options.repeats.length ? "their line\u2019s Workflow, else the one for the whole set" : "this Workflow"}.</p>}

      {options.positions && (
        <>
          {planned.plan && planned.plan.positions.some((p) => !p.repeat) && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium">Who does what</h4>
              {planned.plan.positions.filter((p) => !p.repeat).map((p) => (
                <PositionField key={p.key} position={p} people={planned.plan!.people} chosen={chosen(planned.plan, positionFills, p.key)} onChange={(ids) => setPeople((x) => ({ ...x, [p.key]: ids }))} />
              ))}
              <p className="text-xs text-muted-foreground">An empty Position leaves the place open. Someone missing from the list is invited on the Members page first.</p>
            </div>
          )}
          <p role="status" className="text-xs text-muted-foreground">{planned.error ? "" : planned.current ? "" : "Working out who will see what\u2026"}</p>
          {planned.error && <p role="alert" className="text-xs font-medium">{planned.error}</p>}
          {unnamed && <p role="alert" className="text-xs font-medium">Give every line with people a name.</p>}
          {planned.plan && <PlanCheck plan={planned.plan} ticks={ticks} onTick={(c) => setTicks((x) => ({ ...x, ...c }))} askNow={askNow} onAskNow={setAskNow} />}
        </>
      )}

      <p role="status" className="text-xs">{pending ? progress || "Setting up\u2026" : ""}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || pending || (!!options.refusal && count > 0) || (!!options.room && count > options.room.allowed)} onClick={submit}>Set up{count ? ` ${count} Metric${count === 1 ? "" : "s"}` : ""}</Button>
      </div>
    </div>
  );
}
