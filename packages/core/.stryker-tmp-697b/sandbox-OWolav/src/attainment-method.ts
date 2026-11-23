// @ts-nocheck
// The Attainment method (spec 0022, ticket #130; GLOSSARY: Attainment): which of the two ways a Metric's Attainment
// is computed. Pure, so the browser shows the same names and picks the same method as the server.
//
// "ratio" is value ÷ target (target ÷ value for "lower is better"), what Ziffr showed up to 0.9.0; "distance" is
// 100 % plus the distance to the target in steps of its size. A Workspace has a default (`workspaces.attainment_method`,
// "ratio" for every Workspace that existed before), and a Metric may override it in its Metric Description
// (`metrics.attainment_method`, null to follow the Workspace).

/** The two Attainment methods; the first is the default. */
export const ATTAINMENT_METHODS = ["ratio", "distance"] as const;

/** One Attainment method: "ratio" or "distance". */
export type AttainmentMethod = (typeof ATTAINMENT_METHODS)[number];

/** The method of a Workspace that never chose one: what every Workspace showed up to 0.9.0. */
export const DEFAULT_ATTAINMENT_METHOD: AttainmentMethod = "ratio";

/** Whether a value is one of the two method keys. */
export function isAttainmentMethod(x: unknown): x is AttainmentMethod {
  // No typeof check: includes() matches only one of the two strings, so nothing else gets through.
  return (ATTAINMENT_METHODS as readonly unknown[]).includes(x);
}

/** The method a Metric's Attainment is computed with: its own override if it has one, else the Workspace's default.
 * Anything that is not one of the two keys (a Metric kept in a Snapshot before the override existed) follows the
 * Workspace. */
export function methodFor(metric: { attainment_method?: unknown }, workspaceMethod: AttainmentMethod): AttainmentMethod {
  return isAttainmentMethod(metric.attainment_method) ? metric.attainment_method : workspaceMethod;
}

/** The Workspace method a Snapshot or a frozen View Link was made with. One made before the method could be chosen
 * kept none and showed Attainment by ratio, so it keeps showing that. */
export function keptMethod(frozen: unknown): AttainmentMethod {
  return isAttainmentMethod(frozen) ? frozen : DEFAULT_ATTAINMENT_METHOD;
}

/** Each method's name, as the settings, the Metric form and the tooltip say it. */
export const ATTAINMENT_METHOD_LABEL: Readonly<Record<AttainmentMethod, string>> = {
  ratio: "By ratio",
  distance: "By distance",
};

/** Each method in one sentence, for the tooltip and the forms. */
export const ATTAINMENT_METHOD_RULE: Readonly<Record<AttainmentMethod, string>> = {
  ratio: "value ÷ target, or target ÷ value when lower is better",
  distance: "100 % plus the distance to the target, in steps of the target's size",
};

/** What a tooltip says about how an Attainment was computed, e.g. "Attainment by ratio: value ÷ target, …". */
export function attainmentMethodNote(method: AttainmentMethod): string {
  return `Attainment ${ATTAINMENT_METHOD_LABEL[method].toLowerCase()}: ${ATTAINMENT_METHOD_RULE[method]}.`;
}
