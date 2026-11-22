"use client";
// Set up from this Pack (spec 0030, ticket 277; GLOSSARY: Pack, Metric Catalog, Derived Metric, Slot, Workflow
// Template, Workspace Limit): an installed Pack's entries made into Metrics, one of its Dashboard Templates into a
// dashboard and one of its Workflow Templates into a Workflow, as the person picks. The core checks everything again,
// the Workspace Limit included, and makes nothing when anything is refused.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { packSetup, setUpPack } from "@/app/pack-setup-actions";
import type { PackSetupOptions, PackSetupResult, PackSetupRoom } from "@ziffr/core/pack-setup";

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

function SetUpForm({ options, viewer, onClose }: { options: PackSetupOptions; viewer: string; onClose: () => void }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [askMe, setAskMe] = useState(true);
  const [dashboard, setDashboard] = useState<string>("");
  const [fills, setFills] = useState<Record<number, number>>({});
  const [feed, setFeed] = useState<string>("");
  const [workflow, setWorkflow] = useState<string>("");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [made, setMade] = useState<PackSetupResult | null>(null);
  const [pending, start] = useTransition();
  const byKey = useMemo(() => new Map(options.entries.map((e) => [e.key, e])), [options.entries]);

  // A Derived Metric's inputs are made with it: shown ticked, and kept while it is.
  const making = useMemo(() => {
    const all = new Set(picked);
    for (const k of picked) for (const i of byKey.get(k)?.inputs ?? []) all.add(i);
    return all;
  }, [picked, byKey]);
  const template = options.dashboards.find((d) => d.key === dashboard) ?? null;
  const flow = options.workflows.find((w) => w.key === workflow) ?? null;
  const open = template ? template.slots.map((s, i) => ({ s, i })).filter(({ s }) => !(s.suggests && making.has(s.suggests))) : [];
  const ready = (making.size > 0 || !!template || !!flow)
    && open.every(({ i }) => fills[i])
    && (!flow || (approvers.length === flow.approvers && approvers.every(Boolean) && new Set(approvers).size === approvers.length));

  const toggle = (key: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(key); else n.delete(key); return n; });
  const submit = () => start(async () => {
    try {
      const result = unwrap(await setUpPack(options.install.id, {
        metrics: [...making],
        submitters: askMe ? [viewer] : [],
        feed: feed || null,
        dashboard: template ? { key: template.key, fills: template.slots.map((_s, i) => (fills[i] ? [fills[i]] : null)) } : null,
        workflow: flow ? { key: flow.key, approvers } : null,
      }));
      setMade(result);
      toast.success(`Set up from ${options.install.name}`);
      router.refresh();
    } catch (e) {
      toast.error("Nothing was set up", { description: shown(e) });
    }
  });

  if (made) {
    return (
      <div className="mt-3 rounded-[var(--radius-input)] border border-input p-3 text-sm" aria-live="polite">
        <p className="font-medium">Set up from {options.install.name}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {made.metrics.map((m) => <li key={m.id}><Link href={`/metrics/${m.slug}`} className="underline">{m.name}</Link></li>)}
          {made.dashboardId !== null && <li><Link href={`/dashboards/${made.dashboardId}`} className="underline">The dashboard</Link></li>}
          {made.workflowId !== null && <li><Link href={`/workflows?id=${made.workflowId}`} className="underline">The Workflow</Link></li>}
        </ul>
        {made.tagsLeftOut.length > 0 && (
          <p role="status" className="mt-2 text-xs">Some Tags stayed off their Metrics because of the Tag limits (10 per Metric, 200 in the Workspace): {made.tagsLeftOut.map((l) => `${l.metric}: ${l.tags.join(", ")}`).join("; ")}. Merge or delete Tags that are not needed, then add these by hand.</p>
        )}
        <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>Done</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 rounded-[var(--radius-input)] border border-input p-3 text-sm">
      <div>
        <p className="font-medium">Set up from {options.install.name}</p>
        <p className="text-xs text-muted-foreground">Makes ordinary Metrics, a dashboard and a Workflow, as if you made them by hand. Each Metric counts towards the Workspace&rsquo;s limit.</p>
      </div>
      {options.refusal && <p role="alert" className="font-medium">{options.refusal}</p>}
      {options.room && !options.refusal && <Fit room={options.room} n={making.size} />}
      {options.room && options.refusal && <p className="text-xs"><Link href="/settings/workspace#size" className="underline">Size and usage</Link></p>}

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium">Metrics to make</legend>
        {options.entries.map((e) => {
          const needed = !picked.has(e.key) && making.has(e.key);
          return (
            <label key={e.key} className="flex items-start gap-2">
              <input type="checkbox" checked={making.has(e.key)} disabled={needed} onChange={(ev) => toggle(e.key, ev.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
              <span>{e.name} <span className="text-xs text-muted-foreground">by {e.period}{e.unit ? `, in ${e.unit}` : ""}{e.derived ? `, a Derived Metric computed from ${e.inputs.map((i) => byKey.get(i)?.name ?? i).join(" and ")}, made too` : ""}{needed ? ", made for a Derived Metric" : ""}</span>{e.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{e.tags.map((t) => <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>)}</span>}</span>
            </label>
          );
        })}
        {making.size > 0 && (
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={askMe} onChange={(e) => setAskMe(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> Ask me for their values (a first request goes out now)</label>
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

      {options.dashboards.length > 0 && (
        <div className="space-y-1.5">
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Dashboard</span>
            <select value={dashboard} onChange={(e) => { setDashboard(e.target.value); setFills({}); }} className={field} aria-label="Dashboard">
              <option value="">None</option>
              {options.dashboards.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </select>
          </label>
          {open.length > 0 && <p className="text-xs text-muted-foreground">These Slots suggest no Metric you make here: fill them with one you have.</p>}
          {open.map(({ s, i }) => (
            <label key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-44 text-xs">{s.label}</span>
              <select value={fills[i] ?? ""} onChange={(e) => setFills((f) => ({ ...f, [i]: Number(e.target.value) }))} className={field} aria-label={`Slot ${s.label}`}>
                <option value="">Pick a Metric…</option>
                {options.metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {options.workflows.length > 0 && (
        <div className="space-y-1.5">
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Workflow</span>
            <select value={workflow} onChange={(e) => { setWorkflow(e.target.value); setApprovers(Array.from({ length: options.workflows.find((w) => w.key === e.target.value)?.approvers ?? 0 }, () => "")); }} className={field} aria-label="Workflow">
              <option value="">None</option>
              {options.workflows.map((w) => <option key={w.key} value={w.key}>{w.name}</option>)}
            </select>
          </label>
          {flow && flow.approvers > 0 && <p className="text-xs text-muted-foreground">Its Approve step asks for {flow.approvers === 1 ? "an Approver" : `${flow.approvers} Approvers, in order`}, members of this Workspace.</p>}
          {approvers.map((a, i) => (
            <label key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-44 text-xs">Approver {i + 1}</span>
              <select value={a} onChange={(e) => setApprovers((xs) => xs.map((x, k) => (k === i ? e.target.value : x)))} className={field} aria-label={`Approver ${i + 1}`}>
                <option value="">Pick a person…</option>
                {options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ))}
          {flow && making.size > 0 && <p className="text-xs text-muted-foreground">The Metrics that take values follow this Workflow.</p>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || pending || (!!options.refusal && making.size > 0) || (!!options.room && making.size > options.room.allowed)} onClick={submit}>Set up{making.size ? ` ${making.size} Metric${making.size === 1 ? "" : "s"}` : ""}</Button>
      </div>
    </div>
  );
}
