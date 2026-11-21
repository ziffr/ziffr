"use client";
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import { RelativeTime } from "@/components/relative-time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { told } from "@/lib/action-toast";
import { format } from "date-fns";
import { Archive, CalendarRange, Check, Copy, FileDown, GitBranch, LayoutTemplate, PencilLine, Presentation, Scale, BookmarkPlus, ExternalLink, GripVertical, History, LayoutDashboard, ListTodo, MessageCircleQuestion, MessageSquare, MoreHorizontal, Palette, PanelRightOpen, Trash2 } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { WidgetBody, widgetMetrics } from "@/views/widget-body";
import { MetricChart } from "@/views/metric-chart";
import { templatesFor, TEMPLATES, templateOf } from "@/views/templates";
import { StoryEditor } from "@/components/story-editor";
import { CompareStrip, DEFAULT_COMPARE } from "@/components/compare-strip";
import { CompareTable } from "@/components/compare-table";
import { openQuickLook, QuickLookButton } from "@/components/metric-quick-look";
import { VersionsPanel } from "@/components/versions-panel";
import { resolverFrom } from "@ziffr/core/compare";
import { comparisonsFor, COMPARE_LABEL, type CompareKey } from "@ziffr/core/compare";
import { applyTemplate, assignInPlace, getHistory, placeWidget, removeWidget, saveToPool, updateWidget, type DropSource } from "@/app/canvas-actions";
import { formatValue, SOURCE_LABEL } from "@ziffr/core/format";
import type { Action, ActionKind, CanvasData, Observation, TemplateId, Widget, WidgetSettings, WidgetTemplate } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { isArchived } from "@ziffr/core/metric-row";
import { StatusDot } from "@/components/status";
import { SaveTemplateDialog } from "@/components/save-template-dialog";
import { AddToDeckDialog } from "@/components/add-to-deck-dialog";
import { CONNECTORS, CONNECTOR_IDS, type ConnectorId } from "@ziffr/core/connectors/index";
import { useSlotFill } from "@/components/slot-dialog";
import { ReadOnlyFrame, frameTitle, type FrameWidget } from "./read-only-frame";
import { designOf, duplicateAsDesign } from "@ziffr/core/design-files";
import { downloadDesign } from "@/lib/design-download";
import { Preview, TemplatePreview } from "./preview";
import { periodLabel } from "@ziffr/core/periods";
import { combines, DISPLAY_LABEL, displayPeriodsFor, NOT_COMBINED, SHOWN_BY, type DisplayPeriod } from "@ziffr/core/display-periods";

export type { FrameWidget } from "./read-only-frame";

type Props = {
  widget: FrameWidget;
  data: CanvasData;
  /** Dashboards the viewer may add widgets to (for "Add to dashboard"). */
  targets: { id: number; name: string }[];
  /** Widget lives on a dashboard the viewer may edit: restyle and remove persist. */
  editable?: boolean;
  /** Analysis results: restyling isn't offered. */
  className?: string;
  dragHandle?: boolean;
  /** Saved widgets, for the Pool inside the layout editor. */
  saved?: Widget[];
  /** View Links: the card and its numbers only, no menus and nothing that calls the server. */
  readOnly?: boolean;
};

type Panel = "history" | "ask" | "story" | "versions" | null;

// The layout editor pulls in tldraw, so it loads only when opened.
const LayoutEditor = dynamic(() => import("@/canvas/layout-editor"), { ssr: false });

export function WidgetFrame(props: Props) {
  if (props.readOnly) return <ReadOnlyFrame widget={props.widget} data={props.data} className={props.className} />;
  return <InteractiveFrame {...props} />;
}

