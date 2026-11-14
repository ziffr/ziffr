"use client";
import { Button } from "@/components/ui/button";

/** Error state for every screen: what broke and what to do. */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="stock mx-auto max-w-md rounded-[var(--radius-card)] p-8 text-center">
      <h1 className="text-[length:var(--text-xl)]">This screen didn’t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong on our side while loading it. Try again in a moment. If it keeps happening, tell whoever runs Ziffr for your team and give them the reference below.
      </p>
      {error.digest && <p className="mt-3 text-xs text-muted-foreground">Reference <code className="fig select-all">{error.digest}</code></p>}
      <Button onClick={reset} className="mt-5">Try again</Button>
    </div>
  );
}
