// The frame around a flow that asks one question per screen (specs 0067 and 0068; GLOSSARY: First Steps, Pack): the
// steps and the answers so far beside the screen, a bar above it on a phone, and Back above the question. It draws
// words it is given and nothing else.
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A button of the frame: 44 px on a phone. */
export const FRAME_TAP = "h-11 md:h-9";

function Brand() {
  return (
    <span className="flex items-center gap-2">
      {/* The same mark as the sign-in pages; decorative, the word beside it names it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ziffr-logo.svg" width={28} height={28} alt="" className="size-7" />
      <span className="text-lg font-semibold tracking-[-0.03em]">Ziffr</span>
    </span>
  );
}

type FrameProps = {
  /** The names of the steps, in order. */
  steps: string[];
  /** The step on screen, from 0; -1 before the first, the number of steps after the last. */
  current: number;
  /** What was answered so far, as a word and its answer. */
  answers: [string, string][];
  /** The ways over and out, such as "Start over"; shown at the foot beside the screen and above it on a phone. */
  ways: React.ReactNode;
  /** Null where there is no way back. */
  onBack: (() => void) | null;
  /** For a screen that shows a drawing: more room across. */
  wide?: boolean;
  /** Words above every screen, such as that this is a try. A frame with one stands over a page of its own, so it adds
   * no main landmark. */
  notice?: React.ReactNode;
  children: React.ReactNode;
};

/** The steps and answers beside a screen, and Back and the ways out. */
export function GuidedFrame({ steps, current, answers, ways, onBack, wide, notice, children }: FrameProps) {
  const within = current >= 0 && current < steps.length;
  const Body = notice ? "div" : "main";
  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      {/* It stays in view beside a long screen, so the ways out are always at its foot. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Brand />
        <ol className="space-y-1 text-sm">
          {steps.map((name, i) => (
            <li key={i} aria-current={i === current ? "step" : undefined} className={cn("flex items-center gap-2 rounded-[var(--radius-input)] px-2 py-1.5", i === current ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground")}>
              <span aria-hidden className="flex size-4 shrink-0 items-center justify-center tabular-nums">{i < current ? <Check className="size-4" /> : i + 1}</span>
              <span className="min-w-0 break-words">{name}{i < current && <span className="sr-only">, done</span>}</span>
            </li>
          ))}
        </ol>
        {answers.length > 0 && (
          <dl aria-label="Your answers" className="space-y-2 px-2 text-sm">
            {answers.map(([term, words], i) => (
              <div key={i}>
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="break-words">{words}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto flex flex-col items-start gap-1">{ways}</div>
      </aside>
      <div className="border-b border-border px-4 py-2 md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <Brand />
          <div className="-mr-2 flex items-center">{ways}</div>
        </div>
        {within && <p className="text-sm text-muted-foreground">Step {current + 1} of {steps.length}: {steps[current]}</p>}
      </div>
      <Body className={cn("mx-auto w-full min-w-0 flex-1 px-4 py-6 md:py-12", wide ? "max-w-3xl" : "max-w-xl")}>
        {notice && <p className="mb-4 rounded-[var(--radius-input)] border border-input bg-muted p-2.5 text-sm break-words">{notice}</p>}
        {onBack && (
          <Button type="button" variant="ghost" className={cn("-ml-3 mb-2", FRAME_TAP)} onClick={onBack}>
            <ArrowLeft aria-hidden /> Back
          </Button>
        )}
        {children}
      </Body>
    </div>
  );
}
