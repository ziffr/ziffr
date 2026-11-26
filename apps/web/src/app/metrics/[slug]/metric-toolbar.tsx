"use client";
// The toolbar of a Metric's page (GLOSSARY: Metric, Submitter, Alert, Archived Metric): Record a value is the one main
// button for someone who submits it, Share sits beside it, and everything else is in the ⋯ menu, so the page does not
// show eight equal buttons (ticket #521). The dialogs and slide-overs the menu opens live here, so they outlive it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Bell, Copy, History, LayoutDashboard, Send, Sigma, Trash2 } from "lucide-react";
import { createDashboardNamed, placeWidget } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { AlertMe, type WebhookChoice } from "@/components/alerts";
import { usePanel } from "@/lib/panel-param";
import { ObjectToolbar, type ObjectToolbarProps, type MenuEntry } from "@/components/object-toolbar";
import { askNow } from "./ask-now";
import { AssistantPrompt } from "./assistant-prompt";
import { ArchiveMetric, useBringBack } from "./archive-metric";
import { DeleteMetric } from "./delete-metric";
import { FillPast } from "./fill-past";
import { RecordValue } from "./record-value";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import type { AlertChoices, MyAlert } from "@ziffr/core/alerts";
import type { Period } from "@ziffr/core/types";

/** What the menu offers this person, decided on the server from what they may do. */
export type MetricToolbarProps = Pick<ObjectToolbarProps, "id" | "people" | "share"> & {
  metric: { id: number; name: string; slug: string; description: string; calculationNote?: string | null; unit: string; period: Period };
  /** This Installation's MCP address, or null where it serves none: named in the text for an assistant. */
  mcp: string | null;
  /** Set when they submit the Metric: the form behind Record a value. */
  record: RecordingOffer | null;
  askable: boolean;
  alert: { mine: MyAlert[]; choices: AlertChoices; webhooks: WebhookChoice[] } | null;
  canDuplicate: boolean;
  /** Whether they may paste or upload values for it: it takes the web form and they submit it. */
  canPaste: boolean;
  dashboards: { id: number; name: string }[];
  /** Whether they may make a dashboard (not a Guest): then "Add to dashboard" also offers a new one. */
  canCreateDashboard: boolean;
  archive: { allowed: boolean; archived: boolean };
  canDelete: boolean;
};

/** The Metric page's toolbar: Record a value, Share and a ⋯ menu with the rest. */
export function MetricToolbar(p: MetricToolbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState<"archive" | "delete" | "assistant" | "fill" | null>(null);
  const [, setAlertOpen] = usePanel("alert");
  const bringBack = useBringBack(p.metric.id, p.metric.name);
  // Opened from a menu item: wait until the menu has closed and returned focus.
  const show = (o: "archive" | "delete" | "assistant" | "fill") => () => { setTimeout(() => setOpen(o), 0); };
  const menu: MenuEntry[] = [
    ...(p.askable ? [{ label: "Ask me now", icon: <Send aria-hidden />, onSelect: () => { void askNow(p.metric.id); } }] : []),
    ...(p.alert ? [{ label: "Alert me…", icon: <Bell aria-hidden />, onSelect: () => { setTimeout(() => setAlertOpen(true), 0); } }] : []),
    // For someone who submits the Metric: every way to bring its past values in, in one place (paste, template, assistant, system).
    ...(p.record || p.canPaste ? [{ label: "Fill past periods…", icon: <History aria-hidden />, onSelect: show("fill") }] : []),
    { label: "Analyze", icon: <Sigma aria-hidden />, onSelect: () => router.push(`/analyze?add=${p.metric.id}`) },
    // Duplicating creates a Metric, which Guests may not; a Derived Metric's formula does not carry over.
    ...(p.canDuplicate ? [{ label: "Duplicate", icon: <Copy aria-hidden />, onSelect: () => router.push(`/metrics/new?copy=${p.metric.id}`) }] : []),
    ...(p.dashboards.length || p.canCreateDashboard ? [{ label: "Add to dashboard", icon: <LayoutDashboard aria-hidden />, sub: [
      ...p.dashboards.map((d) => ({ key: d.id, label: d.name, onSelect: () => { void addTo(d); } })),
      ...(p.canCreateDashboard ? [{ key: "new", label: "New dashboard with this Metric", separated: p.dashboards.length > 0, onSelect: () => { void addToNew(); } }] : []),
    ] }] : []),
    ...(p.archive.allowed ? [p.archive.archived
      ? { label: "Bring back", icon: <ArchiveRestore aria-hidden />, onSelect: bringBack, separated: true }
      : { label: "Archive…", icon: <Archive aria-hidden />, onSelect: show("archive"), separated: true }] : []),
    ...(p.canDelete ? [{ label: "Delete…", icon: <Trash2 aria-hidden />, onSelect: show("delete"), danger: true }] : []),
  ];
  async function addTo(d: { id: number; name: string }) {
    if (told(await placeWidget(d.id, { type: "metric", id: p.metric.id }), "Not added")) return;
    toast.success(`Added to ${d.name}`);
  }
  /** Makes a dashboard named for the Metric, puts the Metric on it and opens it (its name and widgets can be changed there). */
  async function addToNew() {
    const made = await createDashboardNamed(p.metric.name);
    if (told(made, "No dashboard was made")) return;
    const id = made as number;
    // If only the adding failed the dashboard exists: open it, so it is not lost.
    if (told(await placeWidget(id, { type: "metric", id: p.metric.id }), "The dashboard was made, but the Metric was not added")) { router.push(`/dashboards/${id}`); return; }
    toast.success(`Made the dashboard “${p.metric.name}”`);
    router.push(`/dashboards/${id}`);
  }
  return (
    <>
      <ObjectToolbar type="metric" id={p.id} people={p.people} share={p.share} menu={menu} lead={p.record ? <RecordValue offer={p.record} /> : undefined} />
      {(p.record || p.canPaste) && <FillPast metric={p.metric} ways={{ paste: p.canPaste, assistant: Boolean(p.record), system: Boolean(p.record) }} open={open === "fill"} onOpenChange={(o) => setOpen(o ? "fill" : null)} onAssistant={show("assistant")} />}
      {p.record && <AssistantPrompt metric={{ ...p.metric, mcpUrl: p.mcp }} open={open === "assistant"} onOpenChange={(o) => setOpen(o ? "assistant" : null)} />}
      {p.alert && <AlertMe metric={p.metric} mine={p.alert.mine} choices={p.alert.choices} webhooks={p.alert.webhooks} controlled />}
      {p.archive.allowed && !p.archive.archived && <ArchiveMetric metricId={p.metric.id} name={p.metric.name} open={open === "archive"} onOpenChange={(o) => setOpen(o ? "archive" : null)} />}
      {p.canDelete && <DeleteMetric metricId={p.metric.id} name={p.metric.name} open={open === "delete"} onOpenChange={(o) => setOpen(o ? "delete" : null)} />}
    </>
  );
}
