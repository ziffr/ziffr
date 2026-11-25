"use client";
// Starting point, the Setup Guide's second step (spec 0052, ticket 6; GLOSSARY: Setup Guide, Pack, Preview, Sample Data,
// Metric Catalog): two clear choices. "Explore on my own" starts from scratch and opens the Metric Catalog with a way
// back here; "Start from a Pack" lists Ziffr's own Packs ranked for this Workspace, each with why it fits, what it
// brings, a Preview drawn with Sample Data in the Slide-over and Install by a click. After installing, "Set up from this
// Pack" makes the first Metrics in place. Nothing installs or is made without a click; the core checks every one again.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSlideOver } from "@/components/slide-over-host";
import { isActionError, shown, unwrap, UNEXPECTED } from "@/lib/action-error";
import { installIncludedPackFile, readIncludedPackFile } from "@/app/pack-actions";
import { packSetup } from "@/app/pack-setup-actions";
import { PackPreviewCard } from "@/app/settings/packs/screen";
import { dashboardNeeds, guideStart } from "@/app/settings/packs/setup-defaults";
import { chooseExplore, setUpFromPackInGuide, skipStep } from "./actions";
import { becauseText } from "@ziffr/core/pack-ranking";
import type { RecommendedPack } from "@ziffr/core/included-packs";
import type { PackSetupOptions, PackSetupRoom } from "@ziffr/core/pack-setup";
import type { PackPreview } from "@ziffr/core/packs";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { GuidePackSetupResult } from "@ziffr/core/setup-from-pack";

const KIND: Record<RecommendedPack["brings"][number]["kind"], [string, string]> = {
  metric: ["Metric", "Metrics"], dashboard: ["Dashboard", "Dashboards"], deck: ["Deck", "Decks"], workflow: ["Workflow", "Workflows"],
  view: ["View Design", "View Designs"], recipe: ["Analysis Recipe", "Analysis Recipes"], theme: ["Theme", "Themes"],
};
const SHOWN_NAMES = 3;

/** What a Pack brings, one phrase per line: "13 Metrics, e.g. MRR, ARR, New MRR", "2 Workflows", "1 Dashboard". Counts and names from the Pack file only. */
export function whatYouGet(brings: RecommendedPack["brings"]): string[] {
  return brings.map((b) => {
    const label = `${b.count} ${KIND[b.kind][b.count === 1 ? 0 : 1]}`;
    if (b.kind !== "metric") return label;
    const names = b.names.slice(0, SHOWN_NAMES).join(", ");
    return `${label}, e.g. ${names}`;
  });
}

type Props = {
  packs: RecommendedPack[];
  /** "scratch" when Explore on my own was chosen, "pack" after a Pack, else null. */
  startingPoint: "scratch" | "pack" | null;
  /** How many Metrics the Workspace has already (archived ones included). */
  metrics: number;
  /** The guide's Metric, when the viewer may see it. */
  firstMetric: { id: number; name: string } | null;
  /** In a trial: the Test Metric's name; the step is ticked by itself. */
  trial: { testMetric: string } | null;
  /** The viewer's own Business Function from About you, in words, to name in the Pack card; null when not answered. */
  functionLabel?: string | null;
  /** Whether the viewer is an Owner (a Pack that holds a Theme is for Owners). */
  isOwner: boolean;
  viewer: string;
  numberStyle: NumberStyle;
  following: string;
  ticked: boolean;
};

