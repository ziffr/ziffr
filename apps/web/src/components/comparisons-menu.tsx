// A Widget's Comparisons submenu (GLOSSARY: Comparison, Attainment), drawn in its ⋯ menu and its right-click menu.
import type { ComponentType, ReactNode } from "react";
import { Check, Scale } from "lucide-react";
import { comparisonsFor, COMPARE_LABEL } from "@ziffr/core/compare";
import type { Metric, Point, WidgetSettings } from "@ziffr/core/types";
import { DEFAULT_COMPARE } from "@/components/compare-strip";

type Part = ComponentType<{ children?: ReactNode }>;
/** The parts of the menu it is drawn in. */
type Menu = { Item: ComponentType<{ children?: ReactNode; onClick?: () => void }>; Separator: ComponentType; Sub: Part; SubTrigger: Part; SubContent: Part };

/** The ticks of a Widget's Comparisons: the target, each period Comparison, and whole periods. */
export function ComparisonsMenu({ K, metric, targets, settings, onChange }: { K: Menu; metric: Metric; targets?: readonly Point[]; settings: WidgetSettings; onChange: (settings: WidgetSettings) => void }) {
  const keys = settings.compare ?? DEFAULT_COMPARE;
  const target = settings.compareTarget !== false;
  return (
    <K.Sub>
      <K.SubTrigger><Scale /> Comparisons</K.SubTrigger>
      <K.SubContent>
        {/* The target is a choice of its own, offered where the Metric has one: a range or a Target Series. */}
        {(metric.target_min !== null || metric.target_max !== null || !!targets?.length) && (
          <K.Item onClick={() => onChange({ ...settings, compareTarget: !target })}>
            <Check aria-hidden className={target ? "" : "invisible"} /> Target
          </K.Item>
        )}
        {comparisonsFor(metric.period).map((k) => {
          const on = keys.includes(k);
          return (
            <K.Item key={k} onClick={() => onChange({ ...settings, compare: on ? keys.filter((x) => x !== k) : [...keys, k] })}>
              <Check aria-hidden className={on ? "" : "invisible"} /> {COMPARE_LABEL[k]}
            </K.Item>
          );
        })}
        <K.Separator />
        <K.Item onClick={() => onChange({ ...settings, fullPeriods: !settings.fullPeriods })}>
          <Check aria-hidden className={settings.fullPeriods ? "" : "invisible"} /> Full periods instead of to date
        </K.Item>
      </K.SubContent>
    </K.Sub>
  );
}
