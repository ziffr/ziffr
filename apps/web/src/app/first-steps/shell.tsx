// The frame around every First Steps screen (spec 0067; GLOSSARY: First Steps): the three chapters and the answers so
// far beside the screen, a bar above it on a phone, and the ways back, over and out. It shows only what this person
// answered.
import { chapterOf, CUSTOMER_LABEL, FIRST_STEPS_CHAPTERS, TOPIC_LABEL, USED_BY_LABEL, type FirstStepsAnswers, type FirstStepsScreen } from "@ziffr/core/first-steps-screens";
import { INDUSTRY_LABEL } from "@ziffr/core/workspace-profile";
import { BUSINESS_FUNCTION_LABELS } from "@ziffr/pack/business-functions";
import { signOut } from "@/app/auth-actions";
import { FRAME_TAP as TAP, GuidedFrame } from "@/components/guided-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <GuidedFrame steps={[...FIRST_STEPS_CHAPTERS]} current={chapterOf(screen)} answers={answered(answers)} ways={ways} onBack={onBack} wide={screen === "set"}>
      {children}
    </GuidedFrame>
  );
}
