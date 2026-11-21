"use client";
// A Metric's name field (GLOSSARY: Metric) that warns, once you leave it, when a Metric you can see already has the
// name. Only a warning: two Metrics may share a name. The check is the core's (sameNamedMetrics).
import Link from "next/link";
import { useState } from "react";
import { isActionError } from "@/lib/action-error";
import { sameNamedMetrics } from "@/app/series-actions";
import { Input } from "@/components/ui/input";

type Same = { slug: string; name: string; owner: string; mine: boolean };

/** The name input, with its warning under it; `exceptMetricId` is the Metric being renamed. */
export function NameField({ id, defaultValue, exceptMetricId, placeholder }: { id?: string; defaultValue: string; exceptMetricId?: number; placeholder?: string }) {
  const [same, setSame] = useState<Same[]>([]);
  const check = async (name: string) => {
    try {
      const r = await sameNamedMetrics(name, exceptMetricId);
      setSame(isActionError(r) ? [] : r);
    } catch {
      setSame([]); // The warning is a courtesy; saving does not depend on it.
    }
  };
  return (
    <>
      <Input id={id} name="name" required maxLength={120} defaultValue={defaultValue} placeholder={placeholder} onBlur={(e) => void check(e.target.value)} onChange={() => same.length && setSame([])} aria-describedby={same.length ? `${id ?? "name"}-same` : undefined} />
      {same.length > 0 && (
        <p id={`${id ?? "name"}-same`} role="status" className="mt-1 text-xs text-[var(--color-accent-2)]">
          There is already a Metric called {same[0].name}, owned by {same[0].mine ? "you" : same[0].owner}
          {same.length > 1 ? ` (and ${same.length - 1} more)` : ""}:{" "}
          <Link href={`/metrics/${same[0].slug}`} className="underline" target="_blank">open it</Link>, or use another name.
        </p>
      )}
    </>
  );
}
