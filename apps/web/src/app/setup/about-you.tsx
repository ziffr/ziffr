"use client";
// About you, the Setup Guide's first step (spec 0052; GLOSSARY: Setup Guide, Workspace Profile, Business Function). One
// question to a row, each optional and each saying what it is for. Owners and Admins answer for the Workspace (its
// Workspace Profile, its time zone and year start); a Member sees those read-only and answers only their own Business
// Function. Every value is checked again by the core against its list.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PrivacyStatement } from "@/components/privacy-statement";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { saveAboutYou, skipStep, type AboutYouInput } from "./actions";
import { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS, type BusinessFunction } from "@ziffr/pack/business-functions";
import {
  currencyFor, EMPLOYEE_BANDS, INDUSTRIES, INDUSTRY_LABEL, REVENUE_BANDS, REVENUE_LABEL, SEGMENTS, SEGMENT_LABEL,
  type WorkspaceProfile,
} from "@ziffr/core/workspace-profile";
import { monthName, type YearStart } from "@ziffr/core/periods";

// 44 px tall and 16 px text on a phone (a smaller text makes iPhone Safari zoom in on focus); the compact size from the small breakpoint.
const field = "block h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base disabled:opacity-70 sm:h-9 sm:text-sm";
const SKIP = "Skip this question";

/** A country or currency with the name it is shown by. */
export type Named = { code: string; name: string };

