"use client";
// The toolbar of a Metric's page (GLOSSARY: Metric, Submitter, Alert, Archived Metric): Record a value is the one main
// button for someone who submits it, Share sits beside it, and everything else is in the ⋯ menu, so the page does not
// show eight equal buttons (ticket #521). The dialogs and slide-overs the menu opens live here, so they outlive it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Bell, Copy, LayoutDashboard, Send, Sigma, Trash2 } from "lucide-react";
import { placeWidget } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { AlertMe } from "@/components/alerts";
import { usePanel } from "@/lib/panel-param";
import { ObjectToolbar, type ObjectToolbarProps, type MenuEntry } from "@/components/object-toolbar";
import { askNow } from "./ask-now";
import { ArchiveMetric, useBringBack } from "./archive-metric";
import { DeleteMetric } from "./delete-metric";
import { RecordValue } from "./record-value";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import type { AlertChoices, MyAlert } from "@ziffr/core/alerts";

/** What the menu offers this person, decided on the server from what they may do. */
export type MetricToolbarProps = Pick<ObjectToolbarProps, "id" | "people" | "share"> & {
  metric: { id: number; name: string; slug: string };
  /** Set when they submit the Metric: the form behind Record a value. */
  record: RecordingOffer | null;
  askable: boolean;
  alert: { mine: MyAlert[]; choices: AlertChoices } | null;
  canDuplicate: boolean;
  dashboards: { id: number; name: string }[];
  archive: { allowed: boolean; archived: boolean };
  canDelete: boolean;
};

/** The Metric page's toolbar: Record a value, Share and a ⋯ menu with the rest. */
export function MetricToolbar(p: MetricToolbarProps) {
  const router = useRouter();
  const [open, setOpen] = useState<"archive" | "delete" | null>(null);
  const [, setAlertOpen] = usePanel("alert");
  const bringBack = useBringBack(p.metric.id, p.metric.name);
  // Opened from a menu item: wait until the menu has closed and returned focus.
  const show = (o: "archive" | "delete") => () => { setTimeout(() => setOpen(o), 0); };
  const menu: MenuEntry[] = [
    ...(p.askable ? [{ label: "Ask me now", icon: <Send aria-hidden />, onSelect: () => { void askNow(p.metric.id); } }] : []),
    ...(p.alert ? [{ label: "Alert me…", icon: <Bell aria-hidden />, onSelect: () => { setTimeout(() => setAlertOpen(true), 0); } }] : []),
    { label: "Analyze", icon: <Sigma aria-hidden />, onSelect: () => router.push(`/analyze?add=${p.metric.id}`) },
    // Duplicating creates a Metric, which Guests may not; a Derived Metric's formula does not carry over.
    ...(p.canDuplicate ? [{ label: "Duplicate", icon: <Copy aria-hidden />, onSelect: () => router.push(`/metrics/new?copy=${p.metric.id}`) }] : []),
    ...(p.dashboards.length ? [{ label: "Add to dashboard", icon: <LayoutDashboard aria-hidden />, sub: p.dashboards.map((d) => ({ key: d.id, label: d.name, onSelect: () => { void addTo(d) } })) }] : []),
    ...(p.archive.allowed ? [p.archive.archived
      ? { label: "Bring back", icon: <ArchiveRestore aria-hidden />, onSelect: bringBack, separated: true }
      : { label: "Archive…", icon: <Archive aria-hidden />, onSelect: show("archive"), separated: true }] : []),
    ...(p.canDelete ? [{ label: "Delete…", icon: <Trash2 aria-hidden />, onSelect: show("delete"), danger: true }] : []),
  ];
  async function addTo(d: { id: number; name: string }) {
    if (told(await placeWidget(d.id, { type: "metric", id: p.metric.id }), "Not added")) return;
    toast.success(`Added to ${d.name}`);
  }
  return (
    <>
      <ObjectToolbar type="metric" id={p.id} people={p.people} share={p.share} menu={menu} lead={p.record ? <RecordValue offer={p.record} /> : undefined} />
      {p.alert && <AlertMe metric={p.metric} mine={p.alert.mine} choices={p.alert.choices} controlled />}
      {p.archive.allowed && !p.archive.archived && <ArchiveMetric metricId={p.metric.id} name={p.metric.name} open={open === "archive"} onOpenChange={(o) => setOpen(o ? "archive" : null)} />}
      {p.canDelete && <DeleteMetric metricId={p.metric.id} name={p.metric.name} open={open === "delete"} onOpenChange={(o) => setOpen(o ? "delete" : null)} />}
    </>
  );
}