/** A widget seen through a View Link (GLOSSARY: View Link): what it shows, nothing it can do. */
function InteractiveFrame({ widget, data, targets, editable = false, className, dragHandle, saved = [] }: Props) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const slotFill = useSlotFill(data);
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [kind, setKind] = useState<ActionKind>("question");
  const [, start] = useTransition();
  const ms = widgetMetrics(widget, data);
  const m = ms[0];
  const isMetricWidget = templateOf(widget).kind !== "analysis";
  const isStory = templateOf(widget).kind === "story";
  const hasBreakdown = !!m && Object.keys(data.breakdowns[m.id] ?? {}).length > 0;
  const [row, setRow] = useState<string | null>(null);
  // A story carries its own headline, so its frame header stays quiet.
  const isLayout = templateOf(widget).kind === "layout";
  // The View Design the widget is drawn with, to take away as a file: none for a Finding or a Free layout.
  const ownDesign = designOf(widget);
  const title = frameTitle(widget, ms);
  const open = ms.reduce((n, x) => n + (data.openActions[x.id] ?? 0), 0);
  const source: DropSource = widget.id ? { type: "widget", id: widget.id } : { type: "spec", template: widget.template, metricIds: widget.metric_ids, settings: widget.settings, title: widget.title ?? undefined };

  const openPanel = (p: Panel, k?: ActionKind) => {
    if (k) setKind(k);
    // Let the menu close first, so its outside-press doesn't dismiss the popover.
    setTimeout(() => setPanel(p), 0);
  };
  const widgetTemplates = data.templates.filter((t): t is WidgetTemplate => t.kind === "widget");
  const applyTeamTemplate = async (t: WidgetTemplate) => {
    if (!widget.id) return;
    const fills = await slotFill.ask(t, ms.map((x) => x.id));
    if (!fills) return;
    start(async () => {
      try {
        unwrap(await applyTemplate(widget.id!, t.id, fills));
      } catch (err) {
        toast.error("Template not applied", { description: shown(err) });
      }
    });
  };
  // The option under the pointer or focus in Change view, drawn beside the menu (spec 0011).
  const [look, setLook] = useState<{ kind: "builtin"; id: TemplateId } | { kind: "team"; t: WidgetTemplate } | null>(null);
  // A change the core refuses says why; nothing else on the widget would.
  const change = (patch: Parameters<typeof updateWidget>[1]) => start(async () => { told(await updateWidget(widget.id!, patch), "Not changed"); });
  const restyle = (template: TemplateId) => widget.id && change({ template });
  const setCompare = (keys: CompareKey[]) => widget.id && change({ settings: { ...widget.settings, compare: keys } });
  const setDisplay = (display: DisplayPeriod | undefined) => {
    if (!widget.id) return;
    const { display: _old, ...rest } = widget.settings;
    void _old;
    change({ settings: display ? { ...rest, display } : rest });
  };
  const toggle = (key: keyof WidgetSettings) => widget.id && change({ settings: { ...widget.settings, [key]: !widget.settings[key] } });

  // One item list, rendered both as right-click menu and ⋯ menu.
  const items = (K: typeof CM | typeof DM) => (
    <>
      {m && <K.Item onClick={() => openPanel("history")}><History /> History</K.Item>}
      {m && <K.Item onClick={() => openPanel("ask", "question")}><MessageCircleQuestion /> Ask a question…</K.Item>}
      {m && <K.Item onClick={() => openPanel("ask", "task")}><ListTodo /> Assign a task…</K.Item>}
      <K.Separator />
      {isMetricWidget && editable && (
        <K.Sub>
          <K.SubTrigger><Palette /> Change view</K.SubTrigger>
          <K.SubContent className="flex items-stretch p-0" onPointerLeave={() => setLook(null)}>
            <div className="min-w-52 p-1">
              {/* Plain items: Base UI's radio group did not fire inside this nested context submenu. */}
              {templatesFor(hasBreakdown).map((t) => (
                <K.Item key={t.id} onClick={() => restyle(t.id)} onPointerEnter={() => setLook({ kind: "builtin", id: t.id })} onFocus={() => setLook({ kind: "builtin", id: t.id })} aria-current={widget.template === t.id ? "true" : undefined}>
                  <Check aria-hidden className={widget.template === t.id ? "" : "invisible"} /> {t.label}
                </K.Item>
              ))}
              {widget.id && widgetTemplates.length > 0 && (
                <>
                  <K.Separator />
                  {widgetTemplates.map((t) => (
                    <K.Item key={`t${t.id}`} onClick={() => setTimeout(() => applyTeamTemplate(t), 0)} onPointerEnter={() => setLook({ kind: "team", t })} onFocus={() => setLook({ kind: "team", t })} title={t.description}>
                      <LayoutTemplate aria-hidden /> {t.name}…
                    </K.Item>
                  ))}
                </>
              )}
              {(widget.template === "line" || widget.template === "bars") && (
                <>
                  <K.Separator />
                  <K.CheckboxItem onPointerEnter={() => setLook(null)} checked={widget.settings.showTarget !== false} onCheckedChange={() => toggle("showTarget")}>Show target band</K.CheckboxItem>
                  {widget.template === "line" && <K.CheckboxItem onPointerEnter={() => setLook(null)} checked={!!widget.settings.showForecast} onCheckedChange={() => toggle("showForecast")}>Show forecast</K.CheckboxItem>}
                </>
              )}
            </div>
            {/* The widget as it would look: a built-in redraws this card's own metrics and settings, which the
                viewer sees already; a team template draws Sample Data, since its words come from another widget. */}
            {look && (
              <div aria-hidden className="hidden w-[18rem] flex-col justify-center gap-2 border-l border-border p-3 md:flex">
                {look.kind === "builtin"
                  ? <Preview widget={{ ...widget, template: look.id }} data={data} size={TEMPLATES[look.id].size} width={256} />
                  : <TemplatePreview template={look.t} viewer={data.viewer} numberStyle={data.numberStyle} width={256} />}
                <p className="text-xs text-muted-foreground">{look.kind === "builtin" ? TEMPLATES[look.id].blurb : look.t.description || "Drawn with sample data."}</p>
              </div>
            )}
          </K.SubContent>
        </K.Sub>
      )}
      {m && templateOf(widget).kind === "metric" && editable && widget.id && (
        <K.Sub>
          <K.SubTrigger><Scale /> Comparisons</K.SubTrigger>
          <K.SubContent>
            {comparisonsFor(m.period).map((k) => {
              const keys = widget.settings.compare ?? DEFAULT_COMPARE;
              const on = keys.includes(k);
              return (
                <K.Item key={k} onClick={() => setCompare(on ? keys.filter((x) => x !== k) : [...keys, k])}>
                  <Check aria-hidden className={on ? "" : "invisible"} /> {COMPARE_LABEL[k]}
                </K.Item>
              );
            })}
            <K.Separator />
            <K.Item onClick={() => widget.id && change({ settings: { ...widget.settings, fullPeriods: !widget.settings.fullPeriods } })}>
              <Check aria-hidden className={widget.settings.fullPeriods ? "" : "invisible"} /> Full periods instead of to date
            </K.Item>
          </K.SubContent>
        </K.Sub>
      )}
      {m && SHOWN_BY.includes(widget.template) && editable && widget.id && displayPeriodsFor(m.period).length > 0 && (
        <K.Sub>
          <K.SubTrigger><CalendarRange /> Show by</K.SubTrigger>
          <K.SubContent className="max-w-72">
            <K.Item onClick={() => setDisplay(undefined)}>
              <Check aria-hidden className={!widget.settings.display ? "" : "invisible"} /> {DISPLAY_LABEL[m.period]} (its own)
            </K.Item>
            {displayPeriodsFor(m.period).map((d) => (
              <K.Item key={d} disabled={!combines(m)} onClick={() => setDisplay(d)}>
                <Check aria-hidden className={widget.settings.display === d ? "" : "invisible"} /> {DISPLAY_LABEL[d]}
              </K.Item>
            ))}
            {/* A rate cannot be added up: say why, and where its Aggregation is changed. */}
            {!combines(m) && <p className="px-2 py-1.5 text-xs text-muted-foreground">{NOT_COMBINED} Change it under Edit details on the Metric&apos;s page.</p>}
          </K.SubContent>
        </K.Sub>
      )}
      {isStory && editable && widget.id && <K.Item onClick={() => openPanel("story")}><PencilLine /> Edit Finding…</K.Item>}
      {isLayout && editable && widget.id && <K.Item onClick={() => setTimeout(() => setLayoutOpen(true), 0)}><PencilLine /> Edit layout…</K.Item>}
      {widget.id && <K.Item onClick={() => openPanel("versions")}><GitBranch /> Versions…</K.Item>}
      <K.Item
        onClick={() => {
          const name = window.prompt("Save to your widgets as:", title ?? "My widget");
          if (name) start(async () => { if (told(await saveToPool(source, name), "Not saved")) return; toast.success("Saved to My Widgets", { description: "Drag it from the Pool onto any dashboard." }); });
        }}
      >
        <BookmarkPlus /> Save as Widget
      </K.Item>
      {widget.id && !isLayout && <K.Item onClick={() => setTimeout(() => setSaveTemplateOpen(true), 0)}><LayoutTemplate /> Save as template…</K.Item>}
      {ownDesign && (
        <>
          <K.Item onClick={() => downloadDesign(ownDesign)}><FileDown /> Export View Design</K.Item>
          <K.Item onClick={() => downloadDesign(duplicateAsDesign(widget, ownDesign))}><Copy /> Duplicate as View Design</K.Item>
        </>
      )}
      {/* A copy onto a slide of a deck the person may change (ticket #1); the core checks the rest. */}
      {widget.id && <K.Item onClick={() => setTimeout(() => setDeckOpen(true), 0)}><Presentation /> Add to deck…</K.Item>}
      {targets.length > 0 && (
        <K.Sub>
          <K.SubTrigger><LayoutDashboard /> Add to dashboard</K.SubTrigger>
          <K.SubContent>
            {targets.map((d) => (
              <K.Item key={d.id} onClick={() => start(async () => { if (told(await placeWidget(d.id, source), "Not added")) return; toast.success(`Added to ${d.name}`); })}>{d.name}</K.Item>
            ))}
          </K.SubContent>
        </K.Sub>
      )}
      {ms.map((x) => <K.Item key={`q${x.id}`} onClick={() => openQuickLook(x.slug)}><PanelRightOpen /> Quick look{ms.length > 1 ? ` at ${x.name}` : ""}</K.Item>)}
      {ms.map((x) => <K.Item key={x.id} onClick={() => router.push(`/metrics/${x.slug}`)}><ExternalLink /> Open {ms.length > 1 ? x.name : "metric"}</K.Item>)}
      {editable && widget.id && (
        <>
          <K.Separator />
          <K.Item onClick={() => start(async () => { told(await removeWidget(widget.id!), "Not removed"); })} className="text-destructive"><Trash2 /> Remove from dashboard</K.Item>
        </>
      )}
    </>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          ref={frame}
          className={cn("stock group/widget flex h-full flex-col overflow-hidden rounded-[var(--radius-card)]", panel && "outline-2 outline-offset-2 outline-ring", className)}
          onContextMenuCapture={() => { setPeriod(null); setRow(null); }}
        >
          <div className={cn("flex items-center gap-2 px-4 pt-3 pb-1", dragHandle && "widget-drag cursor-grab active:cursor-grabbing")}>
            {dragHandle && <GripVertical aria-hidden className="-ml-2 size-3.5 text-muted-foreground opacity-0 group-hover/widget:opacity-100" />}
            <span className="truncate text-sm font-semibold">{title}</span>
            {ms.length === 1 && <QuickLookButton slug={ms[0].slug} name={ms[0].name} className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/widget:opacity-100 max-md:opacity-100" />}
            {/* It keeps drawing an Archived Metric's history, and says that no new values come (GLOSSARY: Archived Metric). */}
            {ms.some(isArchived) && <span title={ms.length > 1 ? "Some of its Metrics are archived: they take no new values." : "Its Metric is archived: it takes no new values."} className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Archive aria-hidden className="size-3.5" /> Archived</span>}
            {open > 0 && <span title={`${open} open action(s)`} className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><MessageSquare aria-hidden className="size-3.5" /><span className="fig">{open}</span> open</span>}
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={`Options for ${title}`} className="-mr-1.5 ml-auto flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-60 group-hover/widget:opacity-100 hover:bg-muted focus-visible:opacity-100 data-popup-open:opacity-100" onMouseDown={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">{items(DM)}</DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-4 pb-3">
            {/* A size container: values and story words scale with the card, from phone to wall screen. */}
            <div className="@container min-h-0 flex-1">
            <WidgetBody widget={widget} data={data} onPointContext={(_, p) => setPeriod(p)} onRowContext={(_, label, p) => { setPeriod(p); setRow(label); }} />
            </div>
            {m && templateOf(widget).kind === "metric" && <CompareStrip metric={m} data={data} keys={widget.settings.compare ?? DEFAULT_COMPARE} full={widget.settings.fullPeriods} />}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">{items(CM)}</ContextMenuContent>
      </ContextMenu>

      {slotFill.dialog}
      {deckOpen && widget.id && <AddToDeckDialog widgetId={widget.id} open={deckOpen} onOpenChange={setDeckOpen} />}
      {saveTemplateOpen && widget.id && <SaveTemplateDialog widget={widget as Widget} data={data} onClose={() => setSaveTemplateOpen(false)} />}
      {layoutOpen && widget.id && (
        <Dialog
          open
          onOpenChange={(o, details) => {
            // tldraw uses Escape and outside clicks itself: only Cancel, Save or the close button end editing.
            const reason = (details as { reason?: string } | undefined)?.reason;
            if (!o && reason !== "escape-key" && reason !== "outside-press") setLayoutOpen(false);
          }}
        >
          <DialogContent className="h-[90vh] w-[94vw] max-w-none sm:max-w-none">
            <DialogTitle className="sr-only">Edit layout</DialogTitle>
            <LayoutEditor
              widget={{ w: widget.w ?? 8, h: widget.h ?? 10, settings: widget.settings }}
              data={data}
              saved={saved}
              onCancel={() => setLayoutOpen(false)}
              onSave={(settings, metricIds) => start(async () => {
                try {
                  unwrap(await updateWidget(widget.id!, { settings, metricIds }));
                  setLayoutOpen(false);
                } catch (err) {
                  toast.error("Layout not saved", { description: shown(err) });
                }
              })}
            />
          </DialogContent>
        </Dialog>
      )}
      <Popover open={panel !== null} onOpenChange={(o) => { if (!o) { setPanel(null); setPeriod(null); setRow(null); } }}>
        <PopoverContent anchor={frame} side="right" align="start" sideOffset={8} className={cn("p-0", panel === "history" || panel === "story" || panel === "versions" ? "w-[26rem]" : "w-80")}>
          {panel === "history" && m && <HistoryPanel metricId={m.id} data={data} />}
          {panel === "versions" && widget.id && <div className="p-3"><VersionsPanel type="widget" id={widget.id} people={data.people} onRestored={() => router.refresh()} /></div>}
          {panel === "story" && m && widget.id && (
            <StoryEditor
              widget={widget}
              data={data}
              m={m}
              onSave={(settings) => start(async () => { if (told(await updateWidget(widget.id!, { settings }), "Not saved")) return; setPanel(null); })}
            />
          )}
          {panel === "ask" && m && (
            <AskPanel
              key={`${kind}-${period}-${row}`}
              row={row}
              kind={kind}
              setKind={setKind}
              metric={m}
              data={data}
              initialPeriod={period}
              onDone={(id, who) => {
                setPanel(null);
                setPeriod(null);
                toast.success(`${kind === "task" ? "Task" : "Question"} put to ${who}`, { action: { label: "Open thread", onClick: () => router.push(`/actions/${id}`) } });
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

// Adapters so one item list renders in both menu kinds.
const CM = { Item: ContextMenuItem, Separator: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent, RadioGroup: ContextMenuRadioGroup, RadioItem: ContextMenuRadioItem, CheckboxItem: ContextMenuCheckboxItem };
const DM = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent, RadioGroup: DropdownMenuRadioGroup, RadioItem: DropdownMenuRadioItem, CheckboxItem: DropdownMenuCheckboxItem } as unknown as typeof CM;

function HistoryPanel({ metricId, data }: { metricId: number; data: CanvasData }) {
  const m = data.metrics.find((x) => x.id === metricId)!;
  const [h, setH] = useState<{ observations: Observation[]; actions: Action[]; superseded: { id: number; period_start: string; value: number; superseded_at: string; change: string; submitter_id: string | null }[] } | null>(null);
  useEffect(() => {
    getHistory(metricId).then((r) => setH(r as never));
  }, [metricId]);
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="border-b p-3">
        <div className="text-sm font-semibold">History of {m.name}</div>
        <div className="text-xs text-muted-foreground"><span className="fig">{data.series[m.slug]?.length ?? 0}</span> {m.period}s on record</div>
        <div className="mt-2"><MetricChart metric={m} points={data.series[m.slug] ?? []} height={120} markers={h?.actions.map((a) => a.period_start)} yearStart={data.yearStart} numberStyle={data.numberStyle} /></div>
      </div>
      <div className="border-b p-3"><CompareTable metric={m} resolve={resolverFrom(data.metrics, data.series)} targets={data.targets[m.id]} compact yearStart={data.yearStart} numberStyle={data.numberStyle} attainmentMethod={data.attainmentMethod} /></div>
      {h && h.actions.length > 0 && (
        <div className="border-b p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Questions and tasks</div>
          {h.actions.map((a) => (
            <Link key={a.id} href={`/actions/${a.id}`} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
              <StatusDot status={a.status} kind={a.kind} /> <span className="flex-1 truncate">{approvalQuestionForWeb(a.question)}</span> <span className="text-muted-foreground">{periodLabel(a.period_start, m.period, data.yearStart, true)}</span>
            </Link>
          ))}
        </div>
      )}
      {h && h.superseded.length > 0 && (
        <div className="border-b p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Superseded values</div>
          <ul className="space-y-0.5 text-xs">
            {h.superseded.slice(0, 8).map((x) => (
              <li key={x.id} className="flex gap-2">
                <span className="text-muted-foreground">{periodLabel(x.period_start, m.period, data.yearStart, true)}</span>
                <span className="fig line-through">{formatValue(m, Number(x.value), data.numberStyle)}</span>
                <span className="ml-auto text-muted-foreground">{x.change === "deleted" ? "removed" : "replaced"} <RelativeTime at={x.superseded_at} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <table className="w-full text-xs">
        <tbody>
          {!h && <tr><td className="p-3 text-muted-foreground">Loading…</td></tr>}
          {h?.observations.slice(0, 60).map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-1.5 pl-3 text-muted-foreground">{periodLabel(o.period_start, m.period, data.yearStart, true)}</td>
              <td className="fig py-1.5">
                {formatValue(m, Number(o.value), data.numberStyle)}
                {o.original_value !== null && <span className="ml-1 text-muted-foreground line-through">{formatValue(m, Number(o.original_value), data.numberStyle)}</span>}
              </td>
              <td className="py-1.5 text-muted-foreground">{SOURCE_LABEL[o.source as keyof typeof SOURCE_LABEL] ?? o.source}</td>
              <td className="py-1.5 pr-3 text-right text-muted-foreground">{o.submitter_id ? people[o.submitter_id]?.name.split(" ")[0] : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AskPanel({ kind, setKind, metric, data, initialPeriod, row, onDone }: { kind: ActionKind; setKind: (k: ActionKind) => void; metric: CanvasData["metrics"][number]; data: CanvasData; initialPeriod: string | null; row: string | null; onDone: (id: number, who: string) => void }) {
  const pts = [...(data.series[metric.slug] ?? [])].reverse();
  const others = data.people.filter((p) => p.id !== data.viewer && !p.contact); // Contacts are not asked in threads
  const [period, setPeriod] = useState(initialPeriod ?? pts[0]?.period ?? "");
  // Default recipient: whoever reports the metric, else its owner.
  const preferred = [...(data.submitters[metric.id] ?? []), metric.owner_id].find((id) => id !== data.viewer);
  const [assignee, setAssignee] = useState(preferred ?? others[0]?.id);
  const draft = (p: string) => {
    const label = periodLabel(p, metric.period, data.yearStart);
    // About one row of a breakdown: "What happened with France in October 2026?"
    if (row) return kind === "task" ? `Look into ${row} for ${metric.name.toLowerCase()} in ${label}` : `What happened with ${row} in ${metric.name.toLowerCase()}, ${label}?`;
    const v = pts.find((x) => x.period === p)?.value;
    const off = v !== undefined && ((metric.target_max !== null && v > metric.target_max) || (metric.target_min !== null && v < metric.target_min));
    const word = metric.polarity === "lower" ? "high" : "low";
    if (kind === "task") return off ? `Find out why ${metric.name.toLowerCase()} is so ${word} in ${label} and fix it` : `Look into ${metric.name.toLowerCase()} for ${label}`;
    return off ? `Why is ${metric.name.toLowerCase()} so ${word} in ${label}?` : `What happened with ${metric.name.toLowerCase()} in ${label}?`;
  };
  const [text, setText] = useState(draft(period));
  const [due, setDue] = useState("");
  const [via, setVia] = useState<ConnectorId | "">("");
  const [readers, setReaders] = useState<string>("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const id = await assignInPlace({ metricId: metric.id, period, assigneeId: assignee!, kind, text, due: kind === "task" ? due : null, breakdownLabel: row, via: via || null, readGroupId: readers ? Number(readers) : null });
          if (told(id, kind === "task" ? "No Task assigned" : "No Question asked")) return;
          onDone(id, others.find((p) => p.id === assignee)?.name.split(" ")[0] ?? "");
        });
      }}
    >
      <div className="flex rounded-[12px] bg-muted p-1 text-sm shadow-[var(--press-groove)]">
        {(["question", "task"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("min-h-8 flex-1 rounded-[var(--radius-input)] capitalize transition-colors", kind === k ? "stock font-medium" : "text-muted-foreground hover:text-foreground")}>{k}</button>
        ))}
      </div>
      {row && <p className="text-xs text-muted-foreground">About <span className="font-medium text-foreground">{row}</span> in the breakdown</p>}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">About</span>
          <select value={period} onChange={(e) => { setPeriod(e.target.value); setText(draft(e.target.value)); }} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
            {pts.slice(0, 36).map((p) => <option key={p.period} value={p.period}>{periodLabel(p.period, metric.period, data.yearStart, true)}, {formatValue(metric, p.value, data.numberStyle)}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">{kind === "task" ? "Assign to" : "Ask"}</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2">
            {others.map((p) => <option key={p.id} value={p.id}>{p.name.split(" ")[0]}</option>)}
          </select>
        </label>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
      {kind === "task" && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Due <Input type="date" value={due} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDue(e.target.value)} /></label>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Who can read
        <select value={readers} onChange={(e) => setReaders(e.target.value)} className="h-8 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2">
          <option value="">Everyone</option>
          {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name} only</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Send via
        <select value={via} onChange={(e) => setVia(e.target.value as ConnectorId | "")} className="h-8 flex-1 rounded-[var(--radius-input)] border border-input bg-card px-2">
          <option value="">{others.find((p) => p.id === assignee)?.name.split(" ")[0] ?? "Their"}&rsquo;s choice</option>
          {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
        </select>
      </label>
      <Button type="submit" className="w-full" disabled={pending || !text.trim()}>{kind === "task" ? "Assign task" : "Send question"}</Button>
    </form>
  );
}
