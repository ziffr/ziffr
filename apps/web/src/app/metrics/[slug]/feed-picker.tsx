"use client";
// Choosing a Feed (GLOSSARY: Feed) as a Metric's Submitter, for its owner and Editors (spec 0012). Choosing one turns
// the Metric's API Source on; the core checks who may and that the Feed is this workspace's.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addFeedToMetric, removeFeedFromMetric } from "@/app/feed-actions";
import { Button } from "@/components/ui/button";
import { FillFromN8n } from "@/components/fill-from-n8n";

/** A select of the workspace's Feeds not yet submitting to this Metric, with an Add button. */
export function FeedPicker({ metricId, choices }: { metricId: number; choices: { id: string; name: string }[] }) {
  const [feed, setFeed] = useState(choices[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!choices.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <label className="text-xs text-muted-foreground" htmlFor={`feed-${metricId}`}>Values from a Feed</label>
      <select id={`feed-${metricId}`} value={feed} onChange={(e) => setFeed(e.target.value)} className="h-8 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
        {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={pending || !feed} onClick={() => start(async () => {
        try {
          unwrap(await addFeedToMetric(metricId, feed));
          toast.success("Feed added", { description: "Its values arrive through the API." });
          router.refresh();
        } catch (err) {
          toast.error("Not added", { description: shown(err) });
        }
      })}>Add</Button>
    </div>
  );
}

/** Under Who submits, for the Metric's owner and Editors: the Feed picker, and for Owners and Admins (not in the demo)
 * the n8n template for this Metric (spec 0043). */
export function FeedControls({ metric, choices, taken, role, demo, templates }: { metric: { id: number; name: string }; choices: { id: string; name: string }[]; taken: string[]; role: string; demo: boolean; templates: { id: string; label: string; reads: string; needs: string; rows: boolean }[] }) {
  return (
    <>
      <FeedPicker metricId={metric.id} choices={choices.filter((c) => !taken.includes(c.id))} />
      {!demo && (role === "owner" || role === "admin") && <FillFromN8n metrics={[metric]} feeds={choices} templates={templates} />}
    </>
  );
}

/** Stops a Feed submitting to the Metric; its earlier values stay. */
export function RemoveFeed({ metricId, feedId, name }: { metricId: number; feedId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className="text-xs underline" aria-label={`Stop values from ${name}`} onClick={() => start(async () => {
      try {
        unwrap(await removeFeedFromMetric(metricId, feedId));
        router.refresh();
      } catch (err) {
        toast.error("Not removed", { description: shown(err) });
      }
    })}>Remove</button>
  );
}
