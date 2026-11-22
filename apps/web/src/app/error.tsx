"use client";
import { DEMO_READ_ONLY_TRIAL, demoWordsForDigest } from "@ziffr/core/demo-words";
import { DemoRefusalWords } from "@/components/demo-refusal";
import { Button } from "@/components/ui/button";

/** Error state for every screen: what broke and what to do. */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A change refused in the demo, from a plain form with no screen code of its own to say why (#271): the digest is a
  // fixed code, and the words are the browser's own.
  const demo = demoWordsForDigest(error.digest);
  if (demo) {
    return (
      <div role="alert" className="stock mx-auto max-w-md rounded-[var(--radius-card)] p-8 text-center">
        <h1 className="text-[length:var(--text-xl)]">Nothing was saved</h1>
        <p className="mt-2 text-sm text-muted-foreground">{demo === DEMO_READ_ONLY_TRIAL ? <DemoRefusalWords /> : demo}</p>
        <Button onClick={reset} className="mt-5">Back</Button>
      </div>
    );
  }
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
