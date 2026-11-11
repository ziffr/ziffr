"use client";
import { RotateCcw } from "lucide-react";
import { resetDemo } from "@/app/actions";

export function ResetButton() {
  return (
    <form action={resetDemo} onSubmit={(e) => { if (!confirm("Reset all demo data to the starting point?")) e.preventDefault(); }}>
      <button title="Reset demo data" aria-label="Reset demo data" className="flex size-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:text-foreground">
        <RotateCcw className="size-3.5" />
      </button>
    </form>
  );
}