/** One question: the label and what it is for on the left, the answer on the right. */
function Row({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-2 border-b border-border py-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-6">
      <div>
        <label htmlFor={id} className="block text-sm font-medium">{label}</label>
        {hint && <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function FunctionRow({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <Row id="about-function" label="What do you do here?" hint="So we can suggest Packs and who is asked for what. Only you and this Workspace's Owners and Admins see it.">
      <select id="about-function" aria-describedby="about-function-hint" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="">{SKIP}</option>
        {BUSINESS_FUNCTIONS.map((k) => <option key={k} value={k}>{BUSINESS_FUNCTION_LABELS[k]}</option>)}
      </select>
    </Row>
  );
}

/** The privacy statement, the error line and the two buttons every About you ends with. */
function Footer({ pending, error, onSkip }: { pending: boolean; error: string | null; onSkip: () => void }) {
  return (
    <div className="space-y-3 pt-5">
      <PrivacyStatement />
      <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
      {/* On a phone the two buttons fill the width, the main one first; from the small breakpoint they sit at the right. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="ghost" className="h-11 sm:h-9" disabled={pending} onClick={onSkip}>Skip</Button>
        <Button type="submit" className="h-11 sm:h-9" disabled={pending}>Save and go on</Button>
      </div>
    </div>
  );
}

function useStep(following: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () => router.push(`/setup?step=${following}`);
  // Runs one action: its words on a refusal, the next step on success.
  const run = (work: () => Promise<unknown>, done?: string) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      if (done) toast.success(done);
      go();
    } catch { setError(UNEXPECTED); }
  });
  return { pending, error, run };
}

/** Owners and Admins: the Workspace's answers, the Workspace's day, and their own function. */
export function AboutYouWorkspace({ profile, countries, timeZone, runHour, weekStart, yearStart, allowedMonths, whyMonths, businessFunction, following }: {
  profile: WorkspaceProfile; countries: Named[]; timeZone: string; runHour: number; weekStart: 0 | 1; yearStart: YearStart; allowedMonths: YearStart[]; whyMonths: string | null;
  businessFunction: BusinessFunction | null; following: string;
}) {
  const { pending, error, run } = useStep(following);
  const [p, setP] = useState(profile);
  const [fn, setFn] = useState<string>(businessFunction ?? "");
  const [zone, setZone] = useState(timeZone);
  const [hour, setHour] = useState(runHour);
  const [month, setMonth] = useState<YearStart>(yearStart);
  const [first, setFirst] = useState<0 | 1>(weekStart);
  const [weekProposed, setWeekProposed] = useState(false);
  const [zones, setZones] = useState<string[]>(["UTC"]);
  const [proposed, setProposed] = useState<string | null>(null);

  // The zones this browser knows, and, while the Workspace still has the default UTC, this browser's own as the proposal
  // (the Setup Guide asks the Owner to confirm the day; the core checks the zone against its list again).
  useEffect(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    setZones(["UTC", ...all.filter((z) => z !== "UTC")]);
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === "UTC" && mine && mine !== "UTC" && all.includes(mine)) { setZone(mine); setProposed(mine); }
  }, [timeZone]);
  // While the Workspace still has the default Monday, this browser's locale may propose Sunday (the core checks the value again).
  useEffect(() => {
    if (weekStart !== 1) return;
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const day = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    if (day === 7) { setFirst(0); setWeekProposed(true); }
  }, [weekStart]);

  const set = (k: keyof WorkspaceProfile, v: string) => setP((old) => {
    const next = { ...old, [k]: v || null } as WorkspaceProfile;
    // A new country proposes its own currency while none was picked, or the old one was the old country's.
    if (k === "country") {
      if (!v) { if (old.currency === (old.country && currencyFor(old.country))) next.currency = null; }
      else if (!old.currency || old.currency === (old.country && currencyFor(old.country))) next.currency = currencyFor(v);
    }
    return next;
  });
  const pick = (k: keyof WorkspaceProfile, id: string, options: { v: string; label: string }[]) => (
    <select id={id} aria-describedby={["about-country", "about-revenue"].includes(id) ? `${id}-hint` : undefined} value={p[k] ?? ""} disabled={pending} onChange={(e) => set(k, e.target.value)} className={field}>
      <option value="">{SKIP}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const save = () => {
    const input: AboutYouInput = { profile: p, clock: { timeZone: zone, runHour: hour, weekStart: first }, businessFunction: fn || null };
    if (month !== yearStart) input.yearStart = month;
    run(() => saveAboutYou(input), "Saved");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="About you and your business">
      <ol className="border-t border-border">
        <Row id="about-industry" label="What does your business do?" hint="">
          {pick("industry", "about-industry", INDUSTRIES.map((v) => ({ v, label: INDUSTRY_LABEL[v] })))}
        </Row>
        <Row id="about-segment" label="Who do you sell to?" hint="">
          {pick("segment", "about-segment", SEGMENTS.map((v) => ({ v, label: SEGMENT_LABEL[v] })))}
        </Row>
        <Row id="about-country" label="Where is it based?" hint="So numbers and money are written the way you write them.">
          {pick("country", "about-country", countries.map(({ code, name }) => ({ v: code, label: name })))}
          <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
            {p.currency ? `Currency: ${p.currency}. ` : ""}The country proposes the currency, number style and answer languages until someone sets them on Workspace → General.
          </p>
        </Row>
        <Row id="about-people" label="How many people work there?" hint="">
          {pick("employeeBand", "about-people", EMPLOYEE_BANDS.map((v) => ({ v, label: v === "1000+" ? "More than 1,000" : v.replace("-", " to ") })))}
        </Row>
        <Row id="about-revenue" label="Revenue in a year" hint="In the currency above, roughly.">
          {pick("revenueBand", "about-revenue", REVENUE_BANDS.map((v) => ({ v, label: `${REVENUE_LABEL[v]}${p.currency ? ` ${p.currency}` : ""}` })))}
        </Row>
        <FunctionRow value={fn} onChange={setFn} disabled={pending} />
        <Row id="about-zone" label="Your Workspace's time zone" hint="So Ziffr knows which day it is for your team and when each day's requests go out.">
          <select id="about-zone" aria-describedby="about-zone-hint" value={zone} disabled={pending} onChange={(e) => { setZone(e.target.value); setProposed(null); }} className={field}>
            {(zones.includes(zone) ? zones : [zone, ...zones]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          {proposed && <p className="mt-1.5 text-xs text-muted-foreground">Proposed from this browser. Choose another if your team works elsewhere.</p>}
        </Row>
        <Row id="about-hour" label="Ziffr asks for numbers at" hint="The hour of the morning your Workflows ask, remind and escalate.">
          <select id="about-hour" aria-describedby="about-hour-hint" value={hour} disabled={pending} onChange={(e) => setHour(Number(e.target.value))} className={field}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
        </Row>
        <Row id="about-week" label="The week starts on" hint="The first day of the week in the Schedule.">
          <select id="about-week" aria-describedby="about-week-hint" value={first} disabled={pending} onChange={(e) => { setFirst(Number(e.target.value) === 0 ? 0 : 1); setWeekProposed(false); }} className={field}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
          {weekProposed && <p className="mt-1.5 text-xs text-muted-foreground">Proposed from this browser. Choose Monday if your team works that way.</p>}
        </Row>
        <Row id="about-year" label="Your year starts in" hint="Where quarters, half-years and years begin. January is the calendar year.">
          <select id="about-year" aria-describedby="about-year-hint" value={month} disabled={pending} onChange={(e) => setMonth(Number(e.target.value) as YearStart)} className={field}>
            {Array.from({ length: 12 }, (_, i) => (i + 1) as YearStart).map((m) => <option key={m} value={m} disabled={!allowedMonths.includes(m)}>{monthName(m)}</option>)}
          </select>
          {whyMonths && <p className="mt-1.5 text-xs text-muted-foreground">{whyMonths}</p>}
        </Row>
      </ol>
      <Footer pending={pending} error={error} onSkip={() => run(() => skipStep("about"))} />
    </form>
  );
}

/** A Member: the Workspace's answers as they stand, and their own function to answer. */
export function AboutYouMember({ answers, businessFunction, following }: { answers: { label: string; value: string }[]; businessFunction: BusinessFunction | null; following: string }) {
  const { pending, error, run } = useStep(following);
  const [fn, setFn] = useState<string>(businessFunction ?? "");
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => saveAboutYou({ businessFunction: fn || null }), "Saved"); }} aria-label="About you">
      <section aria-labelledby="about-business" className="mb-6 space-y-2">
        <h3 id="about-business" className="text-sm font-medium">About this business</h3>
        {answers.length ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
            {answers.map((a) => <div key={a.label} className="contents"><dt className="text-muted-foreground">{a.label}</dt><dd>{a.value}</dd></div>)}
          </dl>
        ) : <p className="text-sm text-muted-foreground">The Owners and Admins have not said yet what kind of business this is.</p>}
        <p className="text-xs text-muted-foreground">Owners and Admins set these; they describe the whole team.</p>
      </section>
      <ol className="border-t border-border">
        <FunctionRow value={fn} onChange={setFn} disabled={pending} />
      </ol>
      <Footer pending={pending} error={error} onSkip={() => run(() => skipStep("about"))} />
    </form>
  );
}
