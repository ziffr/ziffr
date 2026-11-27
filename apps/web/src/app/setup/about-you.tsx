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
