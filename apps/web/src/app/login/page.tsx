import { redirect } from "next/navigation";
import { demoEnabled, demoOnly, sessionUser } from "@/lib/auth";
import { enabledProviders, PROVIDER_LABEL } from "@/lib/sign-in";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoginForm } from "./form";
import { DemoColumn, TrialColumn } from "./choices";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { trialsOpen } from "@ziffr/core/trials";
import { turnstileSiteKey } from "@/lib/turnstile";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  if (await sessionUser()) redirect("/");
  // A public demo (ZIFFR_DEMO_ONLY=1): no sign-in, only the way in to the demo and to Ziffr itself.
  if (demoOnly()) {
    return (
      <div className="mx-auto mt-16 max-w-sm">
        <h1 className="text-[length:var(--text-2xl)] leading-tight">Try Ziffr</h1>
        <p className="mt-2 text-sm text-muted-foreground">A metric tracker for anyone.</p>
        <p className="mt-6 text-sm">Look around a made-up online shop: its metrics, dashboards, Workflows and decks. No account needed. Everyone who visits shares it, and it starts fresh every night, so keep real numbers out.</p>
        {/* A plain link, so a full page load: /demo sets the cookie in the middleware, and the root layout's header must be drawn again for it (#14). */}
        <a href="/demo" className={cn(buttonVariants({ variant: "default" }), "mt-4")}>Try the demo</a>
        <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
          To use Ziffr with your own numbers, run it yourself: <a href="https://github.com/ziffr/ziffr" className="underline underline-offset-2 hover:text-foreground">github.com/ziffr/ziffr</a>.
        </p>
      </div>
    );
  }
  const sp = await searchParams;
  // A Ziffr that offers trials (spec 0021) shows them next to the demo, with what each can and cannot do.
  const offers = await whatThisZiffrOffers();
  if (offers.trial) {
    return (
      <div className="mx-auto mt-12 max-w-4xl">
        <h1 className="text-[length:var(--text-2xl)] leading-tight">Try Ziffr</h1>
        <p className="mt-2 text-sm text-muted-foreground">A metric tracker for anyone.</p>
        {sp.failed && <p className="mt-4 rounded-[var(--radius-input)] border border-destructive p-3 text-sm">That link did not work, or it was used already. Ask for a new one.</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TrialColumn days={offers.trial.days} ways={offers.trial.ways} open={await trialsOpen()}>
            <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} turnstileSiteKey={turnstileSiteKey()} />
          </TrialColumn>
          {offers.demo && <DemoColumn />}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Sign in to Ziffr</h1>
      <p className="mt-2 text-sm text-muted-foreground">A metric tracker for anyone.</p>
      {sp.failed && <p className="mt-4 rounded-[var(--radius-input)] border border-destructive p-3 text-sm">That link did not work, or it was used already. Ask for a new one.</p>}
      <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} turnstileSiteKey={turnstileSiteKey()} />
      {demoEnabled() && (
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">No account? Look around a made-up online shop first. Nothing you do there reaches real data.</p>
          {/* A plain link, so a full page load: /demo sets the cookie in the middleware, and the root layout's header must be drawn again for it (#14). */}
          <a href="/demo" className="mt-3 inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Try the demo</a>
        </div>
      )}
    </div>
  );
}
