// First Steps, "Let's add your first metric together" (spec 0067; GLOSSARY: First Steps, Metric, Metric Catalog): a few
// suggestions, each added by one press, or a Metric of one's own. Nothing calculated, as there is nothing to calculate
// from yet.
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choice, Choices, ScreenHeading } from "../parts";
import { Added, useAddMetric } from "./add-metric";
import type { ScreenProps } from "./types";

/** The suggestions for the first Metric, and the way to define one's own. */
export function FirstScreen({ context, answers, go, leave }: ScreenProps) {
  const { adding, error, add } = useAddMetric({ context, leave });
  const clean = context.clean;
  if (!clean) return null;
  if (clean.metricName) return <Added name={clean.metricName} go={go} />;
  const offers = answers.who === "me" ? clean.topics[answers.topic ?? "other"] : clean.team;
  const pressed = adding && "catalogId" in adding ? offers.find((o) => o.id === adding.catalogId) : null;
  return (
    <>
      <ScreenHeading title="Let’s add your first metric together">A metric is one number you follow over time. Pick a suggestion or define your own.</ScreenHeading>
      <Choices>
        {offers.map((o) => (
          <Choice
            key={o.id} title={o.name} waiting={adding !== null} onPick={() => void add({ catalogId: o.id })}
            hint={<>{o.line} <span className="whitespace-nowrap">{o.often}.</span></>}
          />
        ))}
      </Choices>
      <p role="status" className="mt-3 text-sm empty:mt-0">{pressed ? `Adding ${pressed.name}…` : ""}</p>
      <p role="alert" className="mt-3 text-sm text-destructive empty:mt-0">{error}</p>
      <Button type="button" variant="outline" className="mt-3 h-11 w-full md:h-10" disabled={adding !== null} onClick={() => go("own")}>
        <PenLine aria-hidden /> Define your own
      </Button>
    </>
  );
}
