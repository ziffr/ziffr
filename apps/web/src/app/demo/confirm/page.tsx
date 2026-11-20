// The step into the demo for someone signed in (spec 0009, ticket #130; GLOSSARY: Demo Mode): a link to /demo leads
// here, and only this page's button starts the visit. Nothing done in the demo is saved (#271), so a signed-in person
// should know they are leaving their own workspace before they try anything there.
import Link from "next/link";
import { redirect } from "next/navigation";
import { demoEnabled } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";

export default async function DemoConfirmPage() {
  if (!(await demoEnabled())) redirect("/");
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Open the demo?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The demo is a made-up online shop that every visitor shares. You can look around as any of its people, but
        nothing you do there is saved: your own numbers belong in your own workspace.
      </p>
      {/* A plain form: the middleware starts the visit only for a POST from this app's own pages. */}
      <form method="post" action="/demo" className="mt-6 flex flex-wrap gap-2">
        <button type="submit" className={buttonVariants()}>Open the demo</button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>Stay in my workspace</Link>
      </form>
    </div>
  );
}
