"use client";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { parseBreakdown } from "@ziffr/core/parse";
import type { NumberStyle } from "@ziffr/core/number-style";

/** Paste rows from Excel or Sheets, or load a CSV; shows what Ziffr read before you submit, read in the Workspace's
 * Number Style by the same rules the core applies. */
export function BreakdownField({ numberStyle }: { numberStyle: NumberStyle }) {
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseBreakdown(text, numberStyle) : null;
  return (
    <div className="mt-5">
      <label htmlFor="breakdown" className="text-sm font-medium">Breakdown <span className="font-normal text-muted-foreground">(optional)</span></label>
      <p className="mt-0.5 text-xs text-muted-foreground">Paste two columns from Excel or Sheets, one row per line, such as country and revenue. Leave the total empty and it becomes the sum of the rows at the top. A third column with the name of another row makes that row a part of it (up to 4 levels).</p>
      <textarea
        id="breakdown"
        name="breakdown"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Germany\t61200\nAustria\t16800"}
        className="fig mt-2 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 py-2 text-sm"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-input)] px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-within:outline-2 focus-within:outline-ring">
          <FileUp aria-hidden className="size-3.5" /> Load a CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f && f.size < 200_000) setText(await f.text());
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-muted-foreground" aria-live="polite">
          {!text.trim() ? "" : parsed ? `${parsed.rows.length} rows read${parsed.total !== null ? ", plus a total" : ""}` : "Needs at least two rows of a label and a number"}
        </span>
      </div>
    </div>
  );
}
