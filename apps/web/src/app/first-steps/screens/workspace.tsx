// First Steps, "Set up your Workspace" (spec 0067; GLOSSARY: First Steps, Workspace, Trial Workspace, Workspace Export):
// the name, and what the browser says about the day and the money, changeable before anything is made.
import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { answersToSend, FIRST_STEPS_NAME_FIELD, FIRST_STEPS_PATH } from "@ziffr/core/first-steps-screens";
import { COUNTRIES, CURRENCIES, currencyFor } from "@ziffr/core/workspace-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { makeWorkspace, saveAnswers } from "../actions";
import { countryName, currencyName, timeZones } from "../browser";
import { ScreenHeading } from "../parts";
import type { ScreenProps } from "./types";

// 44 px tall and 16 px text on a phone; the compact size from the desktop shell.
const field = "block h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base md:h-9 md:text-sm";

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {options.map(([v, words]) => <option key={v} value={v}>{words}</option>)}
      </select>
    </div>
  );
}

/** The Workspace's name, and the button that makes the Workspace or, after Start over, saves the answers. */
export function WorkspaceScreen({ context, answers, update, leave }: ScreenProps) {
  const made = context.workspace;
  const [change, setChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { timeZone, currency, country, weekStart } = answers;
  const summary = [
    `Time zone: ${timeZone ?? "UTC"}`,
    `Currency: ${currency ? currencyName(currency) : "not set"}`,
    `Week starts on ${weekStart === 0 ? "Sunday" : "Monday"}`,
    `Country: ${country ? countryName(country) : "not set"}`,
  ];

  async function submit() {
    if (busy || !answers.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let saved = true;
      if (made) {
        const r = await saveAnswers(made.id, answersToSend(answers));
        if (isActionError(r)) { setError(r.error); setBusy(false); return; }
      } else {
        const r = await makeWorkspace(answersToSend(answers));
        if (isActionError(r)) { setError(r.error); setBusy(false); return; }
        saved = r.saved;
      }
      // A full load: the server now has the answers, and the app around this page belongs to the new Workspace.
      leave(`${FIRST_STEPS_PATH}?step=${made && made.resume !== "finished" ? made.resume : "start"}${saved ? "" : "&unsaved=1"}`);
    } catch (e) {
      unstable_rethrow(e);
      setError(UNEXPECTED);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <ScreenHeading title="Set up your Workspace">A Workspace is your own space in Ziffr for your numbers and charts. Only people you invite can see it.</ScreenHeading>
      <div className="space-y-1.5">
        <label htmlFor="fs-name" className="block text-sm font-medium">Workspace name</label>
        <Input id="fs-name" name="name" value={answers.name} maxLength={FIRST_STEPS_NAME_FIELD} autoComplete="organization" className="h-11 md:h-9" placeholder={answers.who === "me" ? "For example, My numbers" : "Company or team name"} onChange={(e) => update({ name: e.target.value })} />
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <ul className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">
          {summary.map((line) => <li key={line} className="break-words">{line}</li>)}
        </ul>
        <Button type="button" variant="outline" className="h-11 md:h-9" aria-expanded={change} aria-controls="fs-day" onClick={() => setChange(!change)}>{change ? "Done" : "Change"}</Button>
      </div>
      <div id="fs-day" className={change ? "mt-3 grid gap-3 sm:grid-cols-2" : undefined}>
        {change && (
          <>
            <Select id="fs-zone" label="Time zone" value={timeZone ?? "UTC"} options={timeZones(timeZone).map((z) => [z, z])} onChange={(v) => update({ timeZone: v })} />
            <Select id="fs-currency" label="Currency" value={currency ?? ""} options={[["", "Not set"], ...CURRENCIES.map((c): [string, string] => [c, currencyName(c)])]} onChange={(v) => update({ currency: v || null })} />
            <Select id="fs-week" label="First day of the week" value={String(weekStart ?? 1)} options={[["1", "Monday"], ["0", "Sunday"]]} onChange={(v) => update({ weekStart: v === "0" ? 0 : 1 })} />
            <Select
              id="fs-country" label="Country" value={country ?? ""}
              options={[["", "Not set"], ...COUNTRIES.map((c): [string, string] => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]))]}
              // A new country proposes its currency.
              onChange={(v) => { const proposed = v ? currencyFor(v) : null; update({ country: v || null, ...(proposed ? { currency: proposed } : {}) }); }}
            />
          </>
        )}
      </div>
      {!made && context.trialDays !== null && <p className="mt-4 text-sm">This is a trial. It ends after {context.trialDays} {context.trialDays === 1 ? "day" : "days"} and is then deleted.</p>}
      <p role="alert" className="mt-4 text-sm text-destructive empty:mt-0">{error}</p>
      <Button type="submit" className="mt-4 h-11 w-full md:h-10" disabled={busy || !answers.name.trim()}>
        {made ? (busy ? "Saving…" : "Save") : busy ? "Creating…" : "Create Workspace"}
      </Button>
      {!made && context.importOffered && (
        <p className="mt-4 text-center text-sm">
          {/* A plain link: leaving First Steps loads the page anew, with its own frame. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/welcome/import" className="inline-flex min-h-11 items-center underline underline-offset-4">Coming from another Ziffr? Start from a Workspace Export</a>
        </p>
      )}
    </form>
  );
}
