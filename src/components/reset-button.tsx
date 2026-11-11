"use client";
import { RotateCcw } from "lucide-react";
import { resetDemo } from "@/app/actions";

export function ResetButton() {
  return (
    <form action={resetDemo} onSubmit={(e) => { if (!confirm("Reset all demo data to the starting point?")) e.preventDefault(); }}>
      <button title="Reset demo data" className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground">
        <RotateCcw className="size-3.5" />
      </button>
    </form>
  );
}
