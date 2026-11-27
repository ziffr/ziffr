"use client";
// The field a Value Note is typed in (GLOSSARY: Value Note; spec 0064), the same wherever one is written, so it always
// says who will read the words. It only collects them: the core checks them, and who may write, on every save.
import { useId, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

/** A labelled text field for a Value Note, with who reads it underneath. Takes the textarea's own props (value or
 * name, onChange, autoFocus, required); `label` replaces "Note". */
export function ValueNoteField({ label = "Note", id, ...props }: ComponentProps<"textarea"> & { label?: string }) {
  const own = useId();
  const field = id ?? own;
  return (
    <div className="text-sm">
      <label htmlFor={field} className="mb-1 block font-medium">{label}</label>
      {/* 1,000 characters is the most a note has (spec 0064); the core holds the same limit. */}
      <Textarea id={field} aria-describedby={`${field}-readers`} rows={3} maxLength={1000} {...props} />
      <p id={`${field}-readers`} className="mt-1 text-xs text-muted-foreground">Everyone who sees this Metric can read it.</p>
    </div>
  );
}
