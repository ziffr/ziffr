"use client";
// The Feedback Prompt card (ticket #722; GLOSSARY: Feedback Prompt): a small card in the corner that asks whether the
// person likes Ziffr. A yes opens the Ziffr repository on GitHub in a new tab, where they star it themselves; a no asks
// what is missing. Shown at most once per session; the server decides whether it may appear at all.
import { useEffect, useState, useTransition } from "react";
import { feedbackPromptShown, sayWhatIsMissing, stopFeedbackPrompt } from "@/app/feedback-prompt-actions";
import { Button, buttonVariants } from "@/components/ui/button";

const REPO = "https://github.com/ziffr/ziffr";
const SESSION_KEY = "ziffr-feedback-prompt";

type Step = "ask" | "yes" | "no" | "thanks" | "gone";

/** The card: asks, then thanks. `askForStar` is false for someone who said earlier that something is missing. */
export function FeedbackPrompt({ askForStar }: { askForStar: boolean }) {
  const [step, setStep] = useState<Step>("gone");
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    // Once per browser session, even when the page is opened again; storage may be blocked, then it shows once per page.
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* shown without the guard */ }
    setStep("ask");
    void feedbackPromptShown();
  }, []);

  if (step === "gone") return null;
  const close = () => setStep("gone");
  return (
    <aside role="complementary" aria-label="Feedback" className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[var(--color-rule-2)] bg-background p-4 text-sm shadow-lg">
      {step === "ask" && (
        <>
          <p className="font-medium">Enjoying Ziffr?</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setStep(askForStar ? "yes" : "thanks")} aria-label="Yes, I like it">👍 Yes</Button>
            <Button variant="outline" onClick={() => setStep("no")} aria-label="No, something is missing">👎 Not yet</Button>
            <Button variant="ghost" onClick={close}>Not now</Button>
          </div>
          <button type="button" className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => { void stopFeedbackPrompt("never"); close(); }}>Don&apos;t ask again</button>
        </>
      )}
      {step === "yes" && (
        <>
          <p className="font-medium">Glad to hear it.</p>
          <p className="mt-1 text-muted-foreground">A star on GitHub helps others find Ziffr. It opens GitHub, where you star it yourself; Ziffr tells GitHub nothing.</p>
          <div className="mt-3 flex items-center gap-2">
            <a href={REPO} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })} onClick={() => { void stopFeedbackPrompt("starred"); setStep("thanks"); }}>Star on GitHub</a>
            <Button variant="ghost" onClick={close}>Not now</Button>
          </div>
        </>
      )}
      {step === "no" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sayWhatIsMissing(words);
              if (r && "error" in r) { setError(r.error); return; }
              setStep("thanks");
            });
          }}
        >
          <label className="block font-medium" htmlFor="feedback-words">What is missing?</label>
          <textarea id="feedback-words" value={words} onChange={(e) => setWords(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-[var(--radius-input)] border border-input bg-background p-2" />
          <p className="mt-1 text-xs text-muted-foreground">Goes to the people who run this Ziffr, without your name.</p>
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" variant="outline" disabled={pending || !words.trim()}>Send</Button>
            <Button type="button" variant="ghost" onClick={close}>Not now</Button>
          </div>
        </form>
      )}
      {step === "thanks" && (
        <>
          <p className="font-medium">Thank you.</p>
          <Button variant="ghost" className="mt-2" onClick={close}>Close</Button>
        </>
      )}
    </aside>
  );
}
