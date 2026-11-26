// The Setup Guide's page (spec 0052, ticket 3; GLOSSARY: Setup Guide, Workspace Profile, Business Function): the shell with
// its step bar and the About you step. Owners and Admins see five steps and Members two; a Guest and the demo have none
// and go on to the app. Steps that are not built yet say what they will do. Only the viewer's own steps and what they
// may answer are read: a Member gets the Workspace's answers read-only and never another person's function.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { setupGuide, markSetupGuideSeen, startSetupGuide } from "@ziffr/core/setup-guide";
import { SETUP_STEPS, type SetupStepId } from "@ziffr/core/setup-steps";
import { workspaceProfile } from "@ziffr/core/workspace-settings";
import { workspaceClock } from "@ziffr/core/workspace-clock";
import { yearStartChoices } from "@ziffr/core/fiscal-year";
import { myBusinessFunction } from "@ziffr/core/business-function";
import { COUNTRIES, INDUSTRY_LABEL, REVENUE_LABEL, SEGMENT_LABEL, type WorkspaceProfile } from "@ziffr/core/workspace-profile";
import { BUSINESS_FUNCTION_LABELS } from "@ziffr/pack/business-functions";
import { StepBar } from "./step-bar";
import { STEP_INFO } from "./step-info";
import { AboutYouMember, AboutYouWorkspace } from "./about-you";
import { StartingPoint } from "./starting-point";
import { recommendedPacks } from "@ziffr/core/included-packs";
import { metricsOfLimit } from "@ziffr/core/workspace-usage";
import { trialEndsAt } from "@ziffr/core/trials";
import { getNumberStyle } from "@/lib/data";
import { waysInAndOut } from "@ziffr/core/ways-in-and-out";
import { SLACK_OUTCOMES } from "@/lib/slack-back";
import { WaysInAndOutStep } from "./ways";
import { firstMetricStep } from "@ziffr/core/setup-first-metric";
import { FirstMetricStepView } from "./first-metric";
import { teamSetup } from "@ziffr/core/team-setup";
import { joinDomainOffer } from "@ziffr/core/invitations";
import { signedIn } from "@/lib/auth";
import { TeamStep } from "./team";
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
/** What "Add to Slack" came to, in words; only the outcomes the core names are shown, never anything from the address. */
const SLACK_NOTICE: Record<(typeof SLACK_OUTCOMES)[number], string> = {
  connected: "Slack is connected.", cancelled: "Slack was not connected.", refused: "That did not work: press Add to Slack again.",
  elsewhere: "That Slack workspace is already connected to another Ziffr workspace.", org_install: "Connect one Slack workspace, not a whole Enterprise organisation.",
  failed: "Slack did not answer as expected. Try again in a moment.",
};

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; slack?: string }> }) {
  // The demo never has a guide: its guided steps are the tour's.
  if (await isDemo()) redirect("/");
  const actor = await currentActor();
  const guide = await setupGuide(actor);
  // A Guest has none; so does anyone for whom the core says there is no guide.
  if (!guide) redirect("/");
  // Opening it is asking for it: a Workspace made before the guide gets its row, and the person's first look is noted.
  await startSetupGuide(actor);
  await markSetupGuideSeen(actor);
  const ids = guide.steps.map((s) => s.id);
  const query = await searchParams;
  const asked = query.step;
  const current: SetupStepId = (SETUP_STEPS as readonly string[]).includes(asked ?? "") && ids.includes(asked as SetupStepId) ? (asked as SetupStepId) : (guide.next ?? ids[0]);
  const following = ids[Math.min(ids.indexOf("about") + 1, ids.length - 1)];
  const info = STEP_INFO[current];
  const manages = actor.role === "owner" || actor.role === "admin";

  let body: React.ReactNode;
  if (current === "about") {
    const [fn, profile] = await Promise.all([myBusinessFunction(actor), workspaceProfile(actor)]);
    if (manages) {
      const [clock, year] = await Promise.all([workspaceClock(actor), yearStartChoices(actor)]);
      const countries = COUNTRIES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "en"));
      body = <AboutYouWorkspace profile={profile} countries={countries} timeZone={clock.timeZone} runHour={clock.runHour} weekStart={clock.weekStart} yearStart={year.yearStart} allowedMonths={year.allowed} whyMonths={year.why} businessFunction={fn} following={following} />;
    } else {
      body = <AboutYouMember answers={answersOf(profile)} businessFunction={fn} following={following} />;
    }
  } else if (current === "start") {
    const [packs, usage, trial, numberStyle, fn] = await Promise.all([recommendedPacks(actor), metricsOfLimit(actor), trialEndsAt(actor.workspaceId), getNumberStyle(), myBusinessFunction(actor)]);
    const step = guide.steps.find((x) => x.id === "start");
    // A trial's Starting point is ticked by itself, so the step has nothing to ask; the Packs may still be installed.
    body = <StartingPoint packs={packs} startingPoint={guide.startingPoint} metrics={usage.metrics} firstMetric={guide.firstMetric} trial={Boolean(trial)} isOwner={actor.role === "owner"} viewer={actor.personId} numberStyle={numberStyle} functionLabel={fn ? BUSINESS_FUNCTION_LABELS[fn] : null} following={ids[Math.min(ids.indexOf("start") + 1, ids.length - 1)]} ticked={Boolean(step?.ticked)} />;
  } else if (current === "ways") {
    const slack = (SLACK_OUTCOMES as readonly string[]).includes(query.slack ?? "") ? SLACK_NOTICE[query.slack as (typeof SLACK_OUTCOMES)[number]] : null;
    body = <WaysInAndOutStep data={await waysInAndOut(actor)} following={ids[ids.indexOf("ways") + 1] ?? null} notice={slack} />;
  } else if (current === "first_metric") {
    body = <FirstMetricStepView step={await firstMetricStep(actor)} following={ids[ids.indexOf("first_metric") + 1] ?? null} />;
  } else if (current === "team") {
    // Only Owners and Admins have this step, so the loader (which carries Business Functions) is never called for anyone else.
    body = <TeamStep data={await teamSetup(actor)} domainOffer={actor.role === "owner" ? joinDomainOffer((await signedIn())?.verifiedEmail) : null} />;
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-sm">{info.willDo}</p>
        <p className="text-sm text-muted-foreground">This step comes next. Until then, the rest of Ziffr works without it.</p>
        <Link href="/setup?step=about" className={buttonVariants({ variant: "outline" })}>Back to About you</Link>
      </div>
    );
  }

  // The phone note comes once, before step 1, for someone who has not done or skipped About you yet (a trial ticks Starting point by itself, so only step 1 counts).
  const first = current === "about" && guide.steps.some((s) => s.id === "about" && !s.ticked && !s.skipped);
  return (
    <PhoneNoteGate first={first}>
      <PageHeader title="Set up your Workspace" sub="A few short steps. Every one can be skipped, and you can go to Ziffr at any time.">
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>Go to Ziffr</Link>
      </PageHeader>
      <div className="max-w-3xl">
        <StepBar steps={guide.steps} current={current} />
        <section aria-labelledby="step-heading">
          <h2 id="step-heading" tabIndex={-1} className="text-lg font-medium">{current === "about" ? (manages ? "About you and your business" : "About you") : info.label}</h2>
          {current === "about" && <p className="mb-4 mt-1 text-sm text-muted-foreground">{manages ? "So we can suggest Metrics and Packs that fit. Every question is optional." : "So we can suggest what fits your work. Every question is optional."}</p>}
          {current !== "about" && (info.intro ? <p className="mb-4 mt-1 text-sm text-muted-foreground">{info.intro}</p> : <div className="mb-4" />)}
          {body}
        </section>
      </div>
    </PhoneNoteGate>
  );
}
