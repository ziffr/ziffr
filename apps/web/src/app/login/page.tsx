// The sign-in page (GLOSSARY: Installation, Trial Workspace): one plain form, the same on every Installation (#759).
// Where this Ziffr offers trials, one line says that a new address gets an account; elsewhere there is no sign-up
// wording at all. The demo, where it is on, is one small link below the card.
import { redirect } from "next/navigation";
import { demoOnly, sessionUser } from "@/lib/auth";
import { enabledProviders, PROVIDER_LABEL } from "@/lib/sign-in";
import { buttonVariants } from "@/components/ui/button";
import { AuthHeading, AuthNotice, AuthShell } from "@/components/auth-shell";
import { cn } from "@/lib/utils";
import { SignUpAgreement } from "@/components/legal-footer";
import { LoginForm } from "./form";
import { whatThisZiffrOffers } from "@ziffr/core/what-works-here";
import { trialsOpen } from "@ziffr/core/trials";
import { turnstileSiteKey } from "@/lib/turnstile";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";

/** The way into the shared demo. A plain link, so a full page load: /demo sets the cookie in the middleware, and the
 * root layout's header must be drawn again for it (#14). */
const DEMO_LINK = <a href="/demo" className="font-medium text-foreground underline underline-offset-4 hover:no-underline">Try the demo</a>;

/** Sign in, or start an account where trials are offered. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  if (await sessionUser()) redirect("/");
  // A public demo (ZIFFR_DEMO_ONLY=1): no sign-in, only the way in to the demo and to Ziffr itself.
  if (demoOnly()) {
    return (
      <AuthShell below={<>To use Ziffr with your own numbers, run it yourself: <a href="https://github.com/ziffr/ziffr" className="underline underline-offset-4 hover:text-foreground">github.com/ziffr/ziffr</a>.</>}>
        <AuthHeading title="Try Ziffr">Look around a made-up online shop. No account needed, and nothing you do there is saved.</AuthHeading>
        <a href="/demo" className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full")}>Try the demo</a>
      </AuthShell>
    );
  }
  const sp = await searchParams;
  const settings = await settingsInEffect();
  const offers = await whatThisZiffrOffers(settings);
  const siteKey = turnstileSiteKey(settings);
  // The form stays when trials are full: whoever has one already still signs in to it.
  const full = offers.trial ? !(await trialsOpen()) : false;
  return (
    <AuthShell below={offers.demo ? DEMO_LINK : undefined}>
      <AuthHeading title="Sign in to Ziffr">{offers.trial && !full ? "New here? The same link creates your account." : null}</AuthHeading>
      {sp.failed && <AuthNotice>That link did not work, or it was used already. Ask for a new one.</AuthNotice>}
      {full && <p role="status" className="mb-6 rounded-[var(--radius-input)] border border-border p-3 text-sm">All new trials are taken right now. If you have one already, sign in to it here.</p>}
      <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} turnstileSiteKey={siteKey} agreement={offers.trial && !full ? <SignUpAgreement /> : undefined} />
    </AuthShell>
  );
}
