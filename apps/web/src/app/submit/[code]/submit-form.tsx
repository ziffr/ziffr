"use client";
// The personal form link's form (GLOSSARY: Token, Submission Rule): the value or a Breakdown, and the result of the
// last submission. The result is what the server action returned, Ziffr's own words; nothing from the page's URL is
// ever shown (ticket 183), so a link cannot make Ziffr's frame say what its sender wants.
import { useActionState, useEffect, useRef, useState } from "react";
import { submitWebForm, type WebFormResult } from "@/app/actions";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BreakdownField } from "./breakdown-field";

/** The form, posting to the server action; works without JavaScript too. */
export function SubmitForm({ code, label, placeholder, numberStyle }: { code: string; label: string; placeholder: string; numberStyle: NumberStyle }) {
  const [result, action, pending] = useActionState<WebFormResult, FormData>(submitWebForm.bind(null, code), null);
  // Controlled, so a refusal does not empty the field (React resets uncontrolled fields after an action); the
  // value is cleared only when it was recorded.
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refused = result && !result.ok ? result.detail : null;
  useEffect(() => {
    if (result?.ok) setValue("");
    // Focus goes back to the wrong field after a refusal; the value field is the first and the only required one.
    else if (result) input.current?.focus();
  }, [result]);
  return (
    <>
      {result?.ok && (
        <div role="status" className="mt-4 rounded-lg border border-[var(--color-rule-2)] bg-[var(--color-paper-2)] px-3 py-2 text-sm">{result.detail}</div>
      )}
      <form action={action} className="mt-4">
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
          className="mt-1.5 h-10 text-base"
          autoFocus
        />
        {refused && <p id="value-error" role="alert" className="mt-1.5 text-sm text-destructive">{refused}</p>}
        <BreakdownField numberStyle={numberStyle} />
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending}>Submit</Button>
      </form>
    </>
  );
}
