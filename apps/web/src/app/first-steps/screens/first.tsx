// First Steps, "Let's add your first metric together" (spec 0067; GLOSSARY: First Steps, Metric, Metric Catalog): a few
// suggestions, each added by one press, or a Metric of one's own. Nothing calculated, as there is nothing to calculate
// from yet. Suggestions that are monthly in the catalog are asked weekly unless Monthly is chosen.
import { useState } from "react";
import { PenLine } from "lucide-react";
import { SUGGESTED_PERIODS, type SuggestedPeriod } from "@ziffr/core/first-steps-screens";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { Button } from "@/components/ui/button";
import { HOW_OFTEN } from "@/lib/metric-suggestions";
import { Choice, Choices, Options, ScreenHeading } from "../parts";
import { Added, useAddMetric } from "./add-metric";
import type { ScreenProps } from "./types";

/** The suggestions for the first Metric, and the way to define one's own. */
export function FirstScreen({ context, answers, go, leave }: ScreenProps) {
  const press = useAddMetric({ context, leave });
  const { adding, error, add } = press;
  const [often, setOften] = useState<SuggestedPeriod>(SUGGESTED_PERIODS[0]);
  const clean = context.clean;
  if (!clean) return null;
  if (clean.metricName) return <Added name={clean.metricName} {...press} />;
  const offers = answers.who === "me" ? clean.topics[answers.topic ?? "other"] : clean.team;
  const picked = adding?.pick;
  const pressed = picked && "catalogId" in picked ? offers.find((o) => o.id === picked.catalogId) : null;
  return (
    <>
      <ScreenHeading title="Let’s add your first metric together">A metric is one number you follow over time. Pick a suggestion or define your own.</ScreenHeading>
      {offers.some((o) => o.monthly) && <Options legend="How often" options={SUGGESTED_PERIODS} labels={PERIOD_LABEL} value={often} onPick={setOften} className="grid-cols-2" />}
      <div className="mt-4">
        <Choices>
          {offers.map((o) => (
            <Choice
              key={o.id} title={o.name} waiting={adding !== null} onPick={() => void add({ catalogId: o.id, ...(o.monthly ? { period: often } : {}) })}
              hint={<>{o.line} <span className="whitespace-nowrap">{o.monthly ? HOW_OFTEN[often] : o.often}.</span></>}
            />
          ))}
        </Choices>
      </div>
      <p role="status" className="mt-3 text-sm empty:mt-0">{pressed ? `Adding ${pressed.name}…` : ""}</p>
      <p role="alert" className="mt-3 text-sm text-destructive empty:mt-0">{error}</p>
      <Button type="button" variant="outline" className="mt-3 h-11 w-full md:h-10" disabled={adding !== null} onClick={() => go("own")}>
        <PenLine aria-hidden /> Define your own
      </Button>
    </>
  );
}
