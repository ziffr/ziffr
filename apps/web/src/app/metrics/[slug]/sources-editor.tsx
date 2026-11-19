"use client";
// How values of a Metric may arrive (GLOSSARY: Source): its owner ticks any of the web form, email, Slack and the API, and a
// submitter may then send a value whichever way suits them. The core checks the owner and the list.
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMetricSources } from "@/app/series-actions";
import { Button } from "@/components/ui/button";
import { SOURCE_LABEL } from "@ziffr/core/format";
import type { SourceId } from "@ziffr/core/types";

const CHOICES: SourceId[] = ["web_form", "mail", "slack", "telegram", "api"];
// The API takes values from programs with an Access Key and from Feeds (GLOSSARY: Source, Feed).
const LABEL: Partial<Record<SourceId, string>> = { api: "API and Feeds", telegram: "Telegram" };

/** Checkboxes for the Metric's Sources with a Save button, for its owner. */
export function SourcesEditor({ metricId, sources }: { metricId: number; sources: SourceId[] }) {
  const [chosen, setChosen] = useState<SourceId[]>(sources.filter((s) => CHOICES.includes(s)));
  const [pending, start] = useTransition();
  const router = useRouter();
  const changed = chosen.length !== sources.length || chosen.some((s) => !sources.includes(s));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {CHOICES.map((s) => (
        <label key={s} className="flex items-center gap-1.5">
          <input type="checkbox" checked={chosen.includes(s)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))} className="size-4 accent-primary" />
          {LABEL[s] ?? SOURCE_LABEL[s]}
        </label>
      ))}
      {changed && (
        <Button size="sm" disabled={pending || !chosen.length} onClick={() => start(async () => {
          try {
            const r = await setMetricSources(metricId, chosen);
            if (isActionError(r)) { toast.error("Not saved", { description: r.error }); return; }
            toast.success("Saved");
            router.refresh();
          } catch {
            toast.error("Not saved", { description: UNEXPECTED });
          }
        })}>Save</Button>
      )}
    </div>
  );
}
