"use client";
// Set up from this Pack (spec 0030, ticket 277, spec 0058; GLOSSARY: Pack, Metric Catalog, Derived Metric, Slot,
// Workflow Template, Position, Repeat, Workspace Limit): an installed Pack's entries made into Metrics, its Dashboard
// Templates into dashboards and its Workflow Templates into Workflows, as the person picks, with the lines of its
// Repeats and the people of its Positions. A large set is made in steps. The same form adds one line to what was set
// up before. The core checks everything again, the Workspace Limit included, and makes nothing when anything is
// refused.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { approversStart, lineSetupStart, openSlots, setupStart, type LineRow } from "./setup-defaults";
import { DashboardPick, WorkflowPick } from "./setup-templates";
import { RepeatLines } from "./setup-lines";
import { FillFromN8n } from "@/components/fill-from-n8n";
import { PackNeeds } from "@/components/pack-numbers";
import { ownRequests, RequestsAfterSetUp, SendFirstRequests } from "@/components/first-requests";
import { comesFromWords } from "@ziffr/pack/comes-from";
import { lineStart, packSetup, setUpPack } from "@/app/pack-setup-actions";
import { ByHand, PlanCheck, PositionField, usePlan } from "./setup-positions";
import type { PackSetupInput, PackSetupOptions, PackSetupResult, PackSetupRoom, PackSetupStep, SetupRun } from "@ziffr/core/pack-setup";
import type { LineStart } from "@ziffr/core/pack-setup-adding";
import { FillMadeUp } from "./fill-made-up";

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

/** The button that opens setting up from one installed Pack, and the form it opens. */
export function SetUpFromPack({ installId, viewer, practice = false }: { installId: number; viewer: string; practice?: boolean }) {
  const [options, setOptions] = useState<PackSetupOptions | null>(null);
  const [pending, start] = useTransition();
  const open = () => start(async () => {
    try { setOptions(unwrap(await packSetup(installId))); } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });
  if (!options) return <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={open}><Wand2 aria-hidden /> Set up from this Pack</Button>;
  return <SetUpForm options={options} viewer={viewer} practice={practice} onClose={() => setOptions(null)} />;
}

/** The one line being added, and what it starts with. */
type Adding = { repeat: PackSetupOptions["repeats"][number]; start: LineStart };

/** The button on a Pack's page that adds one line to what was set up from it, in the Repeat's own word, and the form it
 * opens. */
