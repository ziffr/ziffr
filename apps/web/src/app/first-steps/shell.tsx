// The frame around every First Steps screen (spec 0067; GLOSSARY: First Steps): the three chapters and the answers so
// far beside the screen, a bar above it on a phone, and the ways back, over and out. It shows only what this person
// answered.
import { ArrowLeft, Check } from "lucide-react";
import { chapterOf, CUSTOMER_LABEL, FIRST_STEPS_CHAPTERS, TOPIC_LABEL, USED_BY_LABEL, type FirstStepsAnswers, type FirstStepsScreen } from "@ziffr/core/first-steps-screens";
import { INDUSTRY_LABEL } from "@ziffr/core/workspace-profile";
import { BUSINESS_FUNCTION_LABELS } from "@ziffr/pack/business-functions";
import { signOut } from "@/app/auth-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TAP = "h-11 md:h-9";

function answered(a: FirstStepsAnswers): [string, string][] {
  const alone = a.who === "me";
  const rows: [string, string | null][] = [
    ["For", a.who && USED_BY_LABEL[a.who]],
    ["Role", !alone && a.role ? BUSINESS_FUNCTION_LABELS[a.role] : null],
    ["Business", !alone && a.industry ? INDUSTRY_LABEL[a.industry] : null],
    ["Customers", !alone && a.segment ? CUSTOMER_LABEL[a.segment] : null],
    ["Topic", alone && a.topic ? TOPIC_LABEL[a.topic] : null],
    ["Workspace", a.name.trim() || null],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

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

type ShellProps = {
  screen: FirstStepsScreen;
  answers: FirstStepsAnswers;
  /** Whether the Workspace exists: then there is somewhere to go instead of signing out. */
  made: boolean;
  /** Null on the first screen. */
  onBack: (() => void) | null;
  onStartOver: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
};

/** The chapters and answers beside a screen, and Back, Start over, and Sign out or Finish later. */
export function Shell({ screen, answers, made, onBack, onStartOver, onSignOut, children }: ShellProps) {
  const chapter = chapterOf(screen);
  const rows = answered(answers);
  const ways = (
    <>
      {screen !== "who" && <Button type="button" variant="ghost" className={TAP} onClick={onStartOver}>Start over</Button>}
      {made ? (
        // A plain link: the app around Home is not drawn here, so it is loaded anew.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/" className={cn(buttonVariants({ variant: "ghost" }), TAP)}>Finish later</a>
      ) : (
        <form action={signOut} onSubmit={onSignOut}><Button type="submit" variant="ghost" className={TAP}>Sign out</Button></form>
      )}
    </>
  );
  return (
    <div className="flex min-h-svh flex-col bg-background md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Brand />
        <ol className="space-y-1 text-sm">
          {FIRST_STEPS_CHAPTERS.map((name, i) => (
            <li key={name} aria-current={i === chapter ? "step" : undefined} className={cn("flex items-center gap-2 rounded-[var(--radius-input)] px-2 py-1.5", i === chapter ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground")}>
              <span aria-hidden className="flex size-4 shrink-0 items-center justify-center tabular-nums">{i < chapter ? <Check className="size-4" /> : i + 1}</span>
              <span>{name}{i < chapter && <span className="sr-only">, done</span>}</span>
            </li>
          ))}
        </ol>
        {rows.length > 0 && (
          <dl aria-label="Your answers" className="space-y-2 px-2 text-sm">
            {rows.map(([term, words]) => (
              <div key={term}>
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
        <p className="text-sm text-muted-foreground">Step {chapter + 1} of {FIRST_STEPS_CHAPTERS.length}: {FIRST_STEPS_CHAPTERS[chapter]}</p>
      </div>
      <main className="mx-auto w-full max-w-xl min-w-0 flex-1 px-4 py-6 md:py-12">
        {onBack && (
          <Button type="button" variant="ghost" className={cn("-ml-3 mb-2", TAP)} onClick={onBack}>
            <ArrowLeft aria-hidden /> Back
          </Button>
        )}
        {children}
      </main>
    </div>
  );
}
