"use client";
// Demo Mode (GLOSSARY: Demo Mode): puts the demo workspace back to its starting point, after asking.
import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { resetDemo } from "@/app/actions";
import { useConfirm } from "./confirm-dialog";

/** The demo's reset button; it asks first, because every visitor shares the demo. */
export function ResetButton() {
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const { confirm, dialog } = useConfirm();
  return (
    <form
      ref={form}
      action={resetDemo}
      onSubmit={async (e) => {
        if (confirmed.current) { confirmed.current = false; return; }
        e.preventDefault();
        if (await confirm({ title: "Reset the demo?", description: "Every change in the demo workspace goes back to the starting point, for everyone looking at it right now.", confirmLabel: "Reset demo data" })) {
          confirmed.current = true;
          form.current?.requestSubmit();
        }
      }}
    >
      {dialog}
      <button title="Reset demo data" aria-label="Reset demo data" className="flex size-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:text-foreground">
        <RotateCcw className="size-3.5" />
      </button>
    </form>
  );
}
