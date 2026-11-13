import { notFound } from "next/navigation";
import { tokenValid } from "@ziffr/core/tokens";
import Link from "next/link";
import { db } from "@/lib/db";
import { normalizeMetric } from "@/lib/data";
import { formatValue, periodLabel, periodStart, RULE_LABEL } from "@ziffr/core/format";
import { submitWebForm } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BreakdownField } from "./breakdown-field";
import type { Metric } from "@ziffr/core/types";

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ outcome?: string; detail?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const { data: token } = await db.from("tokens").select("*, metrics(*), profiles!tokens_submitter_id_fkey(*)").eq("code", code).single();
  if (!token) notFound();
  // A stand-in's form works only while they are the stand-in (GLOSSARY: Stand-in).
  if (token.stands_in_for) {
    const { data: theirs } = await db.from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("metric_id", token.metric_id);
    if (!tokenValid(token, theirs ?? [])) notFound();
  }
  const m = normalizeMetric(token.metrics) as Metric;
  const period = periodStart(new Date(), m.period);
  const { data: existing } = await db.from("observations").select("value").eq("metric_id", m.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  const ok = sp.outcome && !sp.outcome.startsWith("rejected");
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="text-xs text-muted-foreground">Hi {token.profiles.name.split(" ")[0]}, please report</div>
        <h1 className="mt-1 text-xl font-semibold">{m.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
        <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          For <span className="font-medium">{periodLabel(period, m.period)}</span>
          {existing?.[0] && <>, already has <span className="font-medium">{formatValue(m, Number(existing[0].value))}</span> ({RULE_LABEL[m.submission_rule].toLowerCase()})</>}
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
      <p className="mt-4 text-center text-xs text-muted-foreground">
        This link is {token.profiles.name.split(" ")[0]}’s Token for {m.name}. <Link href={`/metrics/${m.slug}`} className="underline">Open metric</Link>
      </p>
    </div>
  );
}
