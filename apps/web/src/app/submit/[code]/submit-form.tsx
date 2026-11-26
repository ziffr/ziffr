"use client";
// The personal form link's form (GLOSSARY: Token, Submission Rule): the value or a Breakdown, and the result of the
// last submission. The result is what the server action returned, Ziffr's own words; nothing from the page's URL is
// ever shown (ticket 183), so a link cannot make Ziffr's frame say what its sender wants. On a phone (spec 0055) it is
// one field and one button, the Breakdown behind a button, and after saving the next value that is due.
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitWebForm, type WebFormResult } from "@/app/actions";
import { recordValue } from "@/app/series-actions";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BreakdownField } from "./breakdown-field";

type Props = {
  code: string;
  label: string;
  placeholder: string;
  numberStyle: NumberStyle;
  /** An earlier period the signed-in person records instead of the current one; the core checks it again. */
  named?: { metricId: number; period: string } | null;
  /** The next value of the signed-in person's own that is due. */
  next?: { href: string; name: string; periodLabel: string } | null;
  /** True when the person is known and nothing else of theirs is due. */
  nothingDue?: boolean;
};

/** Sends the form through the operation that fits: the form link's own, or, for a named earlier period, the signed-in
 * person's Record a value. Both end in the same intake with the same rules. */
export function sendForm(code: string, named: Props["named"]) {
  if (!named) return submitWebForm.bind(null, code);
  return async (_previous: WebFormResult, form: FormData): Promise<WebFormResult> => {
    const r = await recordValue(named.metricId, { value: String(form.get("value") ?? ""), breakdown: String(form.get("breakdown") ?? ""), period: named.period });
    return "error" in r ? { ok: false, detail: r.error } : r;
  };
}

/** The form, posting to the server action; for the current period it works without JavaScript too. */
export function SubmitForm({ code, label, placeholder, numberStyle, named = null, next = null, nothingDue = false }: Props) {
  const [result, action, pending] = useActionState<WebFormResult, FormData>(sendForm(code, named), null);
  // Controlled, so a refusal does not empty the field (React resets uncontrolled fields after an action); the
  // value is cleared only when it was recorded.
  const [value, setValue] = useState("");
  const [breakdown, setBreakdown] = useState(false);
  const [again, setAgain] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const after = useRef<HTMLDivElement>(null);
  const refused = result && !result.ok ? result.detail : null;
  // On a phone a recorded value ends the flow: the form gives way to what comes next.
  const done = Boolean(result?.ok) && !again;
  useEffect(() => {
    setAgain(false);
    if (result?.ok) setValue("");
    // Focus goes back to the wrong field after a refusal; the value field is the first and the only required one.
    else if (result) input.current?.focus();
  }, [result]);
  // On a phone the pressed button goes away with the form, so focus moves to what replaces it (hidden, so ignored, on a desktop).
  useEffect(() => { if (done) after.current?.focus(); }, [done]);
  useEffect(() => { if (again) input.current?.focus(); }, [again]);
  return (
    <>
      {result?.ok && (
        <div role="status" className="mt-4 rounded-lg border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] px-3 py-2 text-sm">{result.detail}</div>
      )}
      {done && (
        <div ref={after} tabIndex={-1} className="mt-3 flex flex-col gap-2 outline-none sm:hidden">
          {next ? (
            <Link href={next.href} prefetch={false} className={cn(buttonVariants({ size: "lg" }), "h-auto min-h-12 w-full flex-col gap-0 py-2 text-center whitespace-normal")}>
              <span className="text-base">Next: {next.name}</span>
              <span className="text-xs font-normal">Due for {next.periodLabel}</span>
            </Link>
          ) : nothingDue && <p className="text-sm text-muted-foreground">No other value of yours is due now.</p>}
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setAgain(true)}>Send another value</Button>
        </div>
      )}
      <form action={action} className={cn("mt-4", done && "max-sm:hidden")}>
        <label htmlFor="value" className="text-sm font-medium">{label}</label>
        <Input
          ref={input}
          id="value"
          name="value"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? "value-error" : undefined}
          // Important: on a touch screen every field is otherwise set to 16px (globals.css).
          className="mt-1.5 h-10 text-base max-sm:h-14 max-sm:text-2xl!"
          autoFocus
        />
        {refused && <p id="value-error" role="alert" className="mt-1.5 text-sm text-destructive">{refused}</p>}
        <Button type="button" variant="ghost" className="mt-1 -ml-2 px-2 underline underline-offset-4 sm:hidden" aria-expanded={breakdown} aria-controls="breakdown-part" onClick={() => setBreakdown(!breakdown)}>
          {breakdown ? "Hide the breakdown" : "Add a breakdown (optional)"}
        </Button>
        {/* Hidden, not removed, on a phone: what was typed stays and is sent. */}
        <div id="breakdown-part" className={breakdown ? undefined : "max-sm:hidden"}>
          <BreakdownField numberStyle={numberStyle} />
        </div>
        <Button type="submit" size="lg" className="mt-4 w-full max-sm:h-12 max-sm:text-base" disabled={pending}>Submit</Button>
      </form>
    </>
  );
}
