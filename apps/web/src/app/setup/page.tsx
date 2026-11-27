// The Setup Guide's page (spec 0052, spec 0067; GLOSSARY: Setup Guide, Business Function): a Member's two steps, About
// you and Ways in and out. Owners and Admins have none and are sent on to where the step they asked for lives now; a Guest
// and the demo go to the app. Only the viewer's own steps and what they may answer are read: the Workspace's answers
// read-only, and never another person's function.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { setupGuide, markSetupGuideSeen } from "@ziffr/core/setup-guide";
import { SETUP_STEPS, type SetupStepId } from "@ziffr/core/setup-steps";
import { workspaceProfile } from "@ziffr/core/workspace-settings";
import { myBusinessFunction } from "@ziffr/core/business-function";
import { INDUSTRY_LABEL, REVENUE_LABEL, SEGMENT_LABEL, type WorkspaceProfile } from "@ziffr/core/workspace-profile";
import { waysInAndOut } from "@ziffr/core/ways-in-and-out";
import { managersSetupTarget } from "@/lib/home-redirect";
import { StepBar } from "./step-bar";
import { STEP_INFO } from "./step-info";
import { AboutYouMember } from "./about-you";
import { WaysInAndOutStep } from "./ways";
import { PhoneNoteGate } from "./phone-note";

const countryName = (c: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;

/** What a Member may read of the Workspace's answers, in words. */
function answersOf(p: WorkspaceProfile): { label: string; value: string }[] {
  const people = (b: string) => (b === "1000+" ? "More than 1,000" : b.replace("-", " to "));
  return [
    p.industry && { label: "What it does", value: INDUSTRY_LABEL[p.industry] },
    p.segment && { label: "Who it sells to", value: SEGMENT_LABEL[p.segment] },
    p.country && { label: "Where it is based", value: countryName(p.country) },
    p.employeeBand && { label: "People", value: people(p.employeeBand) },
    p.revenueBand && { label: "Revenue in a year", value: `${REVENUE_LABEL[p.revenueBand]}${p.currency ? ` ${p.currency}` : ""}` },
  ].filter((x): x is { label: string; value: string } => Boolean(x));
}

/** The page. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  // The demo never has a guide: its guided steps are the tour's.
  if (await isDemo()) redirect("/");
  const actor = await currentActor();
  const asked = (await searchParams).step;
  // Owners and Admins have no guide. The address is only compared with two fixed words: nothing from it is followed.
  if (actor.role === "owner" || actor.role === "admin") redirect(managersSetupTarget(asked));
  const guide = await setupGuide(actor);
  // A Guest has none; so does anyone for whom the core says there is no guide.
  if (!guide) redirect("/");
  // The person's first look is noted: Home leads here only until then.
  await markSetupGuideSeen(actor);
  const ids = guide.steps.map((s) => s.id);
  const current: SetupStepId = (SETUP_STEPS as readonly string[]).includes(asked ?? "") ? (asked as SetupStepId) : (guide.next ?? ids[0]);
  const info = STEP_INFO[current];

  let body: React.ReactNode;
  if (current === "about") {
    const [fn, profile] = await Promise.all([myBusinessFunction(actor), workspaceProfile(actor)]);
    body = <AboutYouMember answers={answersOf(profile)} businessFunction={fn} following="ways" />;
  } else {
    body = <WaysInAndOutStep data={await waysInAndOut(actor)} following={null} />;
  }

  // The phone note comes once, before step 1, for someone who has not done or skipped About you yet.
  const first = current === "about" && guide.steps.some((s) => s.id === "about" && !s.ticked && !s.skipped);
  return (
    <PhoneNoteGate first={first}>
      <PageHeader title="Set up your account" sub="Two short steps. Each can be skipped, and you can go to Ziffr at any time.">
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>Go to Ziffr</Link>
      </PageHeader>
      <div className="max-w-3xl">
        <StepBar steps={guide.steps} current={current} />
        <section aria-labelledby="step-heading">
          <h2 id="step-heading" tabIndex={-1} className="text-lg font-medium">{info.label}</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">{info.intro}</p>
          {body}
        </section>
      </div>
    </PhoneNoteGate>
  );
}
