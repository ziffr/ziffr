"use client";
// A Metric's format, unit and the side it stands on (spec 0022, ticket #110; GLOSSARY: Metric Description, Number
// Style), for the new-Metric form and "Edit details…". Choosing Money fills in the unit the Workspace Profile's
// currency proposes, which the owner may change; an example shows how a value will read. The core checks every field.
import { createContext, useContext, useState } from "react";
import { formatValue } from "@ziffr/core/format";
import { suggestedSide } from "@ziffr/core/units";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Format, UnitPosition } from "@ziffr/core/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

type UnitState = {
  format: Format; unit: string; side: UnitPosition; decimals: string;
  money: { unit: string; unit_position: UnitPosition }; numberStyle: NumberStyle; maxDecimals: number; idPrefix: string;
  choose: (f: Format) => void; typeUnit: (u: string) => void; pickSide: (s: UnitPosition) => void; setDecimals: (d: string) => void;
};
const Ctx = createContext<UnitState | null>(null);
function useUnit(): UnitState {
  const c = useContext(Ctx);
  if (!c) throw new Error("Unit fields need a UnitProvider");
  return c;
}

/** Holds the format, unit, side and decimals together, so the pieces below can stand in different places of a form
 * and still share one example line. `money` is the unit a money Metric starts with, from the Workspace Profile's currency. */
export function UnitProvider({ format: format0, unit: unit0, unitPosition: side0, decimals: decimals0, money, numberStyle, maxDecimals = 6, idPrefix = "uf", children }: {
  format: Format;
  unit: string;
  unitPosition: UnitPosition;
  decimals: number;
  money: { unit: string; unit_position: UnitPosition };
  numberStyle: NumberStyle;
  maxDecimals?: number;
  idPrefix?: string;
  children: React.ReactNode;
}) {
  const [format, setFormat] = useState<Format>(format0);
  const [unit, setUnit] = useState(unit0);
  const [side, setSide] = useState<UnitPosition>(side0);
  const [decimals, setDecimals] = useState(String(decimals0));
  // Once the owner picks a side themselves, typing the unit no longer changes it.
  const [sidePicked, setSidePicked] = useState(false);
  const typeUnit = (next: string) => {
    setUnit(next);
    const s = sidePicked ? null : suggestedSide(next);
    if (s) setSide(s);
  };
  const choose = (next: Format) => {
    setFormat(next);
    // Only a unit the form put there itself, or none, is replaced: one the owner typed stays.
    const proposed = unit === "" || unit === "%" || unit === money.unit;
    if (next === "currency" && proposed) { setUnit(money.unit); setSide(money.unit_position); }
    if (next === "percent" && proposed) { setUnit("%"); setSide("after"); }
  };
  const pickSide = (s: UnitPosition) => { setSide(s); setSidePicked(true); };
  return <Ctx.Provider value={{ format, unit, side, decimals, money, numberStyle, maxDecimals, idPrefix, choose, typeUnit, pickSide, setDecimals }}>{children}</Ctx.Provider>;
}

/** The Format select. */
export function UnitFormat() {
  const u = useUnit();
  return (
    <div>
      <Label htmlFor={`${u.idPrefix}-format`} className="mb-1.5 block">Format</Label>
      <select id={`${u.idPrefix}-format`} name="format" value={u.format} onChange={(e) => u.choose(e.target.value as Format)} className={field}>
        <option value="number">Number</option>
        <option value="currency">Money</option>
        <option value="percent">Percent</option>
      </select>
    </div>
  );
}

/** The Unit input. */
export function UnitInput() {
  const u = useUnit();
  return (
    <div>
      <Label htmlFor={`${u.idPrefix}-unit`} className="mb-1.5 block">Unit</Label>
      <Input id={`${u.idPrefix}-unit`} name="unit" value={u.unit} onChange={(e) => u.typeUnit(e.target.value)} maxLength={20} placeholder="€, $, d, pc…" />
    </div>
  );
}

/** The Stands select: which side of the number the unit is on. */
export function UnitSide() {
  const u = useUnit();
  return (
    <div>
      <Label htmlFor={`${u.idPrefix}-side`} className="mb-1.5 block">Stands</Label>
      <select id={`${u.idPrefix}-side`} name="unit_position" value={u.side} onChange={(e) => u.pickSide(e.target.value as UnitPosition)} className={field}>
        <option value="after">after</option>
        <option value="before">before</option>
      </select>
    </div>
  );
}

/** The Decimals input. */
export function UnitDecimals() {
  const u = useUnit();
  return (
    <div>
      <Label htmlFor={`${u.idPrefix}-dec`} className="mb-1.5 block">Decimals</Label>
      <Input id={`${u.idPrefix}-dec`} name="decimals" type="number" min={0} max={u.maxDecimals} value={u.decimals} onChange={(e) => u.setDecimals(e.target.value)} />
    </div>
  );
}

/** The "Shown as" line: how a value will read with the current unit, side and decimals. */
export function UnitExample({ className }: { className?: string }) {
  const u = useUnit();
  const example = formatValue({ unit: u.unit, unit_position: u.side, decimals: Math.min(u.maxDecimals, Math.max(0, Math.round(Number(u.decimals) || 0))) }, u.format === "percent" ? 12.5 : 1234.5, u.numberStyle);
  return <p className={className ?? "text-xs text-muted-foreground"}>Shown as <span className="fig text-foreground">{example}</span></p>;
}

/** The format, unit, side and decimals fields, named format, unit, unit_position and decimals, for "Edit details…". */
export function UnitFields(props: Omit<React.ComponentProps<typeof UnitProvider>, "children">) {
  return (
    <UnitProvider {...props}>
      <UnitFormat />
      <div className="grid grid-cols-[1fr_auto_4.5rem] gap-3">
        <UnitInput />
        <UnitSide />
        <UnitDecimals />
        <UnitExample className="col-span-3 -mt-1 text-xs text-muted-foreground" />
      </div>
    </UnitProvider>
  );
}
