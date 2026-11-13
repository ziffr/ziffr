import { redirect } from "next/navigation";
import { isDemo, sessionUser } from "@/lib/auth";
import { enabledProviders, PROVIDER_LABEL } from "@/lib/sign-in";
import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; failed?: string }> }) {
  if (isDemo()) redirect("/");
  if (await sessionUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Sign in to Ziffr</h1>
      <p className="mt-2 text-sm text-muted-foreground">One home for your team&rsquo;s numbers.</p>
      {sp.failed && <p className="mt-4 rounded-[var(--radius-input)] border border-destructive p-3 text-sm">That link did not work, or it was used already. Ask for a new one.</p>}
      <LoginForm next={sp.next} providers={enabledProviders().map((p) => ({ id: p, label: PROVIDER_LABEL[p] }))} />
    </div>
  );
}
