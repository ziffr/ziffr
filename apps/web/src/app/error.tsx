"use client";
import { Button } from "@/components/ui/button";

/** Error state for every screen: what broke and what to do. */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="stock mx-auto max-w-md rounded-[var(--radius-card)] p-8 text-center">
      <h1 className="text-[length:var(--text-xl)]">This screen didn’t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ziffr couldn’t reach its data. If the local database isn’t running, start it with <code className="fig">pnpm prototype</code>, then try again.
      </p>
      {error.digest && <p className="fig mt-2 text-xs text-muted-foreground">Reference {error.digest}</p>}
      <Button onClick={reset} className="mt-5">Try again</Button>
    </div>
  );
}
