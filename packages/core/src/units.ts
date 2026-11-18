// A Metric's unit and the side it stands on (spec 0022, ticket #110; GLOSSARY: Metric Description). Pure, so the
// Metric forms in the browser propose the same unit the server would. Money is one kind of unit among others: the
// Workspace Profile's currency is only offered as the unit of a new money Metric.
import type { Format, MetricDescription, UnitPosition } from "./types";

/** The two sides a unit can stand on; "after" is the default. */
export const UNIT_POSITIONS: readonly UnitPosition[] = ["before", "after"];

/** Whether a value is one of the two sides. */
export function isUnitPosition(x: unknown): x is UnitPosition {
  return x === "after" || x === "before";
}

// The currencies written with a sign of their own; every other one is written as its code before the number.
const CURRENCY_UNIT: Readonly<Record<string, { unit: string; unit_position: UnitPosition }>> = {
  EUR: { unit: "€", unit_position: "after" },
  USD: { unit: "$", unit_position: "before" },
};

/** The unit a new money Metric starts with, from the Workspace Profile's ISO 4217 currency: "€" after for EUR (and
 * when none is set, as before), "$" before for USD, otherwise the code and a space before ("CHF 1'200"). */
export function moneyUnit(currency: string | null | undefined): { unit: string; unit_position: UnitPosition } {
  if (!currency) return CURRENCY_UNIT.EUR;
  return Object.hasOwn(CURRENCY_UNIT, currency) ? CURRENCY_UNIT[currency] : { unit: `${currency} `, unit_position: "before" };
}

/** The unit a Metric kept before units had a side shows with: the "€" or "%" its format used to add when its unit
 * was empty, after the number. The migration that added the side did the same for every stored Metric; this does it
 * for Metrics kept in old Snapshots and frozen View Links, so they show what they showed. */
export function keptUnit<M extends Pick<MetricDescription, "unit"> & { format: Format; unit_position?: UnitPosition }>(m: M): M & { unit_position: UnitPosition } {
  const unit = m.unit || (m.format === "currency" ? "€" : m.format === "percent" ? "%" : "");
  return { ...m, unit, unit_position: isUnitPosition(m.unit_position) ? m.unit_position : "after" };
}
