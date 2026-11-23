"use client";
// "More options" of the new-Metric form (GLOSSARY: Metric Description): a native disclosure that keeps Stands,
// Decimals, the Submission Rule, Aggregation, Sources and Attainment out of the way. Its controls stay in the form
// while it is closed, so what is submitted does not depend on whether it was opened. It opens by itself when a copied
// or catalog Metric differs from the defaults, and the closed summary names every value that differs, live.
import { useEffect, useRef, useState } from "react";
import { nonDefaultOptions, type MoreOptionValues } from "./more-options-defaults";

const num = (v: FormDataEntryValue | null) => Number(v ?? 0);

/** Reads the six option fields from the form that holds `el`. */
function readValues(form: HTMLFormElement): MoreOptionValues {
  const f = new FormData(form);
  return {
    unit: String(f.get("unit") ?? ""),
    unit_position: String(f.get("unit_position") ?? "after"),
    decimals: Math.round(num(f.get("decimals"))) || 0,
    submission_rule: String(f.get("submission_rule") ?? ""),
    aggregation: String(f.get("aggregation") ?? ""),
    sources: f.getAll("sources").map(String),
    attainment_method: String(f.get("attainment_method") ?? ""),
  };
}

/** The disclosure. `initial` is the description the form starts from; children are the option fields. */
export function MoreOptions({ initial, sourceLabels, attainmentLabels, children }: {
  initial: MoreOptionValues;
  sourceLabels: Record<string, string>;
  attainmentLabels: Record<string, string>;
  children: React.ReactNode;
}) {
  const label = (v: MoreOptionValues) => nonDefaultOptions(v, sourceLabels, attainmentLabels[v.attainment_method] ?? "");
  const [changes, setChanges] = useState(() => label(initial));
  const ref = useRef<HTMLDetailsElement>(null);
  // Open at the start only when something differs; after that the person decides.
  const [startOpen] = useState(() => changes.length > 0);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => setChanges(label(readValues(form)));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    // A browser cannot focus a control inside a closed disclosure to report it invalid, so open it first.
    const reveal = () => { if (ref.current) ref.current.open = true; };
    ref.current?.addEventListener("invalid", reveal, true);
    const el = ref.current;
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); el?.removeEventListener("invalid", reveal, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <details ref={ref} open={startOpen} className="stock group rounded-[var(--radius-card)] p-5">
      <summary className="cursor-pointer font-medium marker:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        More options
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {changes.length ? changes.join(" · ") : "Stands, decimals, second value, aggregation, sources, attainment: as usual"}
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