/** The Starting point step. */
export function StartingPoint(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const answered = p.packs.some((x) => x.because.length > 0);
  const shown3 = p.packs.slice(0, 3);
  const rest = p.packs.slice(3);
  const list = all ? p.packs : shown3;

  const run = (work: () => Promise<unknown>, then: () => void) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      then();
    } catch { setError(UNEXPECTED); }
  });

  return (
    <div className="space-y-6">
      {p.trial && (
        <p role="status" className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm">
          <strong className="font-medium">{p.trial.testMetric}</strong> is a sample Metric: a number Ziffr keeps and asks you for over time. We made it so you can try things, and you can delete it any time. This step is done; a Pack still fits within the trial&rsquo;s limits.
        </p>
      )}
      {!p.trial && p.metrics > 0 && p.startingPoint !== "pack" && (
        <p role="status" className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm">
          You have {p.metrics} Metric{p.metrics === 1 ? "" : "s"}. Start from a Pack anyway?
        </p>
      )}
      {p.firstMetric && (
        <p role="status" className="text-sm">Your first Metric: <strong className="font-medium">{p.firstMetric.name}</strong>.</p>
      )}

      <div>
        <h3 className="mb-3 text-base font-medium">How do you want to start?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="stock flex flex-col rounded-[var(--radius-card)] p-4">
            <p className="font-medium">Explore on my own</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.trial ? "Stay with the sample Metric and build your own step by step, from the Metric Catalog or from scratch." : "An empty Workspace. Describe your first Metric from the Metric Catalog or from scratch."}</p>
            <Button type="button" variant="outline" className="mt-3 h-11 w-full sm:h-9 sm:w-auto sm:self-start" disabled={pending} onClick={() => run(() => chooseExplore(), () => router.push("/metrics/new?setup=1"))}>
              Explore on my own
            </Button>
          </div>
          <div className="stock flex flex-col rounded-[var(--radius-card)] p-4">
            <p className="font-medium">Start from a Pack</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Ready-made Metrics{p.functionLabel ? ` for ${p.functionLabel}` : " for your kind of work"}, plus a sample dashboard and a Workflow that asks for them. You can change everything afterwards, so it is a quick start.</p>
            <a href="#guide-packs" className={buttonVariants({ variant: "outline", className: "mt-3 h-11 w-full sm:h-9 sm:w-auto sm:self-start" })}>Choose a Pack</a>
          </div>
        </div>
        <p role="alert" className="mt-2 min-h-5 text-sm text-destructive">{error}</p>
      </div>

      <section id="guide-packs" aria-labelledby="guide-packs-heading" className="space-y-3">
        <h3 id="guide-packs-heading" className="text-base font-medium">{answered ? "Packs suggested for you" : "Ziffr’s own Packs"}</h3>
        <p className="text-sm text-muted-foreground">A Pack gives you ready-made Metrics, a sample Dashboard and a Workflow that asks for them{answered ? " for the kind of work you chose" : ""}. Install one to start fast; you can change everything afterwards.</p>
        {!answered && <p className="text-sm text-muted-foreground">Answer About you to get suggestions. Until then they are in the order most Workspaces start in.</p>}
        <ul className="space-y-3">
          {list.map((pack) => <PackRow key={pack.id} pack={pack} p={p} />)}
        </ul>
        {rest.length > 0 && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `See all ${p.packs.length} Packs`}
          </Button>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {p.ticked
          ? <Link href={`/setup?step=${p.following}`} className={buttonVariants()}>Go on</Link>
          : <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipStep("start"), () => router.push(`/setup?step=${p.following}`))}>Skip</Button>}
      </div>
    </div>
  );
}

