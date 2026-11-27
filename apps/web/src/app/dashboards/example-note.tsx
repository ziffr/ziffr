"use client";
// The line on a trial's example dashboard (#1292; GLOSSARY: Test Metric, Dashboard): what it is, and for the person who
// owns it and its Metric, Remove. The core decides who may remove it and whether the Metric goes too; this only asks
// first and says what happens.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { removeExample } from "@/app/home-actions";
import { shown, unwrap } from "@/lib/action-error";
import type { ExampleNote as Note } from "@ziffr/core/trial-example";

/** What Remove will do, in words, before the person agrees to it. */
export function removeWords(metricName: string, hasValues: boolean): string {
  return hasValues
    ? `The dashboard is deleted. ${metricName} has recorded values, so it and its values are kept, and Ziffr still asks for it: to delete them, open ${metricName} and choose Delete in its ⋯ menu.`
    : `The dashboard and the Metric ${metricName} are deleted, with the daily request for it. No value was recorded for it. This cannot be undone.`;
}

/** The line, above the dashboard. */
export function ExampleNote({ dashboardId, note }: { dashboardId: number; note: Note }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const remove = async () => {
    if (!note.remove || !(await confirm({ title: "Remove the example?", description: removeWords(note.metricName, note.remove.hasValues), confirmLabel: "Remove" }))) return;
    start(async () => {
      try {
        const done = unwrap(await removeExample(dashboardId));
        toast.success(done.words);
        router.replace("/");
      } catch (err) { toast.error("Not removed", { description: shown(err) }); }
    });
  };
  return (
    <section aria-label="About this dashboard" className="mb-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-card p-3 text-sm sm:flex-row sm:items-center">
      <p className="flex min-w-0 flex-1 gap-2">
        <Coffee aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>This is an example. Ziffr asks once a day for {note.metricName}, so you see how asking for a figure works.</span>
      </p>
      {note.remove && <Button type="button" variant="outline" className="h-11 w-full sm:h-8 sm:w-auto" disabled={pending} onClick={remove}>Remove<span className="sr-only"> the example</span></Button>}
      {dialog}
    </section>
  );
}