export function AddLine({ installId, repeat, name, viewer, practice = false }: { installId: number; repeat: string; name: string; viewer: string; practice?: boolean }) {
  const [form, setForm] = useState<{ options: PackSetupOptions; adding: Adding } | null>(null);
  const [pending, start] = useTransition();
  const open = () => start(async () => {
    try {
      const [options, begin] = await Promise.all([packSetup(installId), lineStart(installId, repeat)]);
      const found = unwrap(options);
      setForm({ options: found, adding: { repeat: found.repeats.find((r) => r.key === repeat)!, start: unwrap(begin) } });
    } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });
  if (!form) return <Button variant="outline" size="sm" className="mt-3" disabled={pending} onClick={open}><Plus aria-hidden /> Add a {name}</Button>;
  return <SetUpForm options={form.options} viewer={viewer} adding={form.adding} practice={practice} onClose={() => setForm(null)} />;
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

/** What an entry that is computed says of itself: what it is computed from, which is made with it. */
function madeWith(e: PackSetupOptions["entries"][number], inputs: string[], options: PackSetupOptions): string {
  if (!e.total) return `, a Derived Metric computed from ${inputs.join(" and ")}, made too`;
  const of = options.entries.find((x) => x.key === e.inputs[0])?.repeat;
  return `, a Total that adds up ${inputs[0]} of every ${options.repeats.find((r) => r.key === of)?.name ?? of}, made too`;
}

function SetUpForm({ options, viewer, adding, practice = false, onClose }: { options: PackSetupOptions; viewer: string; adding?: Adding; /** In a Practice Workspace the result offers made-up numbers. */ practice?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [start0] = useState(() => (adding ? lineSetupStart(adding.repeat.key, adding.start) : setupStart(options, viewer)));
  const [picked, setPicked] = useState<Set<string>>(start0.picked);
  const [askMe, setAskMe] = useState(true);
  // Off by default: nobody is asked for a number the Pack says another system sends or is set as a target.
  const [askElsewhere, setAskElsewhere] = useState(false);
  // The dashboard and the Workflow picked, by scope: "" for the whole set, else the Repeat's key.
  const [boards, setBoards] = useState<Record<string, string>>({ ...start0.lineDashboards, "": start0.dashboard });
  const [flows, setFlows] = useState<Record<string, string>>({ ...start0.lineWorkflows, "": start0.workflow });
  const [fills, setFills] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<string>("");
  const [approversBy, setApproversBy] = useState<Record<string, string[]>>(start0.workflow ? { [start0.workflow]: start0.approvers } : {});
  const repeats = adding ? [adding.repeat] : options.repeats;
  const [lines, setLines] = useState<Record<string, LineRow[]>>(() => Object.fromEntries(options.repeats.map((r) => [r.key, [{ id: 1, name: "", fills: {} }]])));
  const [made, setMade] = useState<PackSetupResult | null>(null);
  const [progress, setProgress] = useState("");
  const [pending, start] = useTransition();
  const [positionFills, setPeople] = useState<Record<string, string[]>>(adding?.start.people ?? {});
  const [offerTicks, setOfferTicks] = useState<Record<string, boolean>>({});
  // The first period a Total counts a new Metric in, where the person changed it.
  const [offerFrom, setOfferFrom] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [askNow, setAskNow] = useState(false);
  const byKey = useMemo(() => new Map(options.entries.map((e) => [e.key, e])), [options.entries]);

  // A Derived Metric's inputs are made with it, and those of a Total it reads: shown ticked, and kept while it is.
  const making = useMemo(() => {
    const all = new Set(picked);
    // A Set grows as it is walked, so the inputs of an input are added too.
    for (const k of all) for (const i of byKey.get(k)?.inputs ?? []) all.add(i);
    return all;
  }, [picked, byKey]);
  // Adding a line makes nothing for the whole set.
  const scopes = adding ? repeats : [null, ...repeats];
  const templates = scopes.flatMap((r) => options.dashboards.find((d) => d.key === boards[r?.key ?? ""]) ?? []);
  const workflows = scopes.flatMap((r) => options.workflows.find((w) => w.key === flows[r?.key ?? ""]) ?? []);
  const approversOf = (w: PackSetupOptions["workflows"][number]) => approversBy[w.key] ?? approversStart(options, viewer, w.approvers);
  // Whether the person is still asked for anything themselves: for every Metric no Position covers.
  const uncovered = [...making].some((k) => !byKey.get(k)?.asksPosition && !byKey.get(k)?.derived);
  const pickOf = (d: PackSetupOptions["dashboards"][number]) => ({ key: d.key, fills: d.slots.map((_s, i) => (fills[`${d.key} ${i}`] ? [fills[`${d.key} ${i}`]!] : null)) });
  const flowOf = (w: PackSetupOptions["workflows"][number]) => ({ key: w.key, approvers: approversOf(w) });
  const [shared, sharedFlow] = [templates.find((d) => !d.repeat), workflows.find((w) => !w.repeat)];
  // The entries offered here, and those asked for: adding a line asks only for what each line gets, and the core finds
  // what it is computed from among what was made before.
  const entries = adding ? options.entries.filter((e) => e.repeat === adding.repeat.key) : options.entries;
  // The numbers being made that the Pack says nobody types, in a Pack without Positions; with Positions the plan names
  // those the person would submit.
  const elsewhere = entries.filter((e) => making.has(e.key) && !e.derived && (e.comesFrom?.by === "system" || e.comesFrom?.by === "target")).map((e) => e.name);
  const asked: PackSetupInput = {
    metrics: adding ? [...making].filter((k) => byKey.get(k)?.repeat === adding.repeat.key) : [...making],
    submitters: askMe && uncovered ? [viewer] : [],
    askElsewhere,
    askNow,
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
      ...asked, people: fillsFor(null, positionFills),
      // An offer is ticked as the person ticked it, else as the plan suggests.
      ...(adding ? { adding: { ticked: (plan?.offers ?? []).filter((o) => offerTicks[o.id] ?? o.suggested).map((o) => o.id), from: offerFrom } } : {}),
      lines: repeats.flatMap((r) => (lines[r.key] ?? []).filter((l) => l.name.trim()).map((l) => ({ repeat: r.key, name: l.name.trim(), people: fillsFor(r.key, l.fills) }))),
    };
  }, ticks);
  // What “Ask me also for …” is about.
  const alsoAsk = options.positions ? planned.plan?.askMeAlso ?? [] : askMe ? elsewhere : [];
  const count = options.positions ? planned.plan?.makes.metrics.length ?? 0 : making.size;
  // A line with people but no name would be left out without a word.
  const unnamed = Object.values(lines).some((rows) => rows.some((l) => !l.name.trim() && Object.values(l.fills).some((x) => x.length)));
  const lineName = adding ? (lines[adding.repeat.key]?.[0]?.name.trim() ?? "") : "";
  const ready = (making.size > 0 || templates.length > 0 || workflows.length > 0) && (!adding || lineName !== "")
    && templates.every((d) => openSlots(options, d, making).every(({ index }) => fills[`${d.key} ${index}`]))
    && workflows.every((w) => { const a = approversOf(w); return a.length === w.approvers && a.every(Boolean) && new Set(a).size === a.length; })
    && (!options.positions || (planned.current && !planned.plan?.problems.length && !unnamed));

  const toggle = (key: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(key); else n.delete(key); return n; });
  const submit = () => start(async () => {
    try {
      setMade(await setUpInSteps(options.install.id, options.positions ? planned.input! : asked, setProgress));
      toast.success(adding ? `Added ${lineName}` : `Set up from ${options.install.name}`);
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
        <p className="font-medium">{adding ? `Added ${lineName}` : `Set up from ${options.install.name}`}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {made.metrics.map((m) => <li key={m.id}><Link href={`/metrics/${m.slug}`} className="underline">{m.name}</Link></li>)}
          {made.dashboards.map((d) => <li key={d.id}>The dashboard <Link href={`/dashboards/${d.id}`} className="underline">{d.name}</Link></li>)}
          {made.workflows.map((w) => <li key={w.id}>The Workflow <Link href={`/workflows?id=${w.id}`} className="underline">{w.name}</Link></li>)}
        </ul>
        {options.positions && <p className="mt-2 text-xs">{made.shares} Share{made.shares === 1 ? "" : "s"} made.{adding ? ` ${made.widgets} widget${made.widgets === 1 ? "" : "s"} changed.` : ""}{made.totals ? ` Added to ${made.totals} Total${made.totals === 1 ? "" : "s"}.` : ""} Change who does what on each Metric, Workflow and dashboard.</p>}
        <div className="mt-2"><RequestsAfterSetUp made={made} /></div>
        {made.byHand.length > 0 && <ByHand items={made.byHand} />}
        {made.tagsLeftOut.length > 0 && (
          <p role="status" className="mt-2 text-xs">Some Tags stayed off their Metrics because of the Tag limits (10 per Metric, 200 in the Workspace): {made.tagsLeftOut.map((l) => `${l.metric}: ${l.tags.join(", ")}`).join("; ")}. Merge or delete Tags that are not needed, then add these by hand.</p>
        )}
        {practice && <FillMadeUp installId={options.install.id} />}
        <FillAfterSetUp options={options} made={made} />
        <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>Done</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 rounded-[var(--radius-input)] border border-input p-3 text-sm">
      <div>
        <p className="font-medium">{adding ? `Add a ${adding.repeat.name} to what was set up from ${options.install.name}` : `Set up from ${options.install.name}`}</p>
        <p className="text-xs text-muted-foreground">{adding ? <>Makes only the new {adding.repeat.name}. There already: {adding.start.lines.join(", ")}.</> : <>Makes ordinary Metrics, dashboards and Workflows, as if you made them by hand.</>} Each Metric counts towards the Workspace&rsquo;s limit.</p>
      </div>
      {options.refusal && <p role="alert" className="font-medium">{options.refusal}</p>}
      {options.room && !options.refusal && <Fit room={options.room} n={count} />}
      {options.room && options.refusal && <p className="text-xs"><Link href="/settings/workspace#size" className="underline">Size and usage</Link></p>}

      {options.overview && <div className="@container text-xs"><PackNeeds overview={options.overview} included={false} /></div>}

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium">Metrics to make</legend>
        {entries.map((e) => {
          const needed = !picked.has(e.key) && making.has(e.key);
          return (
            <label key={e.key} className="flex items-start gap-2">
              <input type="checkbox" checked={making.has(e.key)} disabled={needed} onChange={(ev) => toggle(e.key, ev.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
              <span>{e.name} <span className="text-xs text-muted-foreground">by {e.period}{e.unit ? `, in ${e.unit}` : ""}{e.repeat ? `, one for each ${options.repeats.find((r) => r.key === e.repeat)?.name ?? e.repeat}` : ""}{e.derived ? madeWith(e, e.inputs.map((i) => byKey.get(i)?.name ?? i), options) : ""}{needed ? ", made for a Derived Metric" : ""}</span>{e.comesFrom && !e.derived && <span className="block text-xs text-muted-foreground">{comesFromWords(e.comesFrom).from}</span>}{e.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{e.tags.map((t) => <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>)}</span>}</span>
            </label>
          );
        })}
        {uncovered && (
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={askMe} onChange={(e) => setAskMe(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> Make me the Submitter of {options.positions ? "the values no Position covers" : "their values"}</label>
        )}
        {alsoAsk.length > 0 && (
          <label className={`${uncovered ? "ml-6" : "mt-2"} flex items-start gap-2`}><input type="checkbox" checked={askElsewhere} onChange={(e) => setAskElsewhere(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /><span>Ask me also for {alsoAsk.join(", ")}<span className="block text-xs text-muted-foreground">The Pack says another system sends {alsoAsk.length === 1 ? "it" : "them"} or that {alsoAsk.length === 1 ? "it is" : "they are"} set as a target, so nobody is asked unless you tick this{options.positions ? ", and nobody else is asked either way" : ""}.</span></span></label>
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

      {repeats.map((r) => (
        <RepeatLines key={r.key} one={Boolean(adding)} repeat={r} rows={lines[r.key] ?? []} onChange={(rows) => setLines((x) => ({ ...x, [r.key]: rows }))} plan={planned.plan} chosen={(row, position) => chosen(planned.plan, row.fills, position)} />
      ))}

      {scopes.map((r) => (
        <DashboardPick key={r?.key ?? ""} options={options} of={r} value={boards[r?.key ?? ""] ?? ""} onChange={(key) => setBoards((x) => ({ ...x, [r?.key ?? ""]: key }))} making={making} fills={fills} onFill={(slot, metric) => setFills((f) => ({ ...f, [slot]: metric }))} />
      ))}
      {scopes.map((r) => (
        <WorkflowPick key={r?.key ?? ""} options={options} of={r} value={flows[r?.key ?? ""] ?? ""} onChange={(key) => setFlows((x) => ({ ...x, [r?.key ?? ""]: key }))} approvers={approversOf} onApprovers={(flow, ids) => setApproversBy((x) => ({ ...x, [flow]: ids }))} />
      ))}
      {workflows.length > 0 && making.size > 0 && <p className="text-xs text-muted-foreground">The Metrics that take values follow {repeats.length ? "their line\u2019s Workflow, else the one for the whole set" : "this Workflow"}.</p>}

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
          {planned.plan && <PlanCheck plan={planned.plan} ticks={ticks} onTick={(c) => setTicks((x) => ({ ...x, ...c }))} askNow={askNow} onAskNow={setAskNow} offerTicks={offerTicks} onOffer={(id, on) => setOfferTicks((x) => ({ ...x, [id]: on }))} offerFrom={offerFrom} onOfferFrom={(id, day) => setOfferFrom((x) => ({ ...x, [id]: day }))} />}
        </>
      )}

      {!options.positions && <SendFirstRequests to={askMe && uncovered ? ownRequests(entries, making, askElsewhere) : []} checked={askNow} onChange={setAskNow} followed={Boolean(asked.workflow)} />}

      <p role="status" className="text-xs">{pending ? progress || "Setting up\u2026" : ""}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || pending || (!!options.refusal && count > 0) || (!!options.room && count > options.room.allowed)} onClick={submit}>{adding ? `Add ${lineName || `the ${adding.repeat.name}`}` : `Set up${count ? ` ${count} Metric${count === 1 ? "" : "s"}` : ""}`}</Button>
      </div>
    </div>
  );
}
