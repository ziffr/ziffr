import { notFound } from "next/navigation";
import Link from "next/link";
import { submissionForm } from "@ziffr/core/page-data";
import { formTelegramLink } from "@ziffr/core/telegram-people";
import { formatValue, RULE_LABEL } from "@ziffr/core/format";
import { submitWebForm } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BreakdownField } from "./breakdown-field";
import { TelegramConnect } from "./telegram-connect";
import { JANUARY, periodLabel } from "@ziffr/core/periods";

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ outcome?: string; detail?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  // The code is the credential; a stand-in's form works only while they are the stand-in (GLOSSARY: Stand-in).
  const form = await submissionForm(code);
  if (!form) notFound();
  // Telegram is offered only where the workspace turned it on (spec 0016).
  const telegram = await formTelegramLink(code);
  const { metric: m, person, period, current } = form;
  const ok = sp.outcome && !sp.outcome.startsWith("rejected");
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="text-xs text-muted-foreground">Hi {person.name.split(" ")[0]}, please report</div>
        <h1 className="mt-1 text-xl font-semibold">{m.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
        <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          For <span className="font-medium">{periodLabel(period, m.period, JANUARY)}</span>
          {current !== null && <>, already has <span className="font-medium">{formatValue(m, current)}</span> ({RULE_LABEL[m.submission_rule].toLowerCase()})</>}
        </div>
        {sp.detail && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${ok ? "border-[var(--color-rule-2)] bg-[var(--color-paper-2)]" : "border-destructive/30 bg-destructive/5"}`}>{sp.detail}</div>
        )}
        <form action={submitWebForm.bind(null, code)} className="mt-4">
          <label htmlFor="value" className="text-sm font-medium">Total</label>
          <Input id="value" name="value" inputMode="decimal" placeholder={m.unit || (m.format === "currency" ? "€" : m.format === "percent" ? "%" : "Value")} className="mt-1.5 h-10 text-base" autoFocus />
          <BreakdownField />
          <Button type="submit" size="lg" className="mt-4 w-full">Submit</Button>
        </form>
      </div>
      {telegram?.telegramOn && <TelegramConnect code={code} linked={telegram.linked} />}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        This link is {person.name.split(" ")[0]}’s Token for {m.name}. <Link href={`/metrics/${m.slug}`} className="underline">Open metric</Link>
      </p>
    </div>
  );
}
