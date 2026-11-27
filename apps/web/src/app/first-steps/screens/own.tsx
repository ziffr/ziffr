// First Steps, "Define your metric" (spec 0067; GLOSSARY: First Steps, Metric): a name, then a unit, then how often,
// each asked once the one before is answered, and then the button. Everything else takes a default and can be changed
// on the Metric's page later.
import { useState } from "react";
import { FIRST_METRIC_NAME_FIELD, OWN_PERIODS, OWN_UNIT_LABEL, OWN_UNITS, type OwnPeriod, type OwnUnit } from "@ziffr/core/first-steps-screens";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Options, ScreenHeading } from "../parts";
import { Added, useAddMetric } from "./add-metric";
import type { ScreenProps } from "./types";

/** A Metric of one's own, asked one thing at a time. */
export function OwnScreen({ context, leave }: ScreenProps) {
  const press = useAddMetric({ context, leave });
  const { adding, error, add } = press;
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<OwnUnit | null>(null);
  const [period, setPeriod] = useState<OwnPeriod | null>(null);
  if (context.clean?.metricName) return <Added name={context.clean.metricName} {...press} />;
  const named = Boolean(name.trim());
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (named && unit && period) void add({ name, unit, period }); }}>
      <ScreenHeading title="Define your metric" />
      <div className="space-y-1.5">
        <label htmlFor="fs-metric-name" className="block text-sm font-medium">Name</label>
        <Input id="fs-metric-name" name="name" value={name} maxLength={FIRST_METRIC_NAME_FIELD} autoComplete="off" enterKeyHint="next" className="h-11 md:h-9" placeholder="For example, Visitors" onChange={(e) => setName(e.target.value)} />
      </div>
      {/* Once asked, a question stays, so that nothing on the screen jumps away while the name is changed. */}
      {(named || unit) && <Options legend="Unit" options={OWN_UNITS} labels={OWN_UNIT_LABEL} value={unit} onPick={setUnit} className="grid-cols-2 sm:grid-cols-4" />}
      {unit && <Options legend="How often" options={OWN_PERIODS} labels={PERIOD_LABEL} value={period} onPick={setPeriod} className="grid-cols-3" />}
      <p role="alert" className="mt-4 text-sm text-destructive empty:mt-0">{error}</p>
      {period && <Button type="submit" className="mt-4 h-11 w-full md:h-10" disabled={!named || adding !== null}>{adding ? "Adding…" : "Add metric"}</Button>}
    </form>
  );
}
