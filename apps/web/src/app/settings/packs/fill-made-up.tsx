"use client";
// "Fill with made-up numbers" on an installed Pack, in a Practice Workspace only (spec 0063; GLOSSARY: Practice
// Workspace): the Metrics its Set ups made get made-up values and targets, a few at a time, and the screen says how far
// it is. The core decides who may and never replaces a value.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { fillMadeUpNumbers } from "@/app/pack-setup-actions";

/** What is said once it is done: which of the latest periods have no values, and why. */
const LEFT_EMPTY = "Where a Metric has a Submitter, the last ended period and the running one are left empty, so you can try asking for them. A Metric without one is filled to the last ended period.";

/** The button, and under it how far it is or what was filled. */
export function FillMadeUp({ installId }: { installId: number }) {
  const router = useRouter();
  const [words, setWords] = useState("");
  const [pending, start] = useTransition();
  const fill = () => start(async () => {
    let after = 0;
    let values = 0;
    let targets = 0;
    setWords("Filling in made-up numbers…");
    try {
      for (;;) {
        const step = unwrap(await fillMadeUpNumbers(installId, after));
        values += step.values;
        targets += step.targets;
        if (step.done) {
          setWords(!step.of ? "There is nothing to fill: set this Pack up first." : `${values || targets ? `Filled ${step.of} Metric${step.of === 1 ? "" : "s"} with ${values.toLocaleString("en")} made-up values and ${targets.toLocaleString("en")} targets.` : "Nothing to add."} ${LEFT_EMPTY}`);
          break;
        }
        after = step.next;
        setWords(`Filling in made-up numbers: ${step.filled} of ${step.of} Metrics…`);
      }
    } catch (e) {
      setWords("");
      toast.error("Not filled", { description: shown(e) });
    }
    router.refresh();
  });
  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={pending} onClick={fill}>Fill with made-up numbers</Button>
      <p role="status" className="mt-1 text-xs text-muted-foreground">{words}</p>
    </div>
  );
}