/** One Pack: why it fits, what it brings, Preview, Install, and once installed, Set up from this Pack. */
function PackRow({ pack, p }: { pack: RecommendedPack; p: Props }) {
  const router = useRouter();
  const slideOver = useSlideOver();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<PackSetupOptions | null>(null);
  const blocked = pack.needsOwner && !p.isOwner;

  const preview = () => start(async () => {
    try {
      const r = unwrap(await readIncludedPackFile(pack.id));
      if (!r.ok) throw new Error();
      slideOver.open({
        title: `Preview: ${r.preview.manifest.name}`, description: "Drawn with Sample Data. Nothing is installed or changed until you press Install.", widthToggle: true,
        content: <PreviewPanel packId={pack.id} preview={r.preview} viewer={p.viewer} numberStyle={p.numberStyle} blocked={blocked} onDone={() => slideOver.close()} />,
      });
    } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });
  // Installing is the click: a Pack that holds words aimed at assistants shows its Preview first, with the confirmation.
  const install = () => start(async () => {
    try {
      const r = unwrap(await readIncludedPackFile(pack.id));
      if (!r.ok || r.preview.blocked || r.preview.assistantTexts.length > 0) {
        if (!r.ok) throw new Error();
        slideOver.open({
          title: `Install ${r.preview.manifest.name}`, description: "Read this first.", widthToggle: true,
          content: <PreviewPanel packId={pack.id} preview={r.preview} viewer={p.viewer} numberStyle={p.numberStyle} blocked={blocked} onDone={() => slideOver.close()} />,
        });
        return;
      }
      unwrap(await installIncludedPackFile(pack.id, { assistantTexts: false }));
      toast.success(`${pack.name} installed`, { description: "Set up its first Metrics next, or go on." });
      router.refresh();
    } catch (e) { toast.error("Not installed", { description: shown(e) }); }
  });
  const openSetUp = () => start(async () => {
    try { setForm(unwrap(await packSetup(pack.installId!))); } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });

  const gets = whatYouGet(pack.brings);
  return (
    <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
      {/* Phone: title, reason, description, what you get, then full-width buttons; side by side only from the small breakpoint. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{pack.name} <span className="font-normal text-muted-foreground">· Pack</span></p>
          {pack.because.length > 0 && <p className="text-xs text-muted-foreground">Suggested because of {becauseText(pack.because, 3)}.</p>}
          <p className="mt-1 text-muted-foreground">{pack.summary}</p>
          <p className="mt-2 text-xs font-medium">What you get</p>
          <ul className="list-disc pl-4 text-xs text-muted-foreground">{gets.map((g) => <li key={g}>{g}</li>)}</ul>
          {blocked && <p className="mt-2 text-xs text-muted-foreground">Includes a Theme (a look for your Workspace); only an Owner can install this Pack.</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {!pack.installed && <Button type="button" size="sm" variant="outline" className="h-11 sm:h-8" disabled={pending} onClick={preview}>Preview</Button>}
          {!pack.installed && <Button type="button" size="sm" className="h-11 sm:h-8" disabled={pending || blocked} onClick={install}>Install</Button>}
          {pack.installed && <span className="text-xs text-muted-foreground">Installed</span>}
          {pack.installed && pack.installId !== null && !form && <Button type="button" size="sm" className="h-11 sm:h-8" disabled={pending} onClick={openSetUp}>Set up from this Pack</Button>}
        </div>
      </div>
      {form && <SetUpHere options={form} viewer={p.viewer} following={p.following} onClose={() => setForm(null)} />}
    </li>
  );
}

/** The Preview in the Slide-over, with its Install: the same card as the Packs page. Closing leaves everything as it was. */
function PreviewPanel({ packId, preview, viewer, numberStyle, blocked, onDone }: { packId: string; preview: PackPreview; viewer: string; numberStyle: NumberStyle; blocked: boolean; onDone: () => void }) {
  const router = useRouter();
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const install = () => start(async () => {
    try {
      unwrap(await installIncludedPackFile(packId, { assistantTexts: okAssistant }));
      toast.success(`${preview.manifest.name} installed`, { description: "Set up its first Metrics next, or go on." });
      onDone();
      router.refresh();
    } catch (e) { toast.error("Not installed", { description: shown(e) }); }
  });
  return (
    <div className="space-y-3">
      {blocked && <p role="status" className="text-sm">This Pack holds a Theme, so an Owner installs it.</p>}
      <PackPreviewCard preview={blocked ? { ...preview, blocked: "This Pack holds a Theme, so an Owner installs it." } : preview} viewer={viewer} numberStyle={numberStyle} pending={pending} okUnsigned={false} setOkUnsigned={() => {}} okAssistant={okAssistant} setOkAssistant={setOkAssistant} onCancel={onDone} onInstall={install} />
    </div>
  );
}

/** What making `n` Metrics does to the limit, in words, from the counts the core gave: it fits, or it does not. The core checks again. */
function fitWords(room: PackSetupRoom | null, refusal: string | null, n: number): string | null {
  if (refusal) return refusal;
  if (!room || n === 0) return null;
  if (n > room.allowed) return `Makes ${n} Metric${n === 1 ? "" : "s"}, but only ${room.allowed} fit now. Untick some.`;
  return null;
}

/** The entries to make: those ticked, the inputs of a calculated one, and what a ticked dashboard's Slots suggest. */
function withInputs(picked: Set<string>, byKey: Map<string, PackSetupOptions["entries"][number]>, extra: string[] | null): Set<string> {
  const out = new Set(picked);
  for (const k of picked) for (const i of byKey.get(k)?.inputs ?? []) out.add(i);
  for (const k of extra ?? []) out.add(k);
  return out;
}

/** One Metric to make, as a checkbox with its period and unit; one that another needs is shown ticked and cannot be unticked. */
function EntryBox({ entry, on, forced, onChange }: { entry: PackSetupOptions["entries"][number]; on: boolean; forced: boolean; onChange: (on: boolean) => void }) {
  const detail = [`by ${entry.period}`, entry.unit && `in ${entry.unit}`, entry.derived && "calculated from others, which are made too", forced && "made for another"].filter(Boolean).join(", ");
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={on} disabled={forced} onChange={(ev) => onChange(ev.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
      <span>{entry.name} <span className="text-xs text-muted-foreground">{detail}</span></span>
    </label>
  );
}

/** "Set up from this Pack": the first Metrics ticked, the person asked for them, then made in place. */
function SetUpHere({ options, viewer, following, onClose }: { options: PackSetupOptions; viewer: string; following: string; onClose: () => void }) {
  const router = useRouter();
  const [begin] = useState(() => guideStart(options, viewer));
  const [picked, setPicked] = useState<Set<string>>(begin.picked);
  const [askMe, setAskMe] = useState(true);
  const first = options.dashboards[0];
  const needs = first ? dashboardNeeds(options, first.key) : null;
  const [dashboardOn, setDashboardOn] = useState(begin.dashboard !== "");
  const flow = options.workflows[0] && options.workflows[0].approvers <= 1 ? options.workflows[0] : null;
  const [workflowOn, setWorkflowOn] = useState(begin.workflow !== "");
  const [made, setMade] = useState<GuidePackSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byKey = useMemo(() => new Map(options.entries.map((e) => [e.key, e])), [options.entries]);
  const making = useMemo(() => withInputs(picked, byKey, dashboardOn ? needs : null), [picked, byKey, dashboardOn, needs]);
  const why = fitWords(options.room, options.refusal, making.size);
  const ready = making.size > 0 && !why && !pending;

  const toggle = (key: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
  const submit = () => start(async () => {
    setError(null);
    try {
      const r = await setUpFromPackInGuide(options.install.id, {
        metrics: [...making],
        submitters: askMe ? [viewer] : [],
        dashboard: dashboardOn && first && needs ? { key: first.key, fills: first.slots.map(() => null) } : null,
        workflow: workflowOn && flow ? { key: flow.key, approvers: flow.approvers === 1 ? [viewer] : [] } : null,
      });
      if (isActionError(r)) { setError(r.error); return; }
      setMade(r);
      toast.success(`Set up from ${options.install.name}`);
      router.refresh();
    } catch { setError(UNEXPECTED); }
  });

  if (made) {
    const names = made.metrics.length ? made.metrics : made.existing;
    return (
      <div className="mt-3 space-y-2 rounded-[var(--radius-input)] border border-input p-3" aria-live="polite">
        <p className="font-medium">{made.metrics.length ? `Made from ${options.install.name}` : "Already made from this Pack"}</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {names.map((m) => <li key={m.id}><Link href={`/metrics/${m.slug}`} className="underline">{m.name}</Link></li>)}
          {made.dashboardId !== null && <li><Link href={`/dashboards/${made.dashboardId}`} className="underline">The dashboard</Link></li>}
          {made.workflowId !== null && <li><Link href={`/workflows?id=${made.workflowId}`} className="underline">The Workflow</Link></li>}
        </ul>
        <div className="flex gap-2">
          <Link href={`/setup?step=${following}`} className={buttonVariants({ size: "sm" })}>Go on</Link>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-input)] border border-input p-3">
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium">Metrics to make</legend>
        {options.entries.map((e) => (
          <EntryBox key={e.key} entry={e} on={making.has(e.key)} forced={!picked.has(e.key) && making.has(e.key)} onChange={(on) => toggle(e.key, on)} />
        ))}
      </fieldset>
      <label className="flex items-start gap-2"><input type="checkbox" checked={askMe} onChange={(e) => setAskMe(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> Ask me for their values (a first request goes out when you press Make them)</label>
      {first && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={dashboardOn} disabled={!needs} onChange={(e) => setDashboardOn(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
          <span>Also make the dashboard “{first.name}”{needs ? ` (adds ${needs.filter((k) => !picked.has(k)).length} Metric${needs.filter((k) => !picked.has(k)).length === 1 ? "" : "s"})` : ": its Slots need Metrics you pick on the Packs page"}</span>
        </label>
      )}
      {flow && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={workflowOn} onChange={(e) => setWorkflowOn(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
          <span>Also make the Workflow “{flow.name}”, which asks for these Metrics{flow.approvers === 1 ? " and has you approve them" : ""}</span>
        </label>
      )}
      {why && <p role="alert" className="font-medium">{why}</p>}
      <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="button" size="sm" disabled={!ready} onClick={submit}>Make them</Button>
      </div>
    </div>
  );
}
