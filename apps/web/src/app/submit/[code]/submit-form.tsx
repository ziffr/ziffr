"use client";
// The personal form link's form (GLOSSARY: Token, Submission Rule): the value or a Breakdown, and the result of the
// last submission. The result is what the server action returned, Ziffr's own words; nothing from the page's URL is
// ever shown (ticket 183), so a link cannot make Ziffr's frame say what its sender wants.
import { useActionState } from "react";
import { submitWebForm, type WebFormResult } from "@/app/actions";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BreakdownField } from "./breakdown-field";

/** The form, posting to the server action; works without JavaScript too. */
export function SubmitForm({ code, label, placeholder, numberStyle }: { code: string; label: string; placeholder: string; numberStyle: NumberStyle }) {
  const [result, action, pending] = useActionState<WebFormResult, FormData>(submitWebForm.bind(null, code), null);
  return (
    <>
      {result && (
        <div role="status" className={`mt-4 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]" : "border-destructive/30 bg-destructive/5"}`}>{result.detail}</div>
      )}
      <form action={action} className="mt-4">
        <label htmlFor="value" className="text-sm font-medium">{label}</label>
        <Input id="value" name="value" inputMode="decimal" placeholder={placeholder} className="mt-1.5 h-10 text-base" autoFocus />
        <BreakdownField numberStyle={numberStyle} />
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending}>Submit</Button>
      </form>
    </>
  );
}
