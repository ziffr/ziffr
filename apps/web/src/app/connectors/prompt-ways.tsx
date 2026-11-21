"use client";
// Where a Prompt goes (GLOSSARY: Prompt, Delivery Preference): the first way, and up to two more it goes by at the same
// time. The first answer on any of them counts; reminders go by the first way only. Used on Who gets what, where and on a
// person's own Deliveries settings; the core checks who may set which list.
import { CONNECTORS, CONNECTOR_IDS, type ConnectorId } from "@ziffr/core/connectors/index";
import { MAX_PROMPT_WAYS, PROMPT_WAYS } from "@ziffr/core/prompt-route";

const SELECT = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 font-normal disabled:opacity-70";

/** The ways chosen for Prompts in order, with a select for each; `list` is empty when the person leaves it to the team.
 * `onChange` gets the whole new list, or null to go back to the team default. */
export function PromptWays({ list, teamDefault, team, disabled, label, onChange }: { list: ConnectorId[]; teamDefault: ConnectorId[]; team?: boolean; disabled: boolean; label: string; onChange: (next: ConnectorId[] | null) => void }) {
  const shown = list.length ? list : [];
  const extra = (slot: number) => PROMPT_WAYS.filter((w) => !shown.some((c, i) => c === w && i !== slot));
  return (
    <div className="space-y-1">
      <select aria-label={`${label}: first way`} disabled={disabled} value={shown[0] ?? ""} onChange={(e) => onChange(e.target.value ? [e.target.value as ConnectorId, ...shown.slice(1).filter((c) => c !== e.target.value)] : null)} className={SELECT}>
        {!team && <option value="">{teamDefault.length ? `Team default (${teamDefault.map((c) => CONNECTORS[c].label).join(", ")})` : "Default: every way you’ve connected"}</option>}
        {CONNECTOR_IDS.map((c) => <option key={c} value={c}>{CONNECTORS[c].label}</option>)}
      </select>
      {shown.length > 0 && Array.from({ length: Math.min(shown.length + 1, MAX_PROMPT_WAYS) - 1 }, (_, i) => i + 1).map((slot) => (
        <select key={slot} aria-label={`${label}: also by (${slot})`} disabled={disabled} value={shown[slot] ?? ""} onChange={(e) => onChange(e.target.value ? [...shown.slice(0, slot), e.target.value as ConnectorId, ...shown.slice(slot + 1)] : shown.slice(0, slot))} className={SELECT}>
          <option value="">{slot === 1 ? "Only this way" : "No other way"}</option>
          {extra(slot).map((c) => <option key={c} value={c}>Also by {CONNECTORS[c].label}</option>)}
        </select>
      ))}
    </div>
  );
}
