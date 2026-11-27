// What both screens that add the first Metric share (spec 0067; GLOSSARY: First Steps, Metric): the one press that
// adds it and goes on to the value, and what they show once there is a first Metric, so that no second one is offered.
import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { FIRST_STEPS_PATH, type FirstMetricPick } from "@ziffr/core/first-steps-screens";
import { Button } from "@/components/ui/button";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { addFirstMetric } from "../actions";
import { keepTopic } from "../draft";
import { ScreenHeading } from "../parts";
import type { ScreenProps } from "./types";

/** Adds the first Metric from a pick. `adding` holds the pick from the press until the next screen is loaded, so that
 * a second press does nothing; a refusal comes back as `error`, in words for the person. */
export function useAddMetric({ context, leave }: Pick<ScreenProps, "context" | "leave">) {
  const [adding, setAdding] = useState<FirstMetricPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function add(pick: FirstMetricPick) {
    if (adding || !context.workspace) return;
    setAdding(pick);
    setError(null);
    try {
      const r = await addFirstMetric(context.workspace.id, pick);
      if (isActionError(r)) { setError(r.error); setAdding(null); return; }
      // The topic has done its work.
      keepTopic(context.personId, null);
      // A full load: the next screen is drawn from the Metric as the server has it.
      leave(`${FIRST_STEPS_PATH}?step=value`);
    } catch (e) {
      unstable_rethrow(e);
      setError(UNEXPECTED);
      setAdding(null);
    }
  }
  return { adding, error, add };
}

/** The screen once the first Metric is there: its name, and on to its value. */
export function Added({ name, go }: { name: string; go: ScreenProps["go"] }) {
  return (
    <>
      <ScreenHeading title="Your first metric is added"><span className="break-words">“{name}” is on your dashboard.</span></ScreenHeading>
      <Button type="button" className="h-11 w-full md:h-10" onClick={() => go("value")}>Continue</Button>
    </>
  );
}
