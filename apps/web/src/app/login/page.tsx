import { redirect } from "next/navigation";
import { demoOnly, sessionUser } from "@/lib/auth";
import { enabledProviders, PROVIDER_LABEL } from "@/lib/sign-in";
import { buttonVariants } from "@/components/ui/button";
import { AuthHeading, AuthNotice, AuthShell } from "@/components/auth-shell";
import { cn } from "@/lib/utils";
import { LoginForm } from "./form";
import { DemoChoice, TrialIntro } from "./choices";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { trialsOpen } from "@ziffr/core/trials";
import { turnstileSiteKey } from "@/lib/turnstile";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  if (await sessionUser()) redirect("/");
  // A public demo (ZIFFR_DEMO_ONLY=1): no sign-in, only the way in to the demo and to Ziffr itself.
  if (demoOnly()) {
    return (
      <AuthShell>
        <AuthHeading title="Try Ziffr">The record of your numbers.</AuthHeading>
        <p className="text-sm">Look around a made-up online shop: its metrics, dashboards, Workflows and decks. No account needed. Switch between its people to see what each one sees; nothing you do there is saved.</p>
        {/* A plain link, so a full page load: /demo sets the cookie in the middleware, and the root layout's header must be drawn again for it (#14). */}
        <a href="/demo" className={cn(buttonVariants({ variant: "default" }), "mt-4 w-full")}>Try the demo</a>
        <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
          To use Ziffr with your own numbers, run it yourself: <a href="https://github.com/ziffr/ziffr" className="underline underline-offset-2 hover:text-foreground">github.com/ziffr/ziffr</a>.
        </p>
      </AuthShell>
    );
  }
  const sp = await searchParams;
  // A Ziffr that offers trials (spec 0021) shows them with the form, and the demo below it, with what each can and cannot do.
  const settings = await settingsInEffect();
  const offers = await whatThisZiffrOffers(settings);
  const siteKey = turnstileSiteKey(settings);
  const form = <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} turnstileSiteKey={siteKey} />;
  const failed = sp.failed && <AuthNotice>That link did not work, or it was used already. Ask for a new one.</AuthNotice>;
  if (offers.trial) {
    return (
      <AuthShell>
        <AuthHeading title="Try Ziffr">The record of your numbers.</AuthHeading>
        {failed}
        <TrialIntro days={offers.trial.days} ways={offers.trial.ways} open={await trialsOpen()} />
        {form}
        {offers.demo && <DemoChoice detailed />}
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <AuthHeading title="Sign in to Ziffr">The record of your numbers.</AuthHeading>
      {failed}
      {form}
      {offers.demo && <DemoChoice detailed={false} />}
    </AuthShell>
  );
}
