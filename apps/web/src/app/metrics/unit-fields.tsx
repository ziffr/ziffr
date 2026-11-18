"use client";
// A Metric's format, unit and the side it stands on (spec 0022, ticket #110; GLOSSARY: Metric Description, Number
// Style), for the new-Metric form and "Edit details…". Choosing Money fills in the unit the Workspace Profile's
// currency proposes, which the owner may change; an example shows how a value will read. The core checks every field.
import { useState } from "react";
import { formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { Format, UnitPosition } from "@ziffr/core/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

/** The format, unit, side and decimals fields, named format, unit, unit_position and decimals. `money` is the unit a
 * money Metric starts with, from the Workspace Profile's currency. */
export function UnitFields({ format: format0, unit: unit0, unitPosition: side0, decimals: decimals0, money, numberStyle, maxDecimals = 6, idPrefix = "uf" }: {
  format: Format;
  unit: string;
  unitPosition: UnitPosition;
  decimals: number;
  money: { unit: string; unit_position: UnitPosition };
  numberStyle: NumberStyle;
  maxDecimals?: number;
  idPrefix?: string;
}) {
  const [format, setFormat] = useState<Format>(format0);
  const [unit, setUnit] = useState(unit0);
  const [side, setSide] = useState<UnitPosition>(side0);
  const [decimals, setDecimals] = useState(String(decimals0));
  const choose = (next: Format) => {
    setFormat(next);
    // Only a unit the form put there itself, or none, is replaced: one the owner typed stays.
    const proposed = unit === "" || unit === "%" || unit === money.unit;
    if (next === "currency" && proposed) { setUnit(money.unit); setSide(money.unit_position); }
    if (next === "percent" && proposed) { setUnit("%"); setSide("after"); }
  };
  const example = formatValue({ unit, unit_position: side, decimals: Math.min(maxDecimals, Math.max(0, Math.round(Number(decimals) || 0))) }, format === "percent" ? 12.5 : 1234.5, numberStyle);
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-format`} className="mb-1.5 block">Format</Label>
        <select id={`${idPrefix}-format`} name="format" value={format} onChange={(e) => choose(e.target.value as Format)} className={field}>
          <option value="number">Number</option>
          <option value="currency">Money</option>
          <option value="percent">Percent</option>
        </select>
      </div>
      <div className="grid grid-cols-[1fr_auto_4.5rem] gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-unit`} className="mb-1.5 block">Unit</Label>
          <Input id={`${idPrefix}-unit`} name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="€, $, d, pc…" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-side`} className="mb-1.5 block">Stands</Label>
          <select id={`${idPrefix}-side`} name="unit_position" value={side} onChange={(e) => setSide(e.target.value as UnitPosition)} className={field}>
            <option value="after">after</option>
            <option value="before">before</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-dec`} className="mb-1.5 block">Decimals</Label>
          <Input id={`${idPrefix}-dec`} name="decimals" type="number" min={0} max={maxDecimals} value={decimals} onChange={(e) => setDecimals(e.target.value)} />
        </div>
        <p className="col-span-3 -mt-1 text-xs text-muted-foreground">Shown as <span className="fig text-foreground">{example}</span></p>
      </div>
    </>
  );
}
