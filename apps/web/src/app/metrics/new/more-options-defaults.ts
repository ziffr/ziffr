// The values of the new-Metric form's "More options" and what counts as left alone (GLOSSARY: Metric Description,
// Submission Rule, Aggregation, Source, Attainment). The defaults are exactly what the form submitted before the
// options were folded away, so a person who never opens them creates the same Metric as before.
import { ASK_NOTE_DEFAULT, ASK_NOTE_LABEL, ASK_NOTE_SETTING, isAskNote } from "@ziffr/core/ask-note";
import { suggestedSide } from "@ziffr/core/units";
import { RULE_LABEL } from "@ziffr/core/format";
import type { SubmissionRule } from "@ziffr/core/types";

/** The fields behind "More options", as the form holds them. `attainment_method` is "" to follow the Workspace. */
export type MoreOptionValues = {
  unit: string;
  unit_position: string;
  decimals: number;
  submission_rule: string;
  aggregation: string;
  sources: string[];
  attainment_method: string;
  ask_note: string;
};

/** What a new Metric starts with when the options are left alone (the form's blank description). */
export const MORE_DEFAULTS = {
  decimals: 0,
  submission_rule: "overwrite",
  aggregation: "sum",
  sources: ["web_form", "mail", "slack", "telegram", "api"],
  attainment_method: "",
  ask_note: ASK_NOTE_DEFAULT,
} as const;

const AGGREGATION_LABEL: Record<string, string> = { sum: "Sum", average: "Average", last: "Last value", none: "Does not combine" };

/** The side a unit stands on when nobody chose one: the one its sign suggests, otherwise after the number. */
export function defaultSide(unit: string): string {
  return suggestedSide(unit) ?? "after";
}

/** One short phrase per option that differs from the default, for the closed "More options" summary; empty when all
 * are left alone. `sourceLabels` names the Sources, `attainmentLabel` the chosen Attainment method. */
export function nonDefaultOptions(v: MoreOptionValues, sourceLabels: Record<string, string> = {}, attainmentLabel = ""): string[] {
  const out: string[] = [];
  if (v.unit_position !== defaultSide(v.unit)) out.push(`Stands ${v.unit_position} the number`);
  if (v.decimals !== MORE_DEFAULTS.decimals) out.push(`${v.decimals} ${v.decimals === 1 ? "decimal" : "decimals"}`);
  if (v.submission_rule !== MORE_DEFAULTS.submission_rule) out.push(`Second value: ${RULE_LABEL[v.submission_rule as SubmissionRule] ?? v.submission_rule}`);
  if (v.aggregation !== MORE_DEFAULTS.aggregation) out.push(`Aggregation: ${AGGREGATION_LABEL[v.aggregation] ?? v.aggregation}`);
  const same = v.sources.length === MORE_DEFAULTS.sources.length && MORE_DEFAULTS.sources.every((s) => v.sources.includes(s));
  if (!same) out.push(`Sources: ${v.sources.length ? v.sources.map((s) => sourceLabels[s] ?? s).join(", ") : "none"}`);
  if (v.attainment_method !== MORE_DEFAULTS.attainment_method) out.push(`Attainment: ${attainmentLabel || v.attainment_method}`);
  if (v.ask_note !== MORE_DEFAULTS.ask_note) out.push(`${ASK_NOTE_SETTING}: ${isAskNote(v.ask_note) ? ASK_NOTE_LABEL[v.ask_note] : v.ask_note}`);
  return out;
}
