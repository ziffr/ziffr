import { redirect } from "next/navigation";
import Link from "next/link";
import { demoEnabled, sessionUser } from "@/lib/auth";
import { enabledProviders, PROVIDER_LABEL } from "@/lib/sign-in";
import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  if (await sessionUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Sign in to Ziffr</h1>
      <p className="mt-2 text-sm text-muted-foreground">One home for your team&rsquo;s numbers.</p>
      {sp.failed && <p className="mt-4 rounded-[var(--radius-input)] border border-destructive p-3 text-sm">That link did not work, or it was used already. Ask for a new one.</p>}
      <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} />
      {demoEnabled() && (
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">No account? Look around a made-up online shop first. Nothing you do there reaches real data.</p>
          {/* A plain link: /demo sets the cookie in the middleware, no JavaScript needed. */}
          <Link href="/demo" prefetch={false} className="mt-3 inline-flex h-9 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">Try the demo</Link>
        </div>
      )}
    </div>
  );
}
