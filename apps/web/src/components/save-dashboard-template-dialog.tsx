"use client";
// Saving a dashboard as a team Dashboard Template (spec 0014, GLOSSARY: Dashboard Template, Slot). The core makes the
// draft from the stored widgets: one Slot per Metric (or set of Metrics) however many widgets show it. The viewer names
// the Slots; Free Layouts stay behind, and the panel says so (spec 0050).
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftDashboardTemplate, saveAsDashboardTemplate } from "@/app/dashboard-template-actions";
import type { Slot } from "@ziffr/core/types";
import { SlideOverWindow } from "./slide-over-window";

type Draft = { slots: Slot[]; leftOut: string[]; notices: string[]; widgets: number };

type Props = { dashboardId: number; dashboardName: string; metricName: (id: number) => string | undefined; onClose: () => void };

/** The window, in the side panel; `metricName` names the Metrics this viewer sees (they see all of a dashboard they may save). */
export function SaveDashboardTemplateDialog(props: Props) {
  return (
    <SlideOverWindow title="Save as template" description="Your team can start new dashboards from it, each with their own Metrics. Every Metric here becomes a place to fill; name each so others know what goes in." onClose={props.onClose}>
      <SaveDashboardTemplateForm {...props} />
    </SlideOverWindow>
  );
}

function SaveDashboardTemplateForm({ dashboardId, dashboardName, metricName, onClose }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [name, setName] = useState(dashboardName);
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    draftDashboardTemplate(dashboardId)
      // Labels start empty: the whole team reads them, and a Metric's name may be one not everyone may see.
      .then((r) => { const d = unwrap(r); setDraft(d); setLabels(d.slots.map(() => "")); })
      .catch(() => setFailed("You can save a dashboard as a template when you may change it and see every Metric on it."));
  }, [dashboardId]);
  const save = () => start(async () => {
    try {
      unwrap(await saveAsDashboardTemplate({ dashboardId, name, description, labels }));
      toast.success("Template saved", { description: "Anyone in the workspace can start a dashboard from it." });
      onClose();
    } catch (e) {
      toast.error("Not saved", { description: shown(e) });
    }
  });
  return (
    <>
        {failed ? <p className="text-sm text-destructive">{failed}</p> : !draft ? <p className="text-sm text-muted-foreground">Reading the dashboard…</p> : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <label className="block text-sm font-medium">Name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="mt-1" /></label>
            <label className="block text-sm font-medium">What it is for<Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="e.g. The monthly numbers for one region" className="mt-1" /></label>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Places to fill</legend>
              <p className="text-xs text-muted-foreground">Everyone in the Workspace reads these names, also people who cannot see the Metrics or Tags here now. Do not name a Tag you were not meant to share; a place that follows a Tag starts as &ldquo;Tagged Metrics&rdquo;.</p>
              {draft.slots.map((s, i) => (
                <label key={i} className="block text-xs text-muted-foreground">
                  Now: {(s.exampleIds ?? []).map(metricName).filter(Boolean).join(", ") || (s.multiple ? "all Metrics of a Tag" : "a Metric")}
                  <Input value={labels[i] ?? ""} onChange={(e) => setLabels(labels.map((l, j) => (j === i ? e.target.value : l)))} maxLength={40} placeholder={draft.slots[i].label && !(draft.slots[i].exampleIds ?? []).length ? draft.slots[i].label : `Metric ${i + 1}`} className="mt-1" aria-label={`Name of place ${i + 1}`} />
                </label>
              ))}
              {!draft.slots.length && <p className="text-sm text-muted-foreground">No Metrics on this dashboard.</p>}
            </fieldset>
            {(draft.leftOut.length > 0 || draft.notices.length > 0) && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {draft.leftOut.length > 0 && <li>Left out, because a template cannot keep free layouts yet: {draft.leftOut.join(", ")}.</li>}
                {draft.notices.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={pending || !draft.widgets || !name.trim()}>Save template</Button>
            </div>
          </form>
        )}
    </>
  );
}
